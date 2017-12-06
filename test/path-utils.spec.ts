import * as Promise from 'bluebird';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

import * as PathUtils from '../lib/path-utils';

chai.use(chaiAsPromised);
const expect = chai.expect;

describe('Path utilities', () => {
	it('should correctly create relative paths', (done) => {
		expect(PathUtils.relative('.', 'testDirectory'))
			.to.equal('testDirectory');

		expect(PathUtils.relative('test1', 'test1/test2'))
			.to.equal('test2');

		expect(PathUtils.relative('./test1', 'test1/test2'))
			.to.equal('test2');

		expect(PathUtils.relative('.', 'file'))
			.to.equal('file');

		expect(PathUtils.relative('.', './file'))
			.to.equal('file');

		expect(PathUtils.relative('test1/test2/', 'test1/test2/test3'))
			.to.equal('test3');

		done();
	});

	it('should correctly detect contained paths', (done) => {
		expect(PathUtils.contains('.', 'test')).to.equal(true);
		expect(PathUtils.contains('.', './test')).to.equal(true);
		expect(PathUtils.contains('./test', 'test/file')).to.equal(true);
		expect(PathUtils.contains('./test1/test2', 'test1/file')).to.equal(false);
		expect(PathUtils.contains('./test1', 'file')).to.equal(false);
		expect(PathUtils.contains('test1/test2/test3', 'test1')).to.equal(false);

		expect(PathUtils.contains('./test1/test2/test3', 'test1/test2/test3/file'))
			.to.equal(true);

		expect(PathUtils.contains('.', '..')).to.equal(false);
		expect(PathUtils.contains('test1', 'test2/../test1/file')).to.equal(true);

		done();
	});
});
