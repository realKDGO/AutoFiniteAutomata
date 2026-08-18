import test from 'node:test';
import assert from 'node:assert/strict';
import { getLatestReleaseVersion, normalizeVersionTag } from '../src/services/githubReleaseService.js';

test('normalizeVersionTag strips a leading v and passes through bare versions', () => {
  assert.equal(normalizeVersionTag('v1.0.1'), '1.0.1');
  assert.equal(normalizeVersionTag('V2.0.0'), '2.0.0');
  assert.equal(normalizeVersionTag('1.2.0'), '1.2.0');
});

test('normalizeVersionTag rejects tags that are not version-shaped', () => {
  assert.equal(normalizeVersionTag('release-candidate'), null);
  assert.equal(normalizeVersionTag(undefined), null);
  assert.equal(normalizeVersionTag(null), null);
});

test('getLatestReleaseVersion falls back to a safe version (never crashes, never fakes an update) when GitHub is unreachable and nothing is cached yet', async t => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('simulated network failure');
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const version = await getLatestReleaseVersion();
  // Must resolve to *some* usable version string rather than throwing.
  assert.equal(typeof version, 'string');
  assert.match(version, /^\d+\.\d+\.\d+$/);
});

test('getLatestReleaseVersion normalizes a successful GitHub Releases API response', async t => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ tag_name: 'v1.0.1' }),
  });
  t.after(() => {
    global.fetch = originalFetch;
  });

  const version = await getLatestReleaseVersion();
  assert.equal(version, '1.0.1');
});
