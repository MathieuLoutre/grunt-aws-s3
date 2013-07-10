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
			access: 'public-read'
		});
		
		if (!options.accessKeyId || process.env.AWS_ACCESS_KEY_ID) {
			grunt.warn("Missing accessKeyId in options");
		}

		if (!options.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY) {
			grunt.warn("Missing secretAccessKey in options");
		}

		if (!options.region) {
			grunt.warn("Missing region in options");
		}

		if (!options.bucket) {
			grunt.warn("Missing bucket in options");
		}

		var s3 = new AWS.S3({accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey, region: options.region});
		var s3_object = {Bucket: options.bucket, ACL: options.access};

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

				objects.push({src: src, dest: dest});
			});
		});

		var queue = grunt.util.async.queue(function (task, callback) {
			
			var upload;

			if (grunt.file.isDir(task.src)) {
				
				if (!grunt.util._.endsWith(dest, '/')) {
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
		}, 1);

		queue.drain = function () {

			grunt.log.writeln(objects.length.toString().cyan + ' objects created on the bucket ' + options.bucket.toString().cyan);
			done();
		};

		queue.push(objects, function (err) {

			var objectURL = s3.endpoint.href + options.bucket + '/' + this.data.dest;

			if (err) {
				grunt.fatal('Failed to upload ' + this.data.src.toString().cyan + ' to ' + objectURL.toString().cyan);
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
