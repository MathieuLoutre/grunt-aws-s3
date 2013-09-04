/*
 * grunt-aws-s3
 * https://github.com/MathieuLoutre/grunt-aws-s3
 *
 * Copyright (c) 2013 Mathieu Triay
 * Licensed under the MIT license.
 */

 // TODO:
 // Tests
 // Sync

'use strict';

var path = require('path');
var fs = require('fs');
var AWS = require('aws-sdk');
var mime = require('mime');

module.exports = function (grunt) {

	grunt.registerMultiTask('aws_s3', 'Upload files to AWS S3', function () {
		
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
			debug: false
		});

		var put_params = ['CacheControl', 'ContentDisposition', 'ContentEncoding',
		'ContentLanguage', 'ContentLength', 'ContentMD5', 'Expires', 'GrantFullControl',
		'GrantRead', 'GrantReadACP', 'GrantWriteACP', 'Metadata', 'ServerSideEncryption',
		'StorageClass', 'WebsiteRedirectLocation', 'ContentType'];

		var isValidParams = function (params) {
			return grunt.util._.every(grunt.util._.keys(params), function(key) { return grunt.util._.contains(put_params, key); });
		};
		
		if (!options.accessKeyId) {
			grunt.warn("Missing accessKeyId in options");
		}

		if (!options.secretAccessKey) {
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
			grunt.log.writeln("No region defined, uploading to US Standard");
		} else {
			s3_options.region = options.region;
		}

		if (options.params) {
			if (!isValidParams(options.params)) {
				grunt.warn('"params" can only be ' + put_params.join(', ').toString().orange);
			}
		}

		var s3 = new AWS.S3(s3_options);

		var dest;
		var isExpanded;
		var objects = [];
		var uploads = [];

		this.files.forEach(function (filePair) {

			if (filePair.action === 'delete') {

				if (!filePair.dest) {
					grunt.fatal('No "dest" specified for deletion. No need to specify a "src"');
				}

				if (uploads.length > 0) {
					objects.push({action: 'upload', files: uploads});
					uploads = [];
				}

				dest = (filePair.dest === '/') ? '' : filePair.dest;
				objects.push({dest: dest, action: 'delete'});
			}
			else if (filePair.action === 'download') {

				isExpanded = filePair.orig.expand || false;

				if (isExpanded) {
					grunt.fatal('You cannot expand the "src" for a download');
				}
				else if (!filePair.dest) {
					grunt.fatal('No "dest" specified for download');
				}
				else if (!filePair.cwd || filePair.src) {
					grunt.fatal('Specify a "cwd" but not a "src"');
				}

				if (uploads.length > 0) {
					objects.push({action: 'upload', files: uploads});
					uploads = [];
				}

				dest = (filePair.dest === '/') ? '' : filePair.dest;
				objects.push({src: filePair.cwd, dest: dest, action: 'download'});
			}
			else {

				if (filePair.params && !isValidParams(filePair.params)) {
					grunt.warn('"params" can only be ' + put_params.join(', ').toString().orange);
				}
				else {

					isExpanded = filePair.orig.expand || false;

					filePair.src.forEach(function (src) {

						// Prevent creating empty folders
						if (!grunt.file.isDir(src)) {

							if (grunt.util._.endsWith(dest, '/')) {
								dest = (isExpanded) ? filePair.dest : unixifyPath(path.join(filePair.dest, src));
							} 
							else {
								dest = filePair.dest;
							}

							// '.' means that no dest path has been given (root).
							// We do not need to create a '.' folder
							if (dest !== '.') {
								uploads.push({src: src, dest: dest, params: grunt.util._.defaults(filePair.params || {}, options.params)});
							}
						}
					});
				}
			}
		});

		if (uploads.length > 0) {
			objects.push({action: 'upload', files: uploads});
		}

		var deleteObjects = function (task, callback) {

			s3.listObjects({Prefix: task.dest, Bucket: options.bucket}, function (err, data) {

				if (!err) {

					if (options.debug) {
						callback(null, {Deleted: data.Contents});
					}
					else if (data.Contents.length > 0) {

						var to_delete = {
							Objects: grunt.util._.map(data.Contents, function (o) { return {Key: o.Key}; })
						};

						s3.deleteObjects({Delete: to_delete, Bucket: options.bucket}, function (err, data) {
							callback(err, data);
						});
					}
					else {
						callback(null, null);
					}
				}
				else {
					callback(err);
				}
			});
		};

		var downloadObjects = function (task, callback) {
			
			s3.listObjects({Prefix: task.dest, Bucket: options.bucket}, function (err, data) {

				if (!err) {

					if (data.Contents.length > 0) {

						var list = grunt.util._.pluck(data.Contents, 'Key');

						var download_queue = grunt.util.async.queue(function (object, downloadCallback) {
							
							if (options.debug) {
								downloadCallback(null);
							}
							else {
								s3.getObject(object, function (err, data) {

									if (err) {
										downloadCallback(err);
									}
									else {
										grunt.file.write(task.src + object.Key, data.Body);
										downloadCallback(null);
									}
								});
							}
						}, options.downloadConcurrency);

						download_queue.drain = function () {
							callback(null, list);
						};

						var to_download = grunt.util._.map(data.Contents, function (o) { return {Key: o.Key, Bucket: options.bucket}; });
						
						download_queue.push(to_download, function (err) {
							
							if (err) {
								grunt.fatal('Failed to download ' + s3.endpoint.href + options.bucket + '/' + this.data.Key + '\n' + err);
							}
						});
					}
					else {
						callback(null, null);
					}
				}
				else {
					callback(err);
				}
			});
		};

		var uploadObjects = function (task, callback) {

			var upload_queue = grunt.util.async.queue(function (object, uploadCallback) {
				
				var type = options.mime[object.src] || object.params.ContentType || mime.lookup(object.src);
				var buffer = grunt.file.read(object.src, {encoding: null});
				
				var upload = grunt.util._.defaults({
					ContentType: type,
					Body: buffer,
					Key: object.dest,
					Bucket: options.bucket,
					ACL: options.access
				}, object.params);

				if (options.debug) {
					uploadCallback(null, null);
				}
				else {
					s3.putObject(upload, function (err, data) {
						uploadCallback(err, data);
					});
				}

			}, options.uploadConcurrency || options.concurrency);

			upload_queue.drain = function () {
				callback(null, task.files, 'src');
			};

			upload_queue.push(task.files, function (err) {

				if (err) {
					grunt.fatal('Failed to upload ' + this.data.src + ' to bucket ' + options.bucket + '\n' + err);
				}
			});
		};

		var queue = grunt.util.async.queue(function (task, callback) {
			
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

			grunt.util._.each(objects, function (o) {

				if (o.action === "upload") {
					grunt.log.writeln(o.nb_objects.toString().green + ' objects uploaded to bucket ' + (options.bucket).toString().green);
				}
				else if (o.action === "download") {
					grunt.log.writeln(o.nb_objects.toString().green + ' objects downloaded from ' + (options.bucket + '/' + o.dest).toString().green + ' to ' + o.src.toString().green);
				}
				else {
					grunt.log.writeln(o.nb_objects.toString().green + ' objects deleted at ' + (options.bucket + '/' + o.dest).toString().green);
				}
			});

			done();
		};

		queue.push(objects, function (err, res) {

			var objectURL = s3.endpoint.href + options.bucket + '/' + (this.data.dest || '');

			if (this.data.action === 'delete') {
				
				if (err) {
					
					if (res && res.Errors.length > 0) {
						grunt.writeln('Errors (' + res.Errors.length.toString().red + ' objects): ' + grunt.util._.pluck(res.Errors, 'Key').join(', ').toString().red);
					}

					grunt.fatal('Failed to delete content of ' + objectURL + '\n' + err);
				}
				else {

					if (res) {
						grunt.log.writeln('Successfuly deleted the content of ' + objectURL.toString().cyan);
						grunt.log.writeln('List: (' + res.Deleted.length.toString().cyan + ' objects): '+ grunt.util._.pluck(res.Deleted, 'Key').join(', ').toString().cyan);
						this.data.nb_objects = res.Deleted.length;
					}
					else {
						grunt.log.writeln('Nothing to delete in ' + objectURL.toString().cyan);
						this.data.nb_objects = 0;
					}
				}
			}
			else if (this.data.action === 'download') {

				if (err) {
					grunt.fatal('Failed to download content of ' + objectURL + '\n' + err.toString());
				}
				else {

					if (res) {
						grunt.log.writeln('Successfuly downloaded the content of ' + objectURL.toString().cyan + ' to ' + this.data.src.toString().cyan);
						grunt.log.writeln('List: (' + res.length.toString().cyan + ' objects): ' + res.join(', ').toString().cyan);
						this.data.nb_objects = res.length;
					}
					else {
						grunt.log.writeln('Nothing to download in ' + objectURL.toString().cyan);
						this.data.nb_objects = 0;
					}
				}
			}
			else {
				
				if (err) {
					grunt.fatal('Failed to upload to ' + objectURL + '\n' + err.toString());
				}
				else {
					grunt.log.writeln('Successfuly uploaded to ' + objectURL.toString().cyan);
					grunt.log.writeln('List: (' + res.length.toString().cyan + ' objects):');

					grunt.util._.each(res, function (file) {
						grunt.log.writeln('- ' + file.src.toString().cyan + ' -> ' + (objectURL + file.dest).toString().cyan);
					});

					this.data.nb_objects = res.length;
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