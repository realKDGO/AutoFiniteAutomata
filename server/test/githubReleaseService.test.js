import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetCacheForTests,
  __setCacheTtlForTests,
  getLatestRelease,
  getLatestReleaseVersion,
  normalizeVersionTag,
} from '../src/services/githubReleaseService.js';

test.beforeEach(() => {
  __resetCacheForTests();
  __setCacheTtlForTests(5 * 60 * 1000);
});

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

test('getLatestRelease normalizes a full successful GitHub Releases API response, including patch notes', async t => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      tag_name: 'v1.0.1',
      name: 'AutoFA v1.0.1',
      published_at: '2026-08-18T12:00:00Z',
      body: '- Improved Android experience\n- Added automatic updates',
    }),
  });
  t.after(() => {
    global.fetch = originalFetch;
  });

  const release = await getLatestRelease();
  assert.equal(release.version, '1.0.1');
  assert.equal(release.releaseName, 'AutoFA v1.0.1');
  assert.equal(release.releaseDate, '2026-08-18T12:00:00Z');
  assert.match(release.releaseNotes, /Improved Android experience/);
  assert.match(release.downloadUrl, /releases\/latest\/download\/AutoFa\.apk$/);
});

test('getLatestRelease tolerates a release with no name/body instead of breaking', async t => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ tag_name: 'v1.0.2' }),
  });
  t.after(() => {
    global.fetch = originalFetch;
  });

  const release = await getLatestRelease();
  assert.equal(release.version, '1.0.2');
  assert.equal(release.releaseName, null);
  assert.equal(release.releaseNotes, null);
});

test('getLatestRelease falls back to the last known-good cached release (not the hard fallback) once the cache expires and GitHub then fails', async t => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async () => ({
    ok: true,
    json: async () => ({ tag_name: 'v1.0.3', body: 'Stable release notes' }),
  });
  const first = await getLatestRelease();
  assert.equal(first.version, '1.0.3');

  // Force the cache to be treated as stale, then make GitHub start failing.
  __setCacheTtlForTests(0);
  global.fetch = async () => {
    throw new Error('simulated outage');
  };
  const second = await getLatestRelease();
  // Should still surface the last known-good version (1.0.3), NOT the
  // hard-coded fallback (1.0.0) — a temporary outage shouldn't erase
  // release notes users already had.
  assert.equal(second.version, '1.0.3');
  assert.equal(second.releaseNotes, 'Stable release notes');
});
