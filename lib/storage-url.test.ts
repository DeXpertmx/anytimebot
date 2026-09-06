/**
 * Tests for the pure storage-URL helpers (no network, no DB).
 * Runs with node:test + tsx.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { storageKeyFromUrl, storageUrlFor } from './storage-url';

describe('storageKeyFromUrl', () => {
  test('extracts the key from an app storage URL', () => {
    assert.equal(
      storageKeyFromUrl('https://anytimebot.app/api/storage/logos/abc/123.png'),
      'logos/abc/123.png',
    );
  });

  test('handles relative app URLs', () => {
    assert.equal(
      storageKeyFromUrl('/api/storage/logos/u1/1.png'),
      'logos/u1/1.png',
    );
  });

  test('returns null for external or empty URLs', () => {
    assert.equal(storageKeyFromUrl('https://cdn.example.com/logo.png'), null);
    assert.equal(storageKeyFromUrl(''), null);
    assert.equal(storageKeyFromUrl(null), null);
    assert.equal(storageKeyFromUrl(undefined), null);
  });

  test('decodes percent-encoded keys', () => {
    assert.equal(
      storageKeyFromUrl('/api/storage/logos/u1/mi%20logo.png'),
      'logos/u1/mi logo.png',
    );
  });
});

describe('storageUrlFor', () => {
  test('builds an absolute app URL without trailing slash', () => {
    assert.equal(
      storageUrlFor('https://anytimebot.app/', 'logos/u1/1.png'),
      'https://anytimebot.app/api/storage/logos/u1/1.png',
    );
  });
});
