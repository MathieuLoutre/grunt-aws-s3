var expect = require('chai').expect;
var fs = require('fs');

// Gathered from http://stackoverflow.com/questions/5827612/node-js-fs-readdir-recursive-directory-search
function walk (dir) {

	var results = [];
	var list = fs.readdirSync(dir);

	list.forEach(function (file) {

		file = dir + '/' + file;
		var stat = fs.statSync(file);

		if (stat && stat.isDirectory()) {
			results = results.concat(walk(file));
		}
		else {
			results.push(file);
		}
	});

	return results;
}

describe('S3', function () {

	it('should do what it is supposed to do', function (done) {

		var first = walk(__dirname + '/local/bucket/first');
		var second = walk(__dirname + '/local/bucket/second');
		var updated = walk(__dirname + '/local/bucket/first/otters/updated');
		var backup = walk(__dirname + '/local/download/backup');
		var third = walk(__dirname + '/local/bucket/third');
		var fourth_bucket = walk(__dirname + '/local/bucket/fourth');
		var fourth = walk(__dirname + '/local/download/fourth');
		var fifth = walk(__dirname + '/local/download/fifth');
		var fifth_bucket = walk(__dirname + '/local/bucket/fifth');
		var copies = walk(__dirname + '/local/bucket/copies');

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