# grunt-aws-s3

> Upload files to AWS S3 using AWS SDK

## Warning 

Versions 0.4.0 to 0.5.0 have a bug where `options.params` is ignored.

## Getting Started
This plugin requires Grunt `~0.4.0`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
  npm install grunt-aws-s3 --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
  grunt.loadNpmTasks('grunt-aws-s3');
```

## The "aws_s3" task

### Options

#### options.accessKeyId (required)
Type: `String`

The AWS accessKeyId. You can load it via JSON as shown in the example or use the `AWS_ACCESS_KEY_ID` environment variable.

#### options.secretAccessKey (required)
Type: `String`

The AWS secretAccessKey. You can load it via JSON as shown in the example or use the `AWS_SECRET_ACCESS_KEY` environment variable.

#### options.bucket (required)
Type: `String`

The AWS bucket name you want to upload to.

#### options.region
Type: `String`  
Default: `US Standard`

The AWS [region](http://docs.aws.amazon.com/general/latest/gr/rande.html#s3_region).

If not specified, it uploads to the default 'US Standard'

#### options.access
Type: `String`  
Default:`public-read`

The ACL you want to apply to ALL the files that will be uploaded. The ACL values can be found in the [documentation](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3_20060301.html#putObject-property).

#### options.uploadConcurrency
Type: `Integer`  
Default: `1`

Number of uploads in parallel. By default, there's no concurrency. 
Note: This used to be called `concurrency` but the option has been deprecated, however it is still backwards compatible.

#### options.downloadConcurrency
Type: `Integer`  
Default: `1`

Number of download in parallel. By default, there's no concurrency.

#### options.params
Type: `Object`

A hash of the params you want to apply to the files. Useful to set the `ContentEncoding` to `gzip` for instance, or set the `ControlCache` value. The list of parameters can be found in the [documentation](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3_20060301.html#putObject-property). `params` will apply to *all* the files in the target. However, the `params` option in the file list has priority over it.

#### options.mime
Type: `Object`

The MIME type of every file is determined by a MIME lookup using [node-mime](https://github.com/broofa/node-mime). If you want to override it, you can use this option object.
The keys are the local file paths and the values are the MIME types.

```js
  {
    'path/to/file': 'application/json',
    'path to/other/file': 'application/gzip'
  }
```

You need to specify the full path of the file, including the `cwd` part.  
The `mime` hash has absolute priority over what has been set in `options.params` and the `params` option of the file list.

#### options.debug
Type: `Boolean`  
Default: `false`

This will do a "dry run". It will not upload anything to S3 but you will get the full report just as you would in normal mode. Useful to check what will be changed on the server before actually doing it. Unless one of your actions depends on another (like download following a delete), the report should be accurate.  
`listObjects` requests will still be made to list the content of the bucket.

#### options.differential
Type: `Boolean`  
Default: `false`

`listObjects` requests will be made to list the content of the bucket, then they will be checked against their local file equivalent (if it exists) using MD5 (and sometimes date) comparisons.
This means different things for different actions:
- `upload`: will only upload the files which either don't exist on the bucket or have a different MD5 hash
- `download`: will only download the files which either don't exist locally or have a different MD5 hash and are newer.
- `delete`: will only delete the files which don't exist locally

The option can either be specified for the whole subtask or for a specified file object like so:

```js
  {'action': 'upload', expand: true, cwd: 'dist/js', src: ['**'], differential: true}
```

In order to be able to compare to the local file names, it is necessary for `dest` to be a finished path (e.g `directory/` instead of just `dir`) as the comparison is done between the file names found in `cwd` and the files found on the server `dest`. If you want to compare the files in the directory `scripts/` in your bucket and the files in the corresponding local directory `dist/scripts/` you need to have something like:

```js
  {cwd: 'dist/scripts/', dest: 'scripts/', 'action': 'download', differential: true}
```

### Actions

This Grunt task supports three modes of interaction with S3, `upload`, `download` and `delete`. Every action that you specify is executed serially, one after the other. If multiple `upload` actions are one after the other, they will be grouped together.

You choose the action by specifying the key `action` in the file hash like so:

```js
  {'action': 'upload', expand: true, cwd: 'dist/js', src: ['**'], dest: 'app/js/'}
```

By default, the action is `upload`.

#### `upload`

The `upload` action uses the [newest Grunt file format](http://gruntjs.com/configuring-tasks#files), allowing to take advantage of the `expand` and `filter` options.  
It is the default action, so you can omit `action: 'upload'` if you want a cleaner look.

```js
  files: [
    {expand: true, cwd: 'dist/staging/scripts', src: ['**'], dest: 'app/scripts/'},
    {expand: true, cwd: 'dist/staging/styles', src: ['**'], dest: 'app/styles/', action: 'upload'}
  ]
```

You can also include a `params` hash which will override the options.params one. For example:

```js
  
  params: {
    ContentType: 'application/json'
    CacheControl: '3000'
  }

  // ...

  files: [
    {expand: true, cwd: 'dist/staging/scripts', src: ['**'], dest: 'app/scripts/', params: {CacheControl: '2000'}},
    {expand: true, cwd: 'dist/staging/styles', src: ['**'], dest: 'app/styles/'}
  ]
```

This will yield for the params which will eventually be applied:

```js
  {
    ContentType: 'application/json',
    CacheControl: '2000'
  }

  // AND

  {
    ContentType: 'application/json',
    CacheControl: '3000'
  }
