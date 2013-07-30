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
var AWS = require('aws-sdk');
var mime = require('mime');

module.exports = function(grunt) {

	grunt.registerMultiTask('aws_s3', 'Upload files to AWS S3', function() {
		var done = this.async();

		var options = this.options({
			access: 'public-read',
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			concurrency: 1
		});

		var put_params = ['CacheControl', 'ContentDisposition', 'ContentEncoding', 
		'ContentLanguage', 'ContentLength', 'ContentMD5', 'Expires', 'GrantFullControl', 
		'GrantRead', 'GrantReadACP', 'GrantWriteACP', 'Metadata', 'ServerSideEncryption', 
		'StorageClass', 'WebsiteRedirectLocation'];
		
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
			bucket : options.bucket,
			accessKeyId : options.accessKeyId,
			secretAccessKey : options.secretAccessKey
		};

		if (!options.region) {
			grunt.log.writeln("No region defined, uploading to US Standard");
		} else {
			s3_options.region = options.region;
		}

		if (options.params) {
			if (!grunt.util._.every(grunt.util._.keys(options.params), 
				function(key) { return grunt.util._.contains(put_params, key); })) {

				grunt.warn("params can only be " + put_params.join(', '));
			}
		}

    var s3 = new AWS.S3(s3_options);
		var s3_object = grunt.util._.extend({Bucket: options.bucket, ACL: options.access}, options.params);

		var dest;
		var isExpanded;
		var objects = [];

		this.files.forEach(function(filePair) {
			
			isExpanded = filePair.orig.expand || false;

			filePair.src.forEach(function(src) {
				
				if (grunt.util._.endsWith(dest, '/')) {	
					dest = (isExpanded) ? filePair.dest : unixifyPath(path.join(filePair.dest, src));
				} 
				else {
					dest = filePair.dest;
				}

				// '.' means that no dest path has been given (root).
				// We do not need to create a '.' folder
				if (dest !== '.') {
					objects.push({src: src, dest: dest});
				}
			});
		});

		var queue = grunt.util.async.queue(function (task, callback) {
			
			var upload;

			if (grunt.file.isDir(task.src)) {
				if (!grunt.util._.endsWith(task.dest, '/')) {
					task.dest = task.dest + '/';
				}

				upload = grunt.util._.extend({Key: task.dest}, s3_object);
			}
			else {
				var type = mime.lookup(task.src);
				var buffer = grunt.file.read(task.src, {encoding: null});
				upload = grunt.util._.extend({ContentType: type, Body: buffer, Key: task.dest}, s3_object);
			}

			s3.putObject(upload, function(err, data) {
				callback(err);
			});
		}, options.concurrency);

		queue.drain = function () {

			grunt.log.writeln(objects.length.toString().cyan + ' objects created on the bucket ' + options.bucket.toString().cyan);
			done();
		};

		queue.push(objects, function (err) {

			var objectURL = s3.endpoint.href + options.bucket + '/' + this.data.dest;

			if (err) {
				grunt.fatal('Failed to upload ' + this.data.src.toString().cyan + ' to ' + objectURL.toString().cyan + ".\n" + err.toString().red);
			}
			else {
				grunt.log.writeln(this.data.src.toString().cyan + ' uploaded to ' + objectURL.toString().cyan);
			}
		});
	});

	var unixifyPath = function(filepath) {
		
		if (process.platform === 'win32') {
			return filepath.replace(/\\/g, '/');
		} 
		else {	
			return filepath;
		}
	};
};
