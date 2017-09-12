# CHANGELOG

### v2.0.0
- Support different compression algorithms, remove support for `gzipRename`, use `compressionRename` now (by @smeder)

### v1.0.0
- Start semantic versioning
- Warning when cwd used without expand by @stevemayhew
- Update mocking module and fixed tests

### v0.14.5
- Support for grunt 1.0.0 (goes from ~0.4.0 to >= 0.4.0)

### v0.14.4
- add `s3ForcePathStyle` to params by @albert-lacki

### v0.14.3
- auto generate fixtures by @frankcortes

### v0.14.2
- add `awsProfile` option by @trioni

### v0.14.1
- Fix gzip ContentEncoding and ContentType leaking to other files

### v0.14.0
- Export uploaded files to grunt config (an idea from @srlmproductions)

### v0.13.1
- Fix ACL on copy by @rayd

### v0.13.0
- Fix tests
- new `overwrite` option to prevent overwriting existing files (based on @nickjackson's PR)
- update mock library

### v0.12.3
- Add warning when no dest is defined

### v0.12.2
- make differential work with gzipRename by @dedsm

### v0.12.1
- gzipRename option to change extension of gzip files as they are uploaded

### v0.12.0
- Add basic gzip support

### v0.11.1
- Fix url encoding for copy action by @ahageali

### v0.11.0
- Support for copy action

### v0.10.4
- Fix encoding in mime type (w/ @jeantil)

### v0.10.3
- Use correct method in mime type lib by @takeno

### v0.10.1
- Fix charset with new mime package by @jeantil

### v0.10.0
- Endpoint option. 
- Drop support for 0.8.x. 
- Fix uploading an empty dir #40
- Unify dest base format #44
- FIx uploading no files #46

### v0.9.4
- Add session token env variable and option by @azaharakis

### v0.9.3
- Progress bar (by @seth-admittedly)
- Fix #36, differential didn't work at root after `0.9.0`

### v0.9.2
- Unpublished because of incomplete fix for #36

### v0.9.1
- Add signatureVersion option (by @ivanzhaowy)

### v0.9.0
- ListObjects for dest instead of the whole bucket by @royra
- Update AWS SDK to 2.0.0 to fix #30

### v0.8.6
- Don't check for credentials to allow IAM use by @joshuaspence

### v0.8.5 
- New option to display changes only

### v0.8.4
- Fix bug in setImmediate support detection (was using the shim even on Node 0.10.x)

### v0.8.2-3
- Unpublished because the attempt to better detect setImmediate was faulty

### v0.8.1
- Shim setImmediate to support Node 0.8.x

### v0.8.0
- If a directory is found during download, it will be skipped (and won't create empty dirs). This happened only a an empty directory has been created manually on S3 (by @nicolindemann)
- Use a glob pattern to exclude files when downloading a folder (with @nicolindemann)
- Change dot colour wether the object has been downloaded/uploaded
- Exclude option for delete
- Refactor
- Stream option (with @craigloftus)
- Bug fixes on options priority (if you had differential set to true for the whole task/subtask but to false for a file object, true would take priority)

### v0.7.2

- Follow Grunt 0.4.2 guidelines and include external `lodash` and `async`
- Add more options (httpOptions, maxRetries, sslEnabled)
- Fix a bug when downloading and extra keys where sent to getObject
- Fix download of a single item. Key paths are now relative to given dest if dest is a directory or the file itself

### v0.7.1

- If a marker is not provided when listing objects but the list is flagged as truncated, use last element as marker (by @derekr)

### v0.7.0

- Grouping of uploads together (treated like `delete` and `download` action in the code)
- Improved log
- Debug option to do dry runs
- Differential upload based on MD5 checks (using S3's ETags)
- Differential download based on wether it exists locally or not, MD5 checks and date
- Differential delete based on wether it still exists locally or not
- Tests using `mock-aws-s3` to replace the AWS package during testing
- Code restructure/formatting
- Update docs

### v0.6.0

- Add 'download' option.
- Fix `options.params` not being applied
- Add a `params` option field to the file hash which overrides `options.params`
- The `mime` hash has priority over the `params` option field of the file
- Multiple code style/lint fixes
- Remove uploading of empty directories
- Nicer log
- Add changelog!
- Better documentation

### v0.5.0

- Add option to override automatic MIME type detection

### v0.4.1

- Fix delete task executing separately from upload

### v0.4.0

- Add 'delete' option.
- _Breaks the use of `options.params`_

### v0.3.1

- Region is now optional, defaults to US Standard

### v0.3.0

- Option for upload concurrency.

### v0.2.0

- Can set additional params and bug fix

### v0.1.1

- Fix bug when using env variable.

### v0.1.0

- First release. Simple upload to S3.
