/*
 * grunt-aws-s3
 * https://github.com/MathieuLoutre/grunt-aws-s3
 *
 * Copyright (c) 2013 Mathieu Triay
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({

    aws_s3: {
      test: {
        options: {
          bucket: __dirname + '/test/local/bucket',
          concurrency: 1,
          params: {
            ContentType: 'application/json'
          },
          mime: {
            'upload/me too/LICENSE': 'text/plain'
          },
          mock: true
        },
        files: [
          {expand: true, cwd: "test/local/upload/", src: ['**'], dest: 'first/'},
          {dest: '/', cwd: 'test/local/download/backup/', action: 'download'},
          {dest: 'first/otters/updated/', action: 'delete'},
          {dest: 'punk/', action: 'delete'},
          {expand: true, cwd: "test/local/upload/otters/river/", src: ['**'], dest: 'second/'},
          {dest: 'otters/funk/', cwd: 'test/local/download/backup/', action: 'download'},
          {expand: true, cwd: "test/local/upload/otters/updated/", src: ['**'], dest: 'second/', action: 'sync'},
        ]
      },
    },

    mochaTest: {
      test: {
        options: {
          reporter: 'spec'
        },
        src: ['test/*.js']
      }
    },
    clean: {
      test: ['test/local/**']
    },
    copy: {
      main: {
        files: [
          {expand: true, cwd: 'test/fixtures/', src: ['**'], dest: 'test/local'},
        ]
      }
    }
  });

  // Actually load this plugin's task(s).
  grunt.loadTasks('./tasks');

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-mocha-test');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-copy');

  grunt.registerTask('default', ['clean', 'copy', 'aws_s3', 'mochaTest']);

};
