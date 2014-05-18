/*
 * grunt-aws-s3
 * https://github.com/MathieuLoutre/grunt-aws-s3
 *
 * Copyright (c) 2013 Mathieu Triay
 * Licensed under the MIT license.
 */

'use strict';

var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var AWS = require('aws-sdk');
var mime = require('mime');
var _ = require('lodash');
var async = require('async');
var zlib = require('zlib');

require('setimmediate'); // For compatibility with Node 0.8.x

module.exports = function (grunt) {

	grunt.registerMultiTask('aws_s3', 'Interact with AWS S3 using the AWS SDK', function () {

		var done = this.async();

		var options = this.options({
			access: 'public-read',
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			uploadConcurrency: 1,
			downloadConcurrency: 1,
			mime: {},
			params: {},
			debug: false,
			mock: false,
			differential: false,
			stream: false,
			displayChangesOnly: false,
            gzip: true
		});

		// To deprecate
		if (options.concurrency !== undefined) {
			grunt.log.writeln("The concurrency option is deprecated, use uploadConcurrency instead\n".yellow);
			options.uploadConcurrency = options.concurrency;
		}

		var filePairOptions = {
			differential: options.differential, 
			stream: options.stream,
            gzip: options.gzip,
			flipExclude: false, 
			exclude: false 
		};

		// Replace the AWS SDK by the mock package if we're testing
		if (options.mock) {
			AWS = require('mock-aws-s3');
		}

		// List of acceptable params for an upload
		var put_params = ['CacheControl', 'ContentDisposition', 'ContentEncoding',
			'ContentLanguage', 'ContentLength', 'ContentMD5', 'Expires', 'GrantFullControl',
			'GrantRead', 'GrantReadACP', 'GrantWriteACP', 'Metadata', 'ServerSideEncryption',
			'StorageClass', 'WebsiteRedirectLocation', 'ContentType'];

		// Checks that all params are in put_params
		var isValidParams = function (params) {

			return _.every(_.keys(params), function (key) { 
				return _.contains(put_params, key); 
			});
		};

		var getObjectURL = function (file) {

			file = file || '';
			return s3.endpoint.href + options.bucket + '/' + file;
		};

		// Get the key URL relative to a path string 
		var getRelativeKeyPath = function (key, dest) {

			var path;

			if (_.last(dest) === '/') {
				// if the path string is a directory, remove it from the key
				path = key.replace(dest, '');
			}
			else if (key.replace(dest, '') === '') {
				path = _.last(key.split('/'));
			}
			else {
				path = key;
			}

			return path;
		};

		var hashFile = function (options, callback) {
            var hash = crypto.createHash('md5');

            function getHashString() {
                // S3's ETag has quotes around it...
                return '"' + hash.digest('hex') + '"';
            }

            if (options.stream) {
				var local_stream = fs.ReadStream(options.file_path);
                if (options.gzip) {
                    local_stream = local_stream.pipe(zlib.createGzip());
                }

				local_stream.on('end', function () {
					callback(null, getHashString());
				});

				local_stream.on('error', function (err) {
					callback(err);
				});

				local_stream.on('data', function (data) {
					hash.update(data);
				});
			}
			else {
				var local_buffer = grunt.file.read(options.file_path, { encoding: null });

                var getHashStringForBuffer = function getHashStringForBuffer(buffer) {
                    hash.update(buffer);
                    return getHashString();
                };

                if (options.gzip) {
                    zlib.gzip(local_buffer, function(err, compressed) {
                        callback(err, err ? null : getHashStringForBuffer(compressed));
                    });
                } else {
                    callback(null, getHashStringForBuffer(local_buffer));
                }
			}
		};

		// Checks that local file is 'date_compare' than server file
		var checkFileDate = function (options, callback) {

			fs.stat(options.file_path, function (err, stats) {

				if (err) {
					callback(err);
				}
				else {
					var local_date = new Date(stats.mtime).getTime();
					var server_date = new Date(options.server_date).getTime();

					if (options.compare_date === 'newer') {
						callback(null, local_date > server_date);
					}
					else {
						callback(null, local_date < server_date);
					}
				}
			});
		};

		var isFileDifferent = function (options, callback) {
			
			hashFile(options, function (err, md5_hash) {

				if (err) {
					callback(err);
				}
				else {
					if (md5_hash === options.server_hash) {
						callback(null, false);
					}
					else {
						if (options.server_date) {
							options.compare_date = options.compare_date || 'older';
							checkFileDate(options, callback);
						}
						else {
							callback(null, true);
						}
					}
				}
			});
		};

		if (!options.accessKeyId && !options.mock) {
			grunt.warn("Missing accessKeyId in options");
		}

		if (!options.secretAccessKey && !options.mock) {
			grunt.warn("Missing secretAccessKey in options");
		}

		if (!options.bucket) {
			grunt.warn("Missing bucket in options");
		}

		var s3_options = {
			bucket: options.bucket,
			accessKeyId: options.accessKeyId,
			secretAccessKey: options.secretAccessKey
		};

		if (!options.region) {
			grunt.log.writeln("No region defined. S3 will default to US Standard\n".yellow);
		} else {
			s3_options.region = options.region;
		}

		if (options.params) {
			if (!isValidParams(options.params)) {
				grunt.warn('"params" can only be ' + put_params.join(', '));
			}
		}

		// Allow additional (not required) options
		_.extend(s3_options, _.pick(options, ['maxRetries', 'sslEnabled', 'httpOptions']));

		var s3 = new AWS.S3(s3_options);

		var dest;
		var is_expanded;
		var objects = [];
		var uploads = [];

		// Because Grunt expands the files array automatically, 
		// we need to group the uploads together to make the difference between actions.
		var pushUploads = function() {

			if (uploads.length > 0) {
				objects.push({action: 'upload', files: uploads});
				uploads = [];
			}
		};

		this.files.forEach(function (filePair) {

			is_expanded = filePair.orig.expand || false;

			if (filePair.action === 'delete') {

				_.defaults(filePair, filePairOptions);

				if (!filePair.dest) {
					grunt.fatal('No "dest" specified for deletion. No need to specify a "src"');
				}
				else if (filePair.differential && !filePair.cwd) {
					grunt.fatal('Differential delete needs a "cwd"');
				}

				pushUploads();

				filePair.dest = (filePair.dest === '/') ? '' : filePair.dest;
				
				objects.push(filePair);
			}
			else if (filePair.action === 'download') {

				if (is_expanded) {
					grunt.fatal('You cannot expand the "src" for downloads');
				}
				else if (!filePair.dest) {
					grunt.fatal('No "dest" specified for downloads');
				}
				else if (!filePair.cwd || filePair.src) {
					grunt.fatal('Specify a "cwd" but not a "src" for downloads');
				}

				pushUploads();

				filePair.dest = (filePair.dest === '/') ? '' : filePair.dest;

				objects.push(_.defaults(filePair, filePairOptions));
			}
			else {

				if (filePair.params && !isValidParams(filePair.params)) {
					grunt.warn('"params" can only be ' + put_params.join(', '));
				}
				else {
					filePair.params = _.defaults(filePair.params || {}, options.params);
					_.defaults(filePair, filePairOptions);

					filePair.src.forEach(function (src) {

						// Prevents creating empty folders
						if (!grunt.file.isDir(src)) {

							if (_.last(filePair.dest) === '/') {
								dest = (is_expanded) ? filePair.dest : unixifyPath(path.join(filePair.dest, src));
							} 
							else {
								dest = filePair.dest;
							}

							// '.' means that no dest path has been given (root). Nothing to create there.
							if (dest !== '.') {

								uploads.push(_.defaults({
									need_upload: true,
									src: src, 
									dest: dest
								}, filePair));
							}
						}
					});
				}
			}
		});

		pushUploads();

		// Will list *all* the content of the bucket given in options
		// Recursively requests the bucket with a marker if there's more than
		// 1000 objects. Ensures uniqueness of keys in the returned list. 
		var listObjects = function (prefix, callback, marker, contents) {

			var search = {
				Prefix: prefix, 
				Bucket: options.bucket
			};

			if (marker) {
				search.Marker = marker;
			}

			s3.listObjects(search, function (err, list) { 

				if (!err) {

					var objects = (contents) ? contents.concat(list.Contents) : list.Contents;

					if (list.IsTruncated) {
						var new_marker = _.last(list.Contents).Key;
						listObjects(prefix, callback, new_marker, objects);
					}
					else {
						callback(_.uniq(objects, function (o) { return o.Key; }));
					}
				}
				else {
					grunt.fatal('Failed to list content of bucket ' + options.bucket + '\n' + err);
				}
			});
		};

		var deleteObjects = function (task, callback) {

			grunt.log.writeln('Deleting the content of ' + getObjectURL(task.dest).cyan);

			// List all the objects using dest as the prefix
			listObjects(task.dest, function (to_delete) {

				// List local content if it's a differential task
				var local_files = (task.differential) ? grunt.file.expand({ cwd: task.cwd }, ["**"]) : [];

				_.each(to_delete, function (o) {

					o.need_delete = true;
					o.excluded = task.exclude && grunt.file.isMatch(task.exclude, o.Key);

					if (task.exclude && task.flipExclude) {
						o.excluded = !o.excluded;
					}

					if (task.differential && !o.excluded) {
						// Exists locally or not (remove dest in the key to get the local path)
						o.need_delete = local_files.indexOf(getRelativeKeyPath(o.Key, task.dest)) === -1;
					}
				});

				// Just list what needs to be deleted so it can be sliced if necessary
				var delete_list = _.filter(to_delete, function (o) { return o.need_delete && !o.excluded; });

				if (options.debug) {
					callback(null, to_delete);
				}
				else if (delete_list.length > 0) {

					// deleteObjects requests can only take up to 1000 keys
					// If we are deleting more than a 1000 objects, we need slices
					var slices = Math.ceil(delete_list.length/1000);
					var errors = [];
					var failed = [];
					var deleted = [];
					var calls = 0;

					var end = function (err, data) {

						if (err) {
							errors.push(err);
							data = data || {};
							failed = failed.concat(data.Errors || []);
						}
						else {
							deleted = deleted.concat(data.Deleted);
							grunt.log.write('.'.green);
						}

						if (++calls === slices) {
							if (errors.length > 0) {
								callback(JSON.stringify(errors), failed);
							}
							else {
								callback(null, to_delete);
							}
						}
					};

					var deleteSlice = function (i) {

						var start = 1000 * i;
						var slice = {
							Objects: _.map(delete_list.slice(start, start + 1000), function (o) { return { Key: o.Key }; })
						};

						s3.deleteObjects({ Delete: slice, Bucket: options.bucket }, function (err, data) { end(err, data); });
					};

					for (var i = 0; i < slices; i++) {
						deleteSlice(i);
					}
				}
				else {
					callback(null, (to_delete.length > 0) ? to_delete : null);
				}
			});
		};

		var doDownload = function (object, callback) {

			if (options.debug || !object.need_download || object.excluded) {
				callback(null, false);
			}
			else if (object.stream) {
				grunt.file.mkdir(path.dirname(object.dest));

				var stream = fs.createWriteStream(object.dest);
				var s3_object = s3.getObject({ Key: object.Key, Bucket: options.bucket }).createReadStream();

				stream.on('finish', function () {
					callback(null, true);
				});

				s3_object.on('error', function (err) {
					callback(err);
				});

				stream.on('error', function (err) {
					callback(err);
				});

				s3_object.pipe(stream);
			}
			else {
				s3.getObject({ Key: object.Key, Bucket: options.bucket }, function (err, data) {
					if (err) {
						callback(err);
					}
					else {
						grunt.file.write(object.dest, data.Body);
						callback(null, true);
					}
				});
			}
		};

		var downloadObjects = function (task, callback) {

			grunt.log.writeln('Downloading the content of ' + getObjectURL(task.dest).cyan + ' to ' + task.cwd.cyan);

			// List all the objects using dest as the prefix
			listObjects(task.dest, function (to_download) {

				// List local content if it's a differential task
				var local_files = (task.differential) ? grunt.file.expand({ cwd: task.cwd }, ["**"]) : [];

				if (to_download.length === 0) {
					callback(null, null);
				}
				else {

					var download_queue = async.queue(function (object, downloadCallback) {

						var key = getRelativeKeyPath(object.Key, task.dest); // Remove the dest in the key to not duplicate the path with cwd
						object.dest = task.cwd + key;
						object.stream = task.stream;
						object.need_download = _.last(object.dest) !== '/'; // no need to write directories
						object.excluded = task.exclude && grunt.file.isMatch(task.exclude, object.Key);
                        object.gzip = task.gzip;

						if (task.exclude && task.flipExclude) {
							object.excluded = !object.excluded;
						}

						if (task.differential && object.need_download && !object.excluded) {
							var local_index = local_files.indexOf(key);

							// If file exists locally we need to check if it's different
							if (local_index !== -1) {
								
								// Check md5 and if file is older than server file
								var check_options = { 
									file_path: object.dest, 
									server_hash: object.ETag, 
									server_date: object.LastModified, 
									date_compare: 'older',
                                    gzip: object.gzip
								};

								isFileDifferent(check_options, function (err, different) {
									if (err) {
										downloadCallback(err);
									}
									else {
										object.need_download = different;
										setImmediate(doDownload, object, downloadCallback);
									}
								});
							}
							else {
								setImmediate(doDownload, object, downloadCallback);
							}
						}
						else {
							setImmediate(doDownload, object, downloadCallback);
						}

					}, options.downloadConcurrency);

					download_queue.drain = function () {

						callback(null, to_download);
					};

					download_queue.push(to_download, function (err, downloaded) {

						if (err) {
							grunt.fatal('Failed to download ' + getObjectURL(this.data.Key) + '\n' + err);
						}
						else {
							var dot = (downloaded) ? '.'.green : '.'.yellow;
							grunt.log.write(dot);
						}
					});
				}
			});
		};

		var doUpload = function (object, callback) {

			if (object.need_upload && !options.debug) {

				var type = options.mime[object.src] || object.params.ContentType || mime.lookup(object.src);
				var upload = _.defaults({
					ContentType: type,
					Key: object.dest,
					Bucket: options.bucket,
					ACL: options.access
				}, object.params);

                if (object.gzip) {
                    upload.ContentEncoding = 'gzip';
                }

                var wrapped_callback = function() {
                    s3.putObject(upload, function (err) {
                        callback(err, true);
                    });
                };

				if (object.stream) {
					var file_stream = fs.createReadStream(object.src);
                    if (object.gzip) {
                        // Can't use putObject with gzip stream - need to know length in advance

                        var chunks = [];
                        file_stream = file_stream.pipe(zlib.createGzip());
                        file_stream.on('data', function(chunk) {
                            chunks.push(chunk);
                        });
                        file_stream.on('end', function() {
                            upload.Body = Buffer.concat(chunks);
                            wrapped_callback();
                        });
                    } else {
                        upload.Body = file_stream;
                        wrapped_callback();
                    }
				}
				else {
                    var file_contents = grunt.file.read(object.src, { encoding: null });;
                    if (object.gzip) {
                        zlib.gzip(file_contents, function(err, compressed) {
                            if (err) {
                                callback(err);
                            } else {
                                upload.Body = compressed;
                                wrapped_callback();
                            }
                        });
                    } else {
                        upload.Body = file_contents;
                        wrapped_callback();
                    }
				}

			}
			else {
				callback(null, false);
			}
		};

		var uploadObjects = function (task, callback) {

			grunt.log.writeln('Uploading to ' + getObjectURL(task.dest).cyan);

			var startUploads = function (server_files) {

				var upload_queue = async.queue(function (object, uploadCallback) {

					var server_file = _.where(server_files, { Key: object.dest })[0];

					if (server_file && object.differential) {

						isFileDifferent(
                            { file_path: object.src, server_hash: server_file.ETag, gzip: object.gzip },
                            function (err, different) {
							    object.need_upload = different;
							    setImmediate(doUpload, object, uploadCallback);
						    }
                        );
					}
					else {
						setImmediate(doUpload, object, uploadCallback);
					}

				}, options.uploadConcurrency);

				upload_queue.drain = function () {

					callback(null, task.files);
				};

				upload_queue.push(task.files, function (err, uploaded) {

					if (err) {
                        console.log(JSON.stringify(err, null, 4));
						grunt.fatal('Failed to upload ' + this.data.src + ' with bucket ' + options.bucket + '\n' + err);
					}
					else {
						var dot = (uploaded) ? '.'.green : '.'.yellow;
						grunt.log.write(dot);
					}
				});
			};

			// If some of these files require differential upload we list
			// the content of the bucket for later checks
			if (_.some(task.files, function (o) { return o.differential; })) {
				listObjects('', function (objects) { startUploads(objects); });
			}
			else {
				startUploads([]);
			}
		};

		var queue = async.queue(function (task, callback) {

			if (task.action === 'delete') {
				deleteObjects(task, callback);
			}
			else if (task.action === 'download') {
				downloadObjects(task, callback);
			}
			else {
				uploadObjects(task, callback);
			}
		}, 1);

		queue.drain = function () {

			_.each(objects, function (o) {

				if (o.action === "delete") {
					grunt.log.writeln(o.deleted.toString().green + '/' + o.nb_objects.toString().green + ' objects deleted from ' + (options.bucket + '/' + o.dest).green);
				}
				else if (o.action === "download") {
					grunt.log.writeln(o.downloaded.toString().green + '/' + o.nb_objects.toString().green + ' objects downloaded from ' + (options.bucket + '/' + o.dest).green + ' to ' + o.cwd.green);
				}
				else {
					grunt.log.writeln(o.uploaded.toString().green + '/' + o.nb_objects.toString().green + ' objects uploaded to bucket ' + (options.bucket + '/').green);
				}
			});

			if (options.debug) {
				grunt.log.writeln("\nThe debug option was enabled, no changes have actually been made".yellow);
			}

			done();
		};

		queue.push(objects, function (err, res) {
			var object_url = getObjectURL(this.data.dest);

			if (this.data.action === 'delete') {
				if (err) {
					if (res && res.length > 0) {
						grunt.log.writeln('Errors (' + res.length.toString().red + ' objects): ' + _.pluck(res, 'Key').join(', ').red);
					}

					grunt.fatal('Deletion failed\n' + err.toString());
				}
				else {
					if (res && res.length > 0) {
						grunt.log.writeln('\nList: (' + res.length.toString().cyan + ' objects):');

						var deleted = 0;

						_.each(res, function (file) {

							if (file.need_delete && !file.excluded) {
								deleted++;
								grunt.log.writeln('- ' + file.Key.cyan);
							}
							else {
								var sign = (file.excluded) ? '! ' : '- ';
								grunt.log.writeln(sign + file.Key.yellow);
							}
						});

						this.data.nb_objects = res.length;
						this.data.deleted = deleted;
					}
					else {
						grunt.log.writeln('Nothing to delete');
						this.data.nb_objects = 0;
						this.data.deleted = 0;
					}
				}
			}
			else if (this.data.action === 'download') {
				if (err) {
					grunt.fatal('Download failed\n' + err.toString());
				}
				else {
					if (res && res.length > 0) {                        
						grunt.log.writeln('\nList: (' + res.length.toString().cyan + ' objects):');

						var task = this.data;
						var downloaded = 0;

						_.each(res, function (file) {

							if (file.need_download && !file.excluded) {
								downloaded++;
								grunt.log.writeln('- ' + getObjectURL(file.Key).cyan + ' -> ' + (task.cwd + getRelativeKeyPath(file.Key, task.dest)).cyan);
							}
							else {
								var sign = (file.excluded) ? ' =/= ' : ' === ';
								grunt.log.writeln('- ' + getObjectURL(file.Key).yellow + sign + (task.cwd + getRelativeKeyPath(file.Key, task.dest)).yellow);
							}
						});

						this.data.nb_objects = res.length;
						this.data.downloaded = downloaded || 0;
					}
					else {
						grunt.log.writeln('Nothing to download');
						this.data.nb_objects = 0;
						this.data.downloaded = 0;
					}
				}
			}
			else {
				if (err) {
					grunt.fatal('Upload failed\n' + err.toString());
				}
				else {
					grunt.log.writeln('\nList: (' + res.length.toString().cyan + ' objects):');

					var uploaded = 0;

					_.each(res, function (file) {

						if (file.need_upload) {
							uploaded++;
							grunt.log.writeln('- ' + file.src.cyan + ' -> ' + (object_url + file.dest).cyan);
						}
						else if (!options.displayChangesOnly) {
							grunt.log.writeln('- ' + file.src.yellow + ' === ' + (object_url + file.dest).yellow);
						}
					});

					this.data.nb_objects = res.length;
					this.data.uploaded = uploaded;
				}
			}

			grunt.log.writeln();
		});
	});

	var unixifyPath = function (filepath) {

		if (process.platform === 'win32') {
			return filepath.replace(/\\/g, '/');
		} 
		else {  
			return filepath;
		}
	};
};
