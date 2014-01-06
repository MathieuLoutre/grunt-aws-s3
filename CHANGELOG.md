# CHANGELOG

### v0.7.3
- If a folder is found during download, it will be skipped (and won't create empty dirs). This happened only a an empty directory has been created manually on S3 (by @nicolindemann)

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