```

The `options.mime` hash, however, has priority over the ContentType. So if the hash looked like this:

```js
  {
    'dist/staging/styles/LICENCE': 'text/plain'
  }
```

The `ContentType` eventually applied to `dist/staging/styles/LICENCE` would be `text/plain` even though we had a `ContentType` specified in `options.params` or in `params` of the file.

When the `differential` option is enabled, it will only upload the files which either don't exist on the bucket or have a different MD5 hash.

#### `download`

The `download` action requires a `cwd`, a `dest` and *no* `src` like so:

```js
  {cwd: 'download/', dest: 'app/', 'action': 'download'}
```

The `dest` is used as the Prefix in the [listObjects command](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3_20060301.html#listObjects-property) to find the files _on the server_. 
The `cwd` is used as the root folder to write the downloaded files. The inner folder structure will be reproduced inside that folder.

If you specify '/' for `dest`, the whole bucket will be downloaded. It handles automatically buckets with more than a 1000 objects.  
If you specify 'app', all paths starting with 'app' will be targeted (e.g. 'app.js', 'app/myapp.js', 'app/index.html, 'app backup/donotdelete.js') but it will leave alone the others (e.g. 'my app/app.js', 'backup app/donotdelete.js').

When the `differential` options is enabled, it will only download the files which either don't exist locally or have a different MD5 hash and are newer. 

#### `delete`

The `delete` action just requires a `dest`, no need for a `dest` like so:

```js
  {dest: 'app/', 'action': 'delete'}
```

The `dest` is used as the Prefix in the [listObjects command](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3_20060301.html#listObjects-property) to find the files _on the server_. 

If you specify '/', the whole bucket will be wiped. It handles automatically buckets with more than a 1000 objects.  
If you specify 'app', all paths starting with 'app' will be targeted (e.g. 'app.js', 'app/myapp.js', 'app/index.html, 'app backup/donotdelete.js') but it will leave alone the others (e.g. 'my app/app.js', 'backup app/donotdelete.js').

When the `differential` options is enabled, it will only delete the files which don't exist locally.

Please, be careful with the `delete` action. It doesn't forgive.

### Usage Examples

The example loads the AWS credentials from a JSON file (DO NOT forget to exclude it from your commits).

```JSON
  {
    "AWSAccessKeyId": "AKxxxxxxxxxx",
    "AWSSecretKey": "super-secret-key"
  }
```

```js
aws: grunt.file.readJSON('aws-keys.json'), // Read the file

aws_s3: {
  options: {
    accessKeyId: '<%= aws.AWSAccessKeyId %>', // Use the variables
    secretAccessKey: '<%= aws.AWSSecretKey %>', // You can also use env variables
    region: 'eu-west-1',
    uploadConcurrency: 5 // 5 simultaneous uploads
    downloadConcurrency: 5 // 5 simultaneous downloads
  },
  staging: {
    options: {
      bucket: 'my-wonderful-staging-bucket',
      differential: true // Only uploads the files that have changed
    },
    files: [
      {dest: 'app/', cwd: 'backup/staging/', action: 'download'},
      {expand: true, cwd: 'dist/staging/scripts/', src: ['**'], dest: 'app/scripts/'},
      {expand: true, cwd: 'dist/staging/styles/', src: ['**'], dest: 'app/styles/'},
      {dest: 'src/app', action: 'delete'},
    ]
  },
  production: {
    options: {
      bucket: 'my-wonderful-production-bucket'
      params: {
        ContentEncoding: 'gzip' // applies to all the files!
      }
      mime: {
        'dist/assets/production/LICENCE': 'text/plain'
      }
    },
    files: [
      {expand: true, cwd: 'dist/production/', src: ['**'], dest: 'app/'},
      {expand: true, cwd: 'assets/prod/', src: ['**'], dest: 'assets/', params: {CacheControl: '2000'},
      // CacheControl only applied to the assets folder
      // LICENCE inside that folder will have ContentType equal to 'text/plain'
    ]
  },
  clean_production: {
    options: {
      bucket: 'my-wonderful-production-bucket'
      debug: true // Doesn't actually delete but shows log
    },
    files: [
      {dest: 'app/', action: 'delete'},
    ]
  },
  download_production: {
    options: {
      bucket: 'my-wonderful-production-bucket'
    },
    files: [
      {dest: 'app/', cwd: 'backup/', action: 'download'},
      // Downloads the content of app/ to backup/
    ]
  },
  secret: {
    options: {
      bucket: 'my-wonderful-private-bucket',
      access: 'private'
    },
    files: [
      {expand: true, cwd: 'secret_garden/', src: ['*.key'], dest: 'secret/'},
    ]
  },
},
```

## Todos

- Better testing (params, sync, etc.)

## Release History
* 2013-09-09   v0.7.0   Code restructure. New differential option. Tests.
* 2013-08-21   v0.6.0   Add 'download' option. Multiple fixes.
* 2013-08-20   v0.5.0   Add option to override automatic MIME type detection
* 2013-08-19   v0.4.1   Fix delete task executing separately from upload
* 2013-08-14   v0.4.0   Add 'delete' option
* 2013-07-30   v0.3.1   Region is now optional, defaults to US Standard
* 2013-07-17   v0.3.0   Option for concurrency
* 2013-07-16   v0.2.0   Can set additional params
* 2013-07-11   v0.1.1   Fix bug when using env variable
* 2013-07-10   v0.1.0   First release

For a proper list of changes, take a look at the [changelog](https://github.com/MathieuLoutre/grunt-aws-s3/blob/master/CHANGELOG.md)
