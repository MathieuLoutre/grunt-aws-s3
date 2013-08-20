# grunt-aws-s3

> Upload files to AWS S3 using AWS SDK

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

### Actions

This Grunt task supports two modes of interaction with S3, `upload` and `delete`.

You choose the action by specifying the key `action` in the file hash like so:

```js
  {'action': 'upload', expand: true, cwd: "dist/js", src: ['**'], dest: 'app/js'}
```

By default, the action is `upload`.

The `delete` action just requires a `dest`, no need for a `dest` like so:

```js
  {dest: 'app/', 'action': 'delete'}
```

The `dest` is used as the Prefix in the [listObjects command](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3_20060301.html#listObjects-property) to find the files _on the server_. 

If you specify '/', the whole bucket will be wiped (with the limit of 1000 objects, so may need to run it twice if you have lots of objects in your bucket).

If you specify 'app', all paths starting with 'app' will be targeted (e.g. 'app.js', 'app/myapp.js', 'app/index.html, 'app backup/donotdelete.js') but it will leave alone the others (e.g. 'my app/app.js', 'backup app/donotdelete.js').

You can put a `delete` action in a separate target or in the same target as your upload. However, if you put it in the same target, changing the concurrency might cause mix-ups. 

Please, be careful with the `delete` action. It doesn't forgive.

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

Number of uploads in parallel. By default, there's no concurrency, the uploads are made one after the other.

#### options.params
Type: `Object`

A hash of the params you want to apply to the files. Useful to set the `ContentEncoding` to `gzip` for instance, or set the `ControlCache` value. The list of parameters can be found in the [documentation](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3_20060301.html#putObject-property). `params` will apply to *all* the files in the target.

#### options.mime
Type: `Object`

The MIME type of every file is determined by a MIME lookup using [node-mime](https://github.com/broofa/node-mime). If you want to override it, you can use this option object.
The keys are the file paths and the values are the MIME types.

```JSON
  {
    "path/to/file": "application/json",
    "path to/other/file": "application/gzip"
  }
```

You need to specify the full path of the file, including the 'cwd' part.

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
    accessKeyId: "<%= aws.AWSAccessKeyId %>", // Use the variables
    secretAccessKey: "<%= aws.AWSSecretKey %>", // You can also use env variables
    region: 'eu-west-1',
    concurrency: 5 // 5 simultaneous upload
  },
  staging: {
    options: {
      bucket: 'my-wonderful-staging-bucket',
      concurrency: 1 // Avoid problems with uploading and deleting simultaneously
    },
    files: [
      {expand: true, cwd: "dist/staging/scripts", src: ['**'], dest: 'app/scripts'},
      {expand: true, cwd: "dist/staging/styles", src: ['**'], dest: 'app/styles'},
      {dest: 'src/app', action: 'delete'},
    ]
  },
  production: {
    options: {
      bucket: 'my-wonderful-production-bucket'
      params: {
        ContentEncoding: 'gzip' // applies to all the files!
      }
    },
    files: [
      {expand: true, cwd: "dist/production", src: ['**'], dest: 'app/'},
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
  secret: {
    options: {
      bucket: 'my-wonderful-private-bucket',
      access: 'private'
    },
    files: [
      {expand: true, cwd: "secret_garden", src: ['*.key'], dest: 'secret/'},
    ]
  },
},
```

## Todos
- Mock options for actual unit testing

## Release History
* 2013-07-10   v0.1.0   First release
* 2013-07-11   v0.1.1   Fix bug when using env variable
* 2013-07-16   v0.2.0   Can set additional params
* 2013-07-17   v0.3.0   Option for concurrency
* 2013-07-30   v0.3.1   Region is now optional, defaults to US Standard
* 2013-08-14   v0.4.0   Add 'delete' option
* 2013-08-19   v0.4.1   Fix delete task executing separately from upload
* 2013-08-20   v0.5.0   Add option to override automatic MIME type detection