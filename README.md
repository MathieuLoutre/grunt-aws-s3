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

### Options

#### options.accessKeyId
Type: `String`

The AWS accessKeyId. You can load it via JSON as shown in the example or use the `AWS_ACCESS_KEY_ID` environment variable.

#### options.secretAccessKey
Type: `String`

The AWS secretAccessKey. You can load it via JSON as shown in the example or use the `AWS_SECRET_ACCESS_KEY` environment variable.

#### options.region
Type: `String`

The AWS region.

#### options.bucket
Type: `String`

The AWS bucket name you want to upload to.

#### options.access
Type: `String`
Default: 'public-read'

The ACL you want to apply to ALL the files that will be uploaded. The ACL values can be found [here](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/frames.html#!http%3A//docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3_20060301.html)

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
  },
  staging: {
    options: {
      bucket: 'my-wonderful-staging-bucket'
    },
    files: [
      {expand: true, cwd: "dist/staging/scripts", src: ['**'], dest: 'app/scripts'},
      {expand: true, cwd: "dist/staging/styles", src: ['**'], dest: 'app/styles'},
    ]
  },
  production: {
    options: {
      bucket: 'my-wonderful-production-bucket'
    },
    files: [
      {expand: true, cwd: "dist/production", src: ['**'], dest: 'app/'},
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