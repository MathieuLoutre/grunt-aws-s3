var expect = require('chai').expect;
var fs = require('fs');
var AWS = require('mock-aws-s3'); // to get the walk method

describe('S3', function () {

	it('should do what it is supposed to do', function (done) {

		var first = AWS.walk(__dirname + '/local/bucket/first');
		var second = AWS.walk(__dirname + '/local/bucket/second');
		var updated = AWS.walk(__dirname + '/local/bucket/first/otters/updated');
		var backup = AWS.walk(__dirname + '/local/download/backup');
		var third = AWS.walk(__dirname + '/local/bucket/third');
		var fourth_bucket = AWS.walk(__dirname + '/local/bucket/fourth');
		var fourth = AWS.walk(__dirname + '/local/download/fourth');
		var fifth = AWS.walk(__dirname + '/local/download/fifth');
		var fifth_bucket = AWS.walk(__dirname + '/local/bucket/fifth');
		var copies = AWS.walk(__dirname + '/local/bucket/copies');

		expect(first.length).to.equal(1473);
		expect(second.length).to.equal(1472);
		expect(updated.length).to.equal(0);
		expect(backup.length).to.equal(2945);
		expect(third.length).to.equal(912);
		expect(fourth_bucket.length).to.equal(2945);
		expect(fourth.length).to.equal(1472);
		expect(fifth.length).to.equal(560);
		expect(fifth_bucket.length).to.equal(2);
		expect(copies.length).to.equal(1473);

		done();
	});
});