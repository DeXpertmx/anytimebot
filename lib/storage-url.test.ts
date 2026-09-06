/**
 * Tests for the pure storage-URL helpers (no network, no DB).
 * Runs with node:test + tsx.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isOwnedKey, storageKeyFromUrl, storageUrlFor } from './storage-url';

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

describe('isOwnedKey', () => {
  test('accepts keys inside the user\'s own namespaces', () => {
    assert.equal(isOwnedKey('logos/u1/1.png', 'u1'), true);
    assert.equal(isOwnedKey('avatars/u1/x.png', 'u1'), true);
    assert.equal(isOwnedKey('customers/u1/c1/x.png', 'u1'), true);
  });

  test('rejects keys of other users or unrelated paths', () => {
    assert.equal(isOwnedKey('logos/u2/1.png', 'u1'), false);
    assert.equal(isOwnedKey('avatars/u1/x.png', 'u2'), false);
    assert.equal(isOwnedKey('__anytimebot_probe/x.txt', 'u1'), false);
    assert.equal(isOwnedKey('', 'u1'), false);
    assert.equal(isOwnedKey(null, 'u1'), false);
  });
});
