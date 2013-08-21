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

#### options.concurrency
Type: `Integer`  
Default: `1`

Number of actions (delete, upload, downloads that you have specified in the target) in parallel. By default, there's no concurrency, the actions are made one after the other.

#### options.downloadConcurrency
Type: `Integer`  
Default: `1`

Number of download in parallel. By default, there's no concurrency. This differs from `options.concurrency` because you can have `options.concurrency` set to `1` to launch your uploads, then your downloads and still have `options.downloadConcurrency` set to `10` for a faster download action within the subtask.

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

### Actions

This Grunt task supports three modes of interaction with S3, `upload`, `download` and `delete`.

You choose the action by specifying the key `action` in the file hash like so:

```js
  {'action': 'upload', expand: true, cwd: 'dist/js', src: ['**'], dest: 'app/js'}
```

By default, the action is `upload`.

#### `upload`

The `upload` action uses the [newest Grunt file format](http://gruntjs.com/configuring-tasks#files), allowing to take advantage of the `expand` and `filter` options.  
It is the default action, so you can omit `'action': 'upload'` if you want a cleaner look.

```js
  files: [
    {expand: true, cwd: 'dist/staging/scripts', src: ['**'], dest: 'app/scripts'},
    {expand: true, cwd: 'dist/staging/styles', src: ['**'], dest: 'app/styles'}
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
    {expand: true, cwd: 'dist/staging/scripts', src: ['**'], dest: 'app/scripts', params: {CacheControl: '2000'}},
    {expand: true, cwd: 'dist/staging/styles', src: ['**'], dest: 'app/styles'}
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

#### `download`

The `download` action requires a `cwd`, a `dest` and *no* `src` like so:

```js
  {cwd: 'download/', dest: 'app/', 'action': 'download'}
```

The `dest` is used as the Prefix in the [listObjects command](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3_20060301.html#listObjects-property) to find the files _on the server_. 
The `cwd` is used as the root folder to write the downloaded files. The inner folder structure will be reproduced inside that folder.

If you specify '/' for `dest`, the whole bucket will be downloaded (with the limit of 1000 objects, so may need to run it twice if you have lots of objects in your bucket).

If you specify 'app', all paths starting with 'app' will be targeted (e.g. 'app.js', 'app/myapp.js', 'app/index.html, 'app backup/donotdelete.js') but it will leave alone the others (e.g. 'my app/app.js', 'backup app/donotdelete.js').

#### `delete`

The `delete` action just requires a `dest`, no need for a `dest` like so:

```js
  {dest: 'app/', 'action': 'delete'}
```

The `dest` is used as the Prefix in the [listObjects command](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3_20060301.html#listObjects-property) to find the files _on the server_. 

If you specify '/', the whole bucket will be wiped (with the limit of 1000 objects, so may need to run it twice if you have lots of objects in your bucket).

If you specify 'app', all paths starting with 'app' will be targeted (e.g. 'app.js', 'app/myapp.js', 'app/index.html, 'app backup/donotdelete.js') but it will leave alone the others (e.g. 'my app/app.js', 'backup app/donotdelete.js').

You can put a `delete` action in a separate target or in the same target as your `upload`. However, if you put it in the same target, changing the concurrency might cause mix-ups. 

Please, be careful with the `delete` action. It doesn't forgive.

### Usage Examples

#### Default Options
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
    concurrency: 5 // 5 simultaneous upload
  },
  staging: {
    options: {
      bucket: 'my-wonderful-staging-bucket',
      concurrency: 1 // Avoid problems with uploading and deleting simultaneously
    },
    files: [
      {dest: 'app/', cwd: 'backup/staging', action: 'download'},
      {expand: true, cwd: 'dist/staging/scripts', src: ['**'], dest: 'app/scripts'},
      {expand: true, cwd: 'dist/staging/styles', src: ['**'], dest: 'app/styles'},
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
      {expand: true, cwd: 'dist/production', src: ['**'], dest: 'app/'},
      {expand: true, cwd: 'assets/prod', src: ['**'], dest: 'assets/', params: {CacheControl: '2000'},
      // CacheControl only applied to the assets folder
      // LICENCE inside that folder will have ContentType equal to 'text/plain'
    ]
  },
  clean_production: {
    options: {
      bucket: 'my-wonderful-production-bucket'
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
      {expand: true, cwd: 'secret_garden', src: ['*.key'], dest: 'secret/'},
    ]
  },
},
```

## Todos
- Mock options for actual unit testing

## Release History
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