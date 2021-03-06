'use strict';
/* eslint max-nested-callbacks:[2,5] */

const sinon = require('sinon'),
  _ = require('lodash'),
  expect = require('chai').expect,
  filename = __filename.split('/').pop().split('.').shift(),
  lib = require('./' + filename),
  h = require('highland'),
  errors = require('./errors'),
  util = require('./util'),
  mockErr = new Error();

describe(_.startCase(filename), function () {
  let sandbox;

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
    sandbox.stub(util, 'streamFetchJson');
    sandbox.stub(util, 'streamFetch');
    sandbox.stub(util, 'streamFetchText');
    sandbox.stub(util, 'getSite');
  });
  afterEach(function () {
    sandbox.restore();
  });


  describe(filename, function () {
    describe('applyHandlers', function () {
      const fn = lib[this.title],
        mockPage = {
          content: [{
            _ref: 'a.com/components/cmpt1/instances/1',
            test: 'bar'
          }]
        },
        mockSite = {name: 'testSite'},
        mockPrefix = 'http://a.com',
        mockHandlers = {
          cmpt1: (ref, data) => ({foo: data.test})
        };
      let mockDoc;

      beforeEach(function () {
        mockDoc = {uri: 'a.com/pages/b'};
      });

      it ('applies handlers if there is a matching component', function () {
        const mockContext = {
          prefix: mockPrefix,
          handlers: mockHandlers,
          site: mockSite
        };

        util.streamFetchJson.withArgs('http://a.com/pages/b.json')
          .returns(h.of(mockPage));
        return fn(mockDoc, mockContext)
          .toPromise(Promise)
          .then((result) => {
            expect(result.foo).to.equal('bar');
          });
      });

      it ('exposes site to handlers', function () {
        const mockContext = {
          prefix: mockPrefix,
          handlers: mockHandlers,
          site: mockSite,
          handlers: {
            cmpt1: (ref, data, {site}) => ({foo: site.name})
          }
        };

        util.streamFetchJson.withArgs('http://a.com/pages/b.json')
          .returns(h.of(mockPage));
        return fn(mockDoc, mockContext)
          .toPromise(Promise)
          .then((result) => {
            expect(result.foo).to.equal('testSite');
          });
      });

      it ('exposes context to handlers', function () {
        const mockContext = {
          prefix: mockPrefix,
          handlers: {
            cmpt1: (ref, data, {prefix}) => ({foo: prefix})
          },
          site: mockSite
        };

        util.streamFetchJson.withArgs('http://a.com/pages/b.json')
          .returns(h.of(mockPage));
        return fn(mockDoc, mockContext)
          .toPromise(Promise)
          .then((result) => {
            expect(result.foo).to.equal(mockPrefix);
          });
      });

      it ('detects deep components', function () {
        const mockPage = {
            content: [{
              _ref: 'a.com/components/cmpt2/instances/1',
              someMoreContent: [{
                _ref: 'a.com/components/cmpt1/instances/1',
                test: 'bar'
              }]
            }]
          },
          mockContext = {
            prefix: mockPrefix,
            handlers: mockHandlers,
            site: mockSite
          };

        util.streamFetchJson.withArgs('http://a.com/pages/b.json')
          .returns(h.of(mockPage));
        return fn(mockDoc, mockContext)
          .toPromise(Promise)
          .then((result) => {
            expect(result.foo).to.equal('bar');
          });
      });

      it ('recognizes promise-returning handlers', function () {
        const mockContext = {
          prefix: mockPrefix,
          handlers: {
            cmpt1: (ref, data) => Promise.resolve({foo: data.test})
          }
        };

        util.streamFetchJson.withArgs('http://a.com/pages/b.json')
          .returns(h.of(mockPage));
        return fn(mockDoc, mockContext)
          .toPromise(Promise)
          .then((result) => {
            expect(result.foo).to.equal('bar');
          });
      });

      it ('recognizes stream-returning handlers', function () {
        const mockContext = {
          prefix: mockPrefix,
          handlers: {
            cmpt1: (ref, data) => h.of({foo: data.test})
          }
        };

        util.streamFetchJson.withArgs('http://a.com/pages/b.json')
          .returns(h.of(mockPage));
        return fn(mockDoc, mockContext)
          .toPromise(Promise)
          .then((result) => {
            expect(result.foo).to.equal('bar');
          });
      });

      it ('recognizes falsy-returning handlers', function () {
        const mockContext = {
          prefix: mockPrefix,
          handlers: {
            cmpt1: () => null
          }
        };

        util.streamFetchJson.withArgs('http://a.com/pages/b.json')
          .returns(h.of(mockPage));
        return fn(mockDoc, mockContext)
          .toPromise(Promise)
          .then(result => expect(result).to.eql({}));
      });
    });
    describe('addPublishData', function () {
      const fn = lib[this.title],
        mockUrl = 'http://foo.com/bar',
        mockPublishedPage = 'http://foo.com/pages/1@published',
        mockPrefix = 'http://foo.com';
      let mockDoc;

      beforeEach(function () {
        mockDoc = {uri: 'foo.com/pages/1'};
      });

      it ('sets "published", "publishedPageData", and "publishTime" if published version is retrieved', function () {
        util.streamFetchJson.withArgs(mockPublishedPage)
          .returns(h.of({
            url: mockUrl,
            lastModified: 100
          }));
        return fn(mockDoc, {prefix: mockPrefix})
          .toPromise(Promise)
          .then(result => {
            expect(result.url).to.equal(mockUrl);
            expect(result.published).to.be.true;
            expect(result.publishTime.getTime()).to.equal(100);
          });
      });

      it ('sets published to false and does not set url if published version 404s', function () {
        util.streamFetchJson.withArgs(mockPublishedPage)
          .returns(h(Promise.reject(new errors.request404())));
        return fn(mockDoc, {prefix: mockPrefix})
          .toPromise(Promise)
          .then(result => {
            expect(result.url).to.be.undefined;
            expect(result.published).to.be.false;
          });
      });

      it ('throws error if fetching published version throws other error', function (done) {
        util.streamFetchJson.withArgs(mockPublishedPage)
          .returns(h(Promise.reject(mockErr)));
        fn(mockDoc, {prefix: mockPrefix})
          .toPromise(Promise)
          .then(result => {
            done('expected error but got ' + JSON.stringify(result));
          })
          .catch((err) => {
            expect(err).to.equal(mockErr);
            done();
          });
      });

    });
    describe('addScheduleTime', function () {
      const fn = lib[this.title],
        mockSchedule = [{
          at: 1,
          publish: 'http://foo.com:/pages/1'
        }],
        mockPrefix = 'http://foo.com';
      let mockDoc;

      beforeEach(function () {
        mockDoc = {uri: 'foo.com/pages/1'};
      });

      it ('sets scheduled and scheduledTime if page is scheduled', function () {
        util.streamFetchJson.withArgs('http://foo.com/schedule')
          .returns(h.of(mockSchedule));

        return fn(mockDoc, {prefix: mockPrefix})
          .toPromise(Promise)
          .then((doc) => {
            expect(doc.scheduled).to.be.true;
            expect(doc.scheduledTime).to.equal(1);
          });
      });

      it ('sets scheduled to false if page is not in schedule', function () {
        const mockSchedule = [];

        util.streamFetchJson.withArgs('http://foo.com/schedule')
          .returns(h.of(mockSchedule));
        return fn(mockDoc, {prefix: mockPrefix})
          .toPromise(Promise)
          .then((doc) => {
            expect(doc.scheduled).to.be.false;
          });
      });

      it ('throws error if schedule is not retrieved', function (done) {
        util.streamFetchJson.withArgs('http://foo.com/schedule')
          .returns(h(Promise.reject(new Error())));
        fn(mockDoc, {prefix: mockPrefix})
          .toPromise(Promise)
          .then((doc) => {
            done('expected error but got ' + JSON.stringify(doc));
          })
          .catch(() => done());
      });
    });

    describe('validatePublishUrl', function () {
      const fn = lib[this.title],
        mockPrefix = 'http://foo.com',
        urlEncoded = Buffer.from('foo.com/bar').toString('base64');
      let mockDoc;

      beforeEach(function () {
        mockDoc = {
          uri: 'foo.com/pages/1',
          url: 'http://foo.com/bar'
        };
      });

      it ('keeps url if uri exists and points to correct page uri', function () {
        util.streamFetchText.withArgs(`http://foo.com/uris/${urlEncoded}`)
          .returns(h.of('foo.com/pages/1'));

        return fn(mockDoc, {prefix: mockPrefix})
          .toPromise(Promise)
          .then((doc) => {
            expect(doc).to.eql({});
          });
      });

      it ('removes url if uri exists but does not point to correct page uri', function () {
        util.streamFetchText.withArgs(`http://foo.com/uris/${urlEncoded}`)
          .returns(h.of('foo.com/pages/2'));

        return fn(mockDoc, {prefix: mockPrefix})
          .toPromise(Promise)
          .then((doc) => {
            expect(doc.url).to.be.null;
          });
      });

      it ('removes url if uri does not exist', function () {
        util.streamFetchText.withArgs(`http://foo.com/uris/${urlEncoded}`)
          .returns(h(Promise.reject(new errors.request404)));

        return fn(mockDoc, {prefix: mockPrefix})
          .toPromise(Promise)
          .then((doc) => {
            expect(doc.url).to.be.null;
          });
      });

      it ('throws error if uri fetch gives a non-404 error', function (done) {
        util.streamFetchText.withArgs(`http://foo.com/uris/${urlEncoded}`)
          .returns(h(Promise.reject(mockErr)));
        fn(mockDoc, {prefix: mockPrefix})
          .toPromise(Promise)
          .then((doc) => done('expect error but got ' + JSON.stringify(doc)))
          .catch((err) => {
            expect(err).to.equal(mockErr);
            done();
          });
      });

      it ('streams empty object if url is not set on doc', function () {
        fn({}, {prefix: mockPrefix})
          .toPromise(Promise)
          .then(result => expect(result).to.eql({}));
      });
    });

    describe('addSiteSlug', function () {
      const fn = lib[this.title],
        mockSlug = 'bar';
      let mockDoc = {uri: 'foo.com/pages/1'};

      it ('adds site slug', function () {
        return fn(mockDoc, {site: {slug: mockSlug}})
          .toPromise(Promise)
          .then((doc) => {
            expect(doc.siteSlug).to.equal(mockSlug);
          });
      });
    });
  });

  describe('applyCustomTransforms', function () {
    const fn = lib[this.title],
      mockTransforms = {
        a: () => ({x: 1}),
        b: () => Promise.resolve({y: 2}),
        c: () => h.of({z: 3})
      };
    let mockDoc;

    beforeEach(function () {
      mockDoc = {foo: 'bar'};
    });

    it ('applies transforms specified in context and streams merged result', function () {
      return fn(mockDoc, {transforms: mockTransforms})
        .toPromise(Promise)
        .then(partialDoc => expect(partialDoc).to.eql({x: 1, y: 2, z: 3}));
    });

    it ('streams empty object if context.transforms is unspecified', function () {
      return fn(mockDoc, {})
        .toPromise(Promise)
        .then(partialDoc => expect(partialDoc).to.eql({}));
    });

  });
});
