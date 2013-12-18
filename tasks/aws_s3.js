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

module.exports = function (grunt) {

	grunt.registerMultiTask('aws_s3', 'Interact with AWS S3 using the AWS SDK', function () {

		var done = this.async();

		var options = this.options({
			access: 'public-read',
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			concurrency: 1,
			uploadConcurrency: null,
			downloadConcurrency: 1,
			mime: {},
			params: {},
			debug: false,
			mock: false,
			differential: false
		});

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

		var getRelativeKeyPath = function (key, dest) {

			var path;

			if (_.last(dest) === '/') {
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
		// we need to group the uploads together.
		var pushUploads = function() {

			if (uploads.length > 0) {
				objects.push({action: 'upload', files: uploads});
				uploads = [];
			}
		};

		this.files.forEach(function (filePair) {

			is_expanded = filePair.orig.expand || false;

			if (filePair.action === 'delete') {

				if (!filePair.dest) {
					grunt.fatal('No "dest" specified for deletion. No need to specify a "src"');
				}
				else if ((filePair.differential || options.differential) && !filePair.cwd) {
					grunt.fatal('Differential delete needs a "cwd"');
				}

				pushUploads();

				dest = (filePair.dest === '/') ? '' : filePair.dest;
				objects.push({
					dest: dest,
					action: 'delete',
					cwd: filePair.cwd,
					differential: filePair.differential || options.differential
				});
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

				dest = (filePair.dest === '/') ? '' : filePair.dest;
				objects.push({
					cwd: filePair.cwd,
					dest: dest,
					action: 'download',
					differential: filePair.differential || options.differential
				});
			}
			else {

				if (filePair.params && !isValidParams(filePair.params)) {
					grunt.warn('"params" can only be ' + put_params.join(', '));
				}
				else {
					filePair.src.forEach(function (src) {

						// Prevents creating empty folders
						if (!grunt.file.isDir(src)) {

							if (_.last(dest) === '/') {
								dest = (is_expanded) ? filePair.dest : unixifyPath(path.join(filePair.dest, src));
							} 
							else {
								dest = filePair.dest;
							}

							// '.' means that no dest path has been given (root). Nothing to create there.
							if (dest !== '.') {

								uploads.push({
									src: src, 
									dest: dest, 
									params: _.defaults(filePair.params || {}, options.params),
									differential: filePair.differential || options.differential,
									need_upload: true
								});
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

					if (task.differential) {
						// Exists locally or not (remove dest in the key to get the local path)
						o.need_delete = local_files.indexOf(getRelativeKeyPath(o.Key, task.dest)) === -1;
					}
				});

				// Just list what needs to be deleted so it can be sliced if necessary
				var delete_list = _.filter(to_delete, function (o) { return o.need_delete; });

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

		var downloadObjects = function (task, callback) {

			grunt.log.writeln('Downloading the content of ' + getObjectURL(task.dest).cyan + ' to ' + task.cwd.cyan);

			// List all the objects using dest as the prefix
			listObjects(task.dest, function (to_download) {

				// List local content if it's a differential task
				var local_files = (task.differential) ? grunt.file.expand({ cwd: task.cwd }, ["**"]) : [];

				_.each(to_download, function (o) {

					// Remove the dest in the key to not duplicate the path with cwd
					var key = getRelativeKeyPath(o.Key, task.dest);
					o.need_download = true;
					o.Bucket = options.bucket;

					if (task.differential) {
						var local_index = local_files.indexOf(key);

						// File exists locally or not
						if (local_index !== -1) {
							var local_buffer = grunt.file.read(task.cwd + key, { encoding: null });
							var md5_hash = '"' + crypto.createHash('md5').update(local_buffer).digest('hex') + '"';

							// Same file hash?
							if (md5_hash === o.ETag) {
								o.need_download = false;
							}
							else {
								var local_date = new Date(fs.statSync(task.cwd + key).mtime).getTime();
								var server_date = new Date(o.LastModified).getTime();

								// If not the same md5 and server date is newer we need to download
								if (local_date > server_date) {
									o.need_download = false;
								}
							}
						}
					}
				});

				if (to_download.length > 0) {

					var download_queue = async.queue(function (object, downloadCallback) {

						if (options.debug || !object.need_download) {
							downloadCallback(null);
						}
						else {
							s3.getObject(_.pick(object, ['Key', 'Bucket']), function (err, data) {

								if (err) {
									downloadCallback(err);
								}
								else {
									// Get the relative path to avoid repeating the same path when we can
									grunt.file.write(task.cwd + getRelativeKeyPath(object.Key, task.dest), data.Body);
									downloadCallback(null);
								}
							});
						}
					}, options.downloadConcurrency);

					download_queue.drain = function () {

						callback(null, to_download);
					};

					download_queue.push(to_download, function (err) {

						if (err) {
							grunt.fatal('Failed to download ' + getObjectURL(this.data.Key) + '\n' + err);
						}
						else {
							grunt.log.write('.'.green);
						}
					});
				}
				else {
					callback(null, null);
				}
			});
		};

		var uploadObjects = function (task, callback) {

			grunt.log.writeln('Uploading to ' + getObjectURL(task.dest).cyan);

			var startUploads = function (objects) {

				var upload_queue = async.queue(function (object, uploadCallback) {

					var server_file = _.where(objects, { Key: object.dest })[0];
					var stream = fs.createReadStream(object.src);

					if (server_file && object.differential) {
						var hash_buffer = grunt.file.read(object.src, { encoding: null });
						// S3's ETag has quotes around it...
						var md5_hash = '"' + crypto.createHash('md5').update(hash_buffer).digest('hex') + '"';
						object.need_upload = md5_hash !== server_file.ETag;
					}

					if (object.need_upload && !options.debug) {

						var type = options.mime[object.src] || object.params.ContentType || mime.lookup(object.src);
						var upload = _.defaults({
							ContentType: type,
							Body: stream,
							Key: object.dest,
							Bucket: options.bucket,
							ACL: options.access
						}, object.params);

						s3.putObject(upload, function (err, data) {
							uploadCallback(err);
						});
					}
					else {
						uploadCallback(null);
					}

				}, options.uploadConcurrency || options.concurrency);

				upload_queue.drain = function () {

					callback(null, task.files);
				};

				upload_queue.push(task.files, function (err, uploaded) {

					if (err) {
						grunt.fatal('Failed to upload ' + this.data.src + ' with bucket ' + options.bucket + '\n' + err);
					}
					else {
						grunt.log.write('.'.green);
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

							if (file.need_delete) {
								deleted++;
								grunt.log.writeln('- ' + file.Key.cyan);
							}
							else {
								grunt.log.writeln('- ' + file.Key.yellow);
							}
						});

						this.data.nb_objects = res.length;
						this.data.deleted =	deleted;
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

							if (file.need_download) {
								downloaded++;
								grunt.log.writeln('- ' + getObjectURL(file.Key).cyan + ' -> ' + (task.cwd + getRelativeKeyPath(file.Key, task.dest)).cyan);
							}
							else {
								grunt.log.writeln('- ' + getObjectURL(file.Key).yellow + ' === ' + (task.cwd + getRelativeKeyPath(file.Key, task.dest)).yellow);
							}
						});

						this.data.nb_objects = res.length;
						this.data.downloaded =	_.countBy(res, 'need_download')['true'] || 0;
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
						else {
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
