var expect = require('chai').expect;
var fs = require('fs');
var AWS = require('mock-aws-s3'); // to get the walk method

describe('S3', function () {

	it('should do what it is supposed to do', function (done) {

		var first = AWS.walk(__dirname + '/local/bucket/first');
		var second = AWS.walk(__dirname + '/local/bucket/second');
		var updated = AWS.walk(__dirname + '/local/bucket/first/otters/updated')
		var backup = AWS.walk(__dirname + '/local/download/backup')

		expect(first.length).to.equal(1473);
		expect(second.length).to.equal(1472);
		expect(updated.length).to.equal(0);
		expect(backup.length).to.equal(2945);

		done();
	});
});