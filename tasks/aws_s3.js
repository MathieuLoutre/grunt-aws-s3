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

		var put_params = ['CacheControl', 'ContentDisposition', 'ContentEncoding',
			'ContentLanguage', 'ContentLength', 'ContentMD5', 'Expires', 'GrantFullControl',
			'GrantRead', 'GrantReadACP', 'GrantWriteACP', 'Metadata', 'ServerSideEncryption',
			'StorageClass', 'WebsiteRedirectLocation', 'ContentType'];

		var isValidParams = function (params) {
			
			return grunt.util._.every(grunt.util._.keys(params), function (key) { 
				return grunt.util._.contains(put_params, key); 
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
		var is_expanded;
		var objects = [];
		var uploads = [];
		var diff_uploads = [];

		var pushFiles = function() {

			if (uploads.length > 0) {
				objects.push({action: 'upload', files: uploads});
				uploads = [];
			}
		};

		this.files.forEach(function (filePair) {

			if (filePair.action === 'delete') {

				if (!filePair.dest) {
					grunt.fatal('No "dest" specified for deletion. No need to specify a "src"');
				}
				else if ((filePair.differential || options.differential) && !filePair.cwd) {
					grunt.fatal('Differential delete needs a "cwd"');
				}

				pushFiles();

				dest = (filePair.dest === '/') ? '' : filePair.dest;
				objects.push({dest: dest, action: 'delete', cwd: filePair.cwd, differential: filePair.differential || options.differential});
			}
			else if (filePair.action === 'download') {

				is_expanded = filePair.orig.expand || false;

				if (is_expanded) {
					grunt.fatal('You cannot expand the "src" for a download');
				}
				else if (!filePair.dest) {
					grunt.fatal('No "dest" specified for download');
				}
				else if (!filePair.cwd || filePair.src) {
					grunt.fatal('Specify a "cwd" but not a "src"');
				}

				pushFiles();

				dest = (filePair.dest === '/') ? '' : filePair.dest;
				objects.push({cwd: filePair.cwd, dest: dest, action: 'download', differential: filePair.differential || options.differential});
			}
			else {

				if (filePair.params && !isValidParams(filePair.params)) {
					grunt.warn('"params" can only be ' + put_params.join(', ').toString().orange);
				}
				else {

					is_expanded = filePair.orig.expand || false;

					filePair.src.forEach(function (src) {

						// Prevent creating empty folders
						if (!grunt.file.isDir(src)) {

							if (grunt.util._.endsWith(dest, '/')) {
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
									params: grunt.util._.defaults(filePair.params || {}, options.params),
									differential: filePair.differential || options.differential
								});
							}
						}
					});
				}
			}
		});

		pushFiles();

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

					if (list.Marker) {
						listObjects(prefix, callback, list.Marker, objects);
					}
					else {
						callback(grunt.util._.uniq(objects, function (o) { return o.Key; }));
					}
				}
				else {
					grunt.fatal('Failed to list content of bucket ' + options.bucket + '\n' + err);
				}
			});
		};

		var deleteObjects = function (task, callback) {

			listObjects(task.dest, function (list) {

				var to_delete = [];
				var local_files = (task.differential) ? grunt.file.expand({cwd: task.cwd}, ["**"]) : [];

				grunt.util._.each(list, function (o) {

					var need_delete = true;

					if (task.differential) {
						need_delete = local_files.indexOf(o.Key) === -1;
					}

					if (need_delete) {
						to_delete.push({ Key: o.Key, Bucket: options.bucket });
					}
				});

				if (options.debug) {
					callback(null, to_delete);
				}
				else if (to_delete.length > 0) {

					var slices = Math.ceil(list.length/1000);
					var errors = [];
					var failed = [];
					var deleted = [];
					var calls = 0;

					var end = function (err, data) {
						
						if (err) {
							errors.push(err);
							failed = failed.concat(data.Errors);
						}
						else {
							deleted = deleted.concat(data.Deleted);
						}
						
						if (++calls === slices) {
							if (errors.length > 0) {
								callback(JSON.stringify(errors), failed);
							}
							else {
								callback(null, deleted);
							}
						}
					};

					var deleteSlice = function (i) {

						var start = 1000 * i;
						var slice = {
							Objects: grunt.util._.map(list.slice(start, start + 1000), function (o) { return { Key: o.Key }; })
						};

						s3.deleteObjects({Delete: slice, Bucket: options.bucket}, function (err, data) {
							end(err, data);
						});
					};

					for (var i = 0; i < slices; i++) {
						deleteSlice(i);
					}
				}
				else {
					callback(null, null);
				}
			});
		};

		var downloadObjects = function (task, callback) {
			
			listObjects(task.dest, function (list) {

				var to_download = [];
				var local_files = (task.differential) ? grunt.file.expand({cwd: task.cwd}, ["**"]) : [];

				grunt.util._.each(list, function (o) {

					var need_download = true;

					if (task.differential) {
						var local_index = local_files.indexOf(o.Key);

						if (local_index !== -1) {

							var local_buffer = grunt.file.read(task.cwd + o.Key, {encoding: null});
							var md5_hash = '"' + crypto.createHash('md5').update(local_buffer).digest('hex') + '"';
							
							if (md5_hash === o.ETag) {
								need_download = false;
							}
							else {

								var local_date = new Date(fs.statSync(task.cwd + o.Key).mtime).getTime();
								var server_date = new Date(o.LastModified).getTime();
								
								if (local_date > server_date) {
									need_download = false;
								}
							}
						}
					}

					if (need_download) {
						to_download.push({ Key: o.Key, Bucket: options.bucket });
					}
				});

				if (to_download.length > 0) {

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
									grunt.file.write(task.cwd + object.Key, data.Body);
									downloadCallback(null);
								}
							});
						}
					}, options.downloadConcurrency);

					download_queue.drain = function () {
						callback(null, grunt.util._.pluck(list, 'Key'));
					};
					
					download_queue.push(to_download, function (err) {
						
						if (err) {
							grunt.fatal('Failed to download ' + s3.endpoint.href + options.bucket + '/' + this.data.Key + '\n' + err);
						}
					});
				}
				else {
					callback(null, null);
				}
			});
		};

		var uploadObjects = function (task, callback) {

			var startUploads = function (objects) {

				var upload_queue = grunt.util.async.queue(function (object, uploadCallback) {

					var need_upload = true;
					var server_file = grunt.util._.where(objects, {Key: object.dest})[0];
					var buffer = grunt.file.read(object.src, {encoding: null});

					if (server_file && object.differential) {
						var md5_hash = '"' + crypto.createHash('md5').update(buffer).digest('hex') + '"';
						need_upload = md5_hash !== server_file.ETag;
					}

					if (need_upload && !options.debug) {

						var type = options.mime[object.src] || object.params.ContentType || mime.lookup(object.src);
						var upload = grunt.util._.defaults({
							ContentType: type,
							Body: buffer,
							Key: object.dest,
							Bucket: options.bucket,
							ACL: options.access
						}, object.params);

						s3.putObject(upload, function (err, data) {
							uploadCallback(err, need_upload);
						});
					}
					else {
						uploadCallback(null, need_upload);
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
						this.data.uploaded = uploaded;
					}
				});
			};

			if (grunt.util._.some(task.files, function (o) { return o.differential })) {
				listObjects('', function (objects) { startUploads(objects); });
			}
			else {
				startUploads([]);
			}
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
					grunt.log.writeln(o.nb_objects.toString().green + ' objects uploaded to bucket ' + (options.bucket).toString().green + ' (' + o.uploaded.toString().green + ' uploads)');
				}
				else if (o.action === "download") {
					grunt.log.writeln(o.nb_objects.toString().green + ' objects downloaded from ' + (options.bucket + '/' + o.dest).toString().green + ' to ' + o.cwd.toString().green);
				}
				else {
					grunt.log.writeln(o.nb_objects.toString().green + ' objects deleted from ' + (options.bucket + '/' + o.dest).toString().green);
				}
			});

			if (options.debug) {
				grunt.log.writeln("\nThe debug option was enabled, no changes have actually been made".toString().yellow);
			}

			done();
		};

		queue.push(objects, function (err, res) {

			var objectURL = s3.endpoint.href + options.bucket + '/' + (this.data.dest || '');

			if (this.data.action === 'delete') {
				
				if (err) {

					if (res && res.length > 0) {
						grunt.log.writeln('Errors (' + res.length.toString().red + ' objects): ' + grunt.util._.pluck(res, 'Key').join(', ').toString().red);
					}

					grunt.fatal('Failed to delete all content of ' + objectURL + '\n' + err);
				}
				else {

					if (res && res.length > 0) {
						grunt.log.writeln('Successfuly deleted the content of ' + objectURL.toString().cyan);
						grunt.log.writeln('List: (' + res.length.toString().cyan + ' objects): '+ grunt.util._.pluck(res, 'Key').join(', ').toString().cyan);
						this.data.nb_objects = res.length;
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

					if (res && res.length > 0) {
						grunt.log.writeln('Successfuly downloaded the content of ' + objectURL.toString().cyan + ' to ' + this.data.cwd.toString().cyan);
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

					var uploaded = 0;

					grunt.util._.each(res, function (file) {
						
						if (file.uploaded) {
							uploaded++;
							grunt.log.writeln('- ' + file.src.toString().cyan + ' -> ' + (objectURL + file.dest).toString().cyan);
						}
						else {
							grunt.log.writeln('- ' + file.src.toString().yellow + ' === ' + (objectURL + file.dest).toString().yellow);
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