/*
 * grunt-aws-s3
 * https://github.com/MathieuLoutre/grunt-aws-s3
 *
 * Copyright (c) 2015 Mathieu Triay
 * Licensed under the MIT license.
 */

'use strict';

var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var AWS = require('aws-sdk');
var mime = require('mime-types');
var _ = require('lodash');
var async = require('async');
var Progress = require('progress');

module.exports = function (grunt) {

	grunt.registerMultiTask('aws_s3', 'Interact with AWS S3 using the AWS SDK', function () {

		var done = this.async();

		var options = this.options({
			access: 'public-read',
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			sessionToken: process.env.AWS_SESSION_TOKEN,
			uploadConcurrency: 1,
			downloadConcurrency: 1,
			copyConcurrency: 1,
			mime: {},
			params: {},
			debug: false,
			mock: false,
			differential: false,
			stream: false,
			displayChangesOnly: false,
			progress: 'dots',
			overwrite: true,
			changedFiles: 'aws_s3_changed'
		});

		// To deprecate
		if (options.concurrency !== undefined) {
			grunt.log.writeln("The concurrency option is deprecated, use uploadConcurrency instead\n".yellow);
			options.uploadConcurrency = options.concurrency;
		}

		var filePairOptions = {
			differential: options.differential, 
			stream: options.stream, 
			flipExclude: false, 
			exclude: false
		};

		// Replace the AWS SDK by the mock package if we're testing
		if (options.mock) {
			AWS = require('mock-aws-s3');
		}

		if (options.awsProfile) {
		  var credentials = new AWS.SharedIniFileCredentials({profile: options.awsProfile});
		  AWS.config.credentials = credentials;
		}

		if (['dots','progressBar','none'].indexOf(options.progress) < 0) {
			grunt.log.writeln('Invalid progress option; defaulting to dots\n'.yellow);
			options.progress = 'dots';
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
			return s3.endpoint.href + s3_options.bucket + '/' + file;
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

			if (options.stream) {
				var local_stream = fs.ReadStream(options.file_path);
				var hash = crypto.createHash('md5');

				local_stream.on('end', function () {
					// S3's ETag has quotes around it...
					callback(null, '"' + hash.digest('hex') + '"');
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
				callback(null, '"' + crypto.createHash('md5').update(local_buffer).digest('hex') + '"');
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

		var s3_options = {
			bucket: this.data.bucket || options.bucket,
			accessKeyId: this.data.accessKeyId || options.accessKeyId,
			secretAccessKey: this.data.secretAccessKey || options.secretAccessKey,
			sessionToken: this.data.sessionToken || options.sessionToken
		};
        
        if (!s3_options.bucket) {
			grunt.warn("Missing bucket in options");
		}

		if (!options.region) {
			grunt.log.writeln("No region defined. S3 will default to US Standard\n".yellow);
		} 
		else {
			s3_options.region = this.data.region || options.region;
		}

		if (options.endpoint) {
			s3_options.endpoint = this.data.endpoint || options.endpoint;
		}

		if (options.params) {
			if (!isValidParams(options.params)) {
				grunt.warn('"params" can only be ' + put_params.join(', '));
			}
		}

		// Allow additional (not required) options
		_.extend(s3_options, _.pick(options, ['maxRetries', 'sslEnabled', 'httpOptions', 'signatureVersion', 's3ForcePathStyle']));

		var s3 = new AWS.S3(s3_options);

		var dest;
		var is_expanded;
		var objects = [];
		var uploads = [];

		// Because Grunt expands the files array automatically, 
		// we need to group the uploads together to make the difference between actions.
		var pushUploads = function() {

			if (uploads.length > 0) {
				objects.push({ action: 'upload', files: uploads });
				uploads = [];
			}
		};

		var missingExpand = _.find(this.files, function(filePair) {
			return ! filePair.orig.expand			// expand not specified
				&& (! filePair.action || filePair.action == 'upload')	// upload request or default
				&& filePair.cwd;
		});

		if (missingExpand) {
			grunt.warn("File upload action has 'cwd' but is missing 'expand: true', src list will not expand!");
		}
		
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
			else if (filePair.action === 'copy') {

				if (is_expanded) {
					grunt.fatal('You cannot expand the "src" for copies');
				}
				else if (!filePair.dest) {
					grunt.fatal('No "dest" specified for copies');
				}
				else if (filePair.cwd || !filePair.src) {
					grunt.fatal('Specify a "src" but not a "cwd" for copies');
				}

				pushUploads();

				filePair.dest = (filePair.dest === '/') ? '' : filePair.dest;

				objects.push(_.defaults(filePair, filePairOptions));
			}
			else {

				if (!filePair.dest) {
					grunt.fatal("Specify a dest for uploads (e.g. '/' for the root)");
				}
				else if (filePair.params && !isValidParams(filePair.params)) {
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

							if (_.first(dest) === '/') {
								dest = dest.slice(1);
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
				Bucket: s3_options.bucket
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
					grunt.fatal('Failed to list content of bucket ' + s3_options.bucket + '\n' + err);
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

					if(options.progress === 'progressBar'){
						var progress = new Progress('[:bar] :current/:total :etas', {total : delete_list.length});
					}

					var end = function (err, data) {

						if (err) {
							errors.push(err);
							data = data || {};
							failed = failed.concat(data.Errors || []);
						}
						else {
							deleted = deleted.concat(data.Deleted);
							switch(options.progress){
								case 'progressBar':
									progress.tick();
									break;
								case 'none':
									break;
								case 'dots':
								default:
									grunt.log.write('.'.green);
									break;
							}
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

						s3.deleteObjects({ Delete: slice, Bucket: s3_options.bucket }, function (err, data) { end(err, data); });
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

		var doCopy = function (object, callback) {

			if (options.debug || !object.need_copy || object.excluded) {
				callback(null, false);
			}
			else {
				s3.copyObject({ Key: object.dest, CopySource: encodeURIComponent(s3_options.bucket + '/' + object.Key), Bucket: s3_options.bucket, ACL: options.access }, function (err, data) {
					if (err) {
						callback(err);
					}
					else {
						callback(null, true);
					}
				});
			}
		};

		var copyObjects = function (task, callback) {

			grunt.log.writeln('Copying the content of ' + getObjectURL(task.orig.src[0]).cyan + ' to ' + getObjectURL(task.dest).cyan);

			// List all the objects using src as the prefix
			listObjects(task.orig.src[0], function (to_copy) {

				if (to_copy.length === 0) {
					callback(null, null);
				}
				else {

					var copy_queue = async.queue(function (object, copyCallback) {

						var key = getRelativeKeyPath(object.Key, task.orig.src[0]); // Remove the src in the key
						object.dest = task.dest + key;
						object.need_copy = _.last(object.dest) !== '/'; // no need to write directories
						object.excluded = task.exclude && grunt.file.isMatch(task.exclude, object.Key);

						if (task.exclude && task.flipExclude) {
							object.excluded = !object.excluded;
						}

						setImmediate(doCopy, object, copyCallback);

					}, options.copyConcurrency);

					copy_queue.drain = function () {

						callback(null, to_copy);
					};

					if (options.progress === 'progressBar') {
						var progress = new Progress('[:bar] :current/:total :etas', { total : to_copy.length });
					}

					copy_queue.push(to_copy, function (err, copied) {

						if (err) {
							grunt.fatal('Failed to copy ' + getObjectURL(this.data.Key) + '\n' + err);
						}
						else {
							switch (options.progress) {
								case 'progressBar':
									progress.tick();
									break;
								case 'none':
									break;
								case 'dots':
								default:
									var dot = (copied) ? '.'.green : '.'.yellow;
									grunt.log.write(dot);
									break;
							}
						}
					});
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
				var s3_object = s3.getObject({ Key: object.Key, Bucket: s3_options.bucket }).createReadStream();

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
				s3.getObject({ Key: object.Key, Bucket: s3_options.bucket }, function (err, data) {
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
									date_compare: 'older' 
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

					if(options.progress === 'progressBar'){
						var progress = new Progress('[:bar] :current/:total :etas', {total : to_download.length});
					}

					download_queue.push(to_download, function (err, downloaded) {

						if (err) {
							grunt.fatal('Failed to download ' + getObjectURL(this.data.Key) + '\n' + err);
						}
						else {
							switch(options.progress){
								case 'progressBar':
									progress.tick();
									break;
								case 'none':
									break;
								case 'dots':
								default:
									var dot = (downloaded) ? '.'.green : '.'.yellow;
									grunt.log.write(dot);
									break;
							}
						}
					});
				}
			});
		};

		var doGzipRename = function (object, options) {
			var lastDot = object.src.lastIndexOf('.')

			if (object.src.substr(lastDot) === '.gz') {

				var originalPath = object.src.substr(0, lastDot)

				object.params = _.defaults({
					ContentType: mime.contentType(mime.lookup(originalPath) || "application/octet-stream"),
					ContentEncoding: 'gzip'
				}, object.params || {})

				if (options.gzipRename && object.src.match(/\.[^.]+\.gz$/)) {

					if (options.gzipRename === 'ext') {
						object.dest = object.dest.replace(/\.gz$/, '')
					}
					else if (options.gzipRename === 'gz') {
						object.dest = object.dest.replace(/\.[^.]+\.gz$/, '.gz')
					}
					else if (options.gzipRename === 'swap') {
						object.dest = object.dest.replace(/(\.[^.]+)\.gz$/, '.gz$1')
					}
				}
			}
		};

		var doUpload = function (object, callback) {

			if (object.need_upload && !options.debug) {

				var type = options.mime[object.src] || object.params.ContentType || mime.contentType(mime.lookup(object.src) || "application/octet-stream");
				var upload = _.defaults({
					ContentType: type,
					Key: object.dest,
					Bucket: s3_options.bucket,
					ACL: options.access
				}, object.params);

				if (object.stream) {
					upload.Body = fs.createReadStream(object.src);
				}
				else {
					upload.Body = grunt.file.read(object.src, { encoding: null });
				}

				s3.putObject(upload, function (err, data) {
					callback(err, true);
				});
			}
			else {
				callback(null, false);
			}
		};

		var uploadObjects = function (task, callback) {

			grunt.log.writeln('Uploading to ' + getObjectURL(task.dest).cyan);

			var startUploads = function (server_files) {

				var upload_queue = async.queue(function (object, uploadCallback) {

					doGzipRename(object, options);

					var server_file = _.where(server_files, { Key: object.dest })[0];

					if (server_file && !options.overwrite) {
						uploadCallback(object.dest + " already exists!")
					}
					else if (server_file && object.differential) {

						isFileDifferent({ file_path: object.src, server_hash: server_file.ETag }, function (err, different) {
							object.need_upload = different;
							setImmediate(doUpload, object, uploadCallback);
						});
					}
					else {
						setImmediate(doUpload, object, uploadCallback);
					}

				}, options.uploadConcurrency);

				upload_queue.drain = function () {

					callback(null, task.files);
				};

				if (options.progress === 'progressBar') {
					var progress = new Progress('[:bar] :current/:total :etas', { total : task.files.length });
				}

				upload_queue.push(task.files, function (err, uploaded) {

					if (err) {
						grunt.fatal('Failed to upload ' + this.data.src + ' with bucket ' + s3_options.bucket + '\n' + err);
					}
					else {
						switch(options.progress){
							case 'progressBar':
								progress.tick();
								break;
							case 'none':
								break;
							case 'dots':
							default:
								var dot = (uploaded) ? '.'.green : '.'.yellow;
								grunt.log.write(dot);
								break;
						}
					}
				});
			};

			var unique_dests = _(task.files)
				.filter('differential')
				.pluck('dest')
				.compact()
				.map(path.dirname)
				.sort()
				.uniq(true)
				.reduce(function (res, dest) {

					var last_path = res[res.length - 1];

					if (!last_path || dest.indexOf(last_path) !== 0) {
						res.push(dest);
					}

					return res;
				}, []);

			// If there's a '.', we need to scan the whole bucket
			if (unique_dests.indexOf('.') > -1 || !options.overwrite) {
				unique_dests = [''];
			}

			if (unique_dests.length) {
				async.mapLimit(unique_dests, options.uploadConcurrency, function (dest, callback) {
					listObjects(dest, function (objects) {
						callback(null, objects);
					});
				}, function (err, objects) {
					if (err) {
						callback(err);
					} 
					else {
						var server_files = Array.prototype.concat.apply([], objects);
						startUploads(server_files);
					}
				});
			} else {
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
			else if (task.action === 'copy') {
				copyObjects(task, callback);
			}
			else {
				uploadObjects(task, callback);
			}
		}, 1);

		queue.drain = function () {

			_.each(objects, function (o) {

				if (o.action === "delete") {
					grunt.log.writeln(o.deleted.toString().green + '/' + o.nb_objects.toString().green + ' objects deleted from ' + (s3_options.bucket + '/' + o.dest).green);
				}
				else if (o.action === "download") {
					grunt.log.writeln(o.downloaded.toString().green + '/' + o.nb_objects.toString().green + ' objects downloaded from ' + (s3_options.bucket + '/' + o.dest).green + ' to ' + o.cwd.green);
				}
				else if (o.action === "copy") {
					grunt.log.writeln(o.copied.toString().green + '/' + o.nb_objects.toString().green + ' objects copied from ' + (s3_options.bucket + '/' + o.orig.src[0]).green + ' to ' + (s3_options.bucket + '/' + o.dest).green);
				}
				else {
					grunt.log.writeln(o.uploaded.toString().green + '/' + o.nb_objects.toString().green + ' objects uploaded to bucket ' + (s3_options.bucket + '/').green);
				}
			});

			if (options.debug) {
				grunt.log.writeln("\nThe debug option was enabled, no changes have actually been made".yellow);
			}

			var uploadedFiles = []

			_.each(objects, function (o) {
				if (!o.action || o.action === 'upload') {	
					_.each(o.files, function (file) {
						if (file.need_upload) {
							uploadedFiles.push(file.dest)
						}
					});
				}
			})

			grunt.config.set(options.changedFiles, uploadedFiles)

			done()
		};

		if (objects.length === 0) {
			queue.drain()
		}
		else {
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
				else if (this.data.action === 'copy') {
					if (err) {
						grunt.fatal('Copy failed\n' + err.toString());
					}
					else {
						if (res && res.length > 0) {												
							grunt.log.writeln('\nList: (' + res.length.toString().cyan + ' objects):');

							var task = this.data;
							var copied = 0;

							_.each(res, function (file) {

								if (file.need_copy && !file.excluded) {
									copied++;
									grunt.log.writeln('- ' + (s3_options.bucket + '/' + file.Key).cyan + ' -> ' + (s3_options.bucket + '/' + task.dest + getRelativeKeyPath(file.Key, task.dest)).cyan);
								}
								else {
									var sign = (file.excluded) ? ' =/= ' : ' === ';
									grunt.log.writeln('- ' + (s3_options.bucket + '/' + file.Key).yellow + sign + (s3_options.bucket + '/' + task.dest + getRelativeKeyPath(file.Key, task.dest)).yellow);
								}
							});

							this.data.nb_objects = res.length;
							this.data.copied = copied || 0;
						}
						else {
							grunt.log.writeln('Nothing to copy');
							this.data.nb_objects = 0;
							this.data.copied = 0;
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
		}
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
