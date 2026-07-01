import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyResource, extractResources, filenameFromResource, isKnownUnavailable, sortResources } from '../src/parser.js';

test('extracts pdf field URLs from Chaoxing-style response text', () => {
  const text = 'callback({pdf:"https:\\/\\/example.chaoxing.com\\/download\\/abc.pdf", other:1})';
  const resources = extractResources(text, { sourceUrl: 'https://mooc1.chaoxing.com/ananas/status/abc?flag=normal' });

  assert.equal(resources.length, 1);
  assert.equal(resources[0].url, 'https://example.chaoxing.com/download/abc.pdf');
  assert.equal(resources[0].kind, 'pdf');
  assert.equal(resources[0].sourceUrl, 'https://mooc1.chaoxing.com/ananas/status/abc?flag=normal');
});

test('deduplicates direct pdf and download URLs', () => {
  const text = [
    '"https://d0.ananas.chaoxing.com/download/object123"',
    '"https://d0.ananas.chaoxing.com/download/object123"',
    '"https://example.com/files/lecture%201.pdf?token=abc"'
  ].join('\n');
  const resources = extractResources(text, { sourceUrl: 'https://example.com/page' });

  assert.deepEqual(resources.map((item) => item.url), [
    'https://d0.ananas.chaoxing.com/download/object123',
    'https://example.com/files/lecture%201.pdf?token=abc'
  ]);
});

test('derives a safe filename from resource URL', () => {
  const resource = { url: 'https://example.com/path/lecture%201.pdf?token=abc', kind: 'pdf' };

  assert.equal(filenameFromResource(resource), 'lecture 1.pdf');
});

test('sorts verified mooc1 pdf resources before forbidden candidates', () => {
  const resources = [
    {
      url: 'https://mooc1.chaoxing.com/download/695854ca875ad352afec0ecda9b5bc58',
      kind: 'download',
      status: 'forbidden',
      foundAt: 4
    },
    {
      url: 'https://pan-yz.chaoxing.com/file/1b91316b5c425434bcbdf076202b4d9b.pdf',
      kind: 'pdf',
      status: 'forbidden',
      foundAt: 3
    },
    {
      url: 'https://mooc1.chaoxing.com/file/1b91316b5c425434bcbdf076202b4d9b.pdf',
      kind: 'pdf',
      status: 'ok',
      foundAt: 2
    },
    {
      url: 'https://mooc1.chaoxing.com/download/1b91316b5c425434bcbdf076202b4d9b',
      kind: 'download',
      status: 'forbidden',
      foundAt: 1
    }
  ];

  assert.deepEqual(sortResources(resources).map((item) => item.url), [
    'https://mooc1.chaoxing.com/file/1b91316b5c425434bcbdf076202b4d9b.pdf',
    'https://pan-yz.chaoxing.com/file/1b91316b5c425434bcbdf076202b4d9b.pdf',
    'https://mooc1.chaoxing.com/download/695854ca875ad352afec0ecda9b5bc58',
    'https://mooc1.chaoxing.com/download/1b91316b5c425434bcbdf076202b4d9b'
  ]);
});

test('classifies resource URLs by file extension', () => {
  assert.equal(classifyResource('https://mooc1.chaoxing.com/file/course.pdf'), 'pdf');
  assert.equal(classifyResource('https://mooc1.chaoxing.com/download/8301127eb1e6ab99211fd48df4b7efb7.png'), 'image');
  assert.equal(classifyResource('https://mooc1.chaoxing.com/download/all-packages.js'), 'script');
  assert.equal(classifyResource('https://mooc1.chaoxing.com/download/695854ca875ad352afec0ecda9b5bc58'), 'download');
});

test('keeps pdf resources before verified scripts and images', () => {
  const resources = [
    {
      url: 'https://mooc1.chaoxing.com/download/all-packages.js',
      kind: 'script',
      status: 'ok',
      foundAt: 3
    },
    {
      url: 'https://mooc1.chaoxing.com/download/8301127eb1e6ab99211fd48df4b7efb7.png',
      kind: 'image',
      status: 'ok',
      foundAt: 2
    },
    {
      url: 'https://mooc1.chaoxing.com/file/1b91316b5c425434bcbdf076202b4d9b.pdf',
      kind: 'pdf',
      status: 'error',
      foundAt: 1
    }
  ];

  assert.deepEqual(sortResources(resources).map((item) => item.kind), ['pdf', 'image', 'script']);
});

test('does not treat validation errors as known unavailable', () => {
  assert.equal(isKnownUnavailable({ status: 'error' }), false);
  assert.equal(isKnownUnavailable({ status: 'forbidden' }), true);
  assert.equal(isKnownUnavailable({ status: 'missing' }), true);
});
