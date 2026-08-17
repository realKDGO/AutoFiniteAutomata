import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSemver, isUpdateAvailable, parseSemver } from '../../client/src/utils/semver.js';

test('parseSemver parses standard and prefixed versions', () => {
  assert.deepEqual(parseSemver('1.0.0'), [1, 0, 0]);
  assert.deepEqual(parseSemver('v1.0.1'), [1, 0, 1]);
  assert.deepEqual(parseSemver('2.1'), [2, 1, 0]);
  assert.deepEqual(parseSemver(''), [0, 0, 0]);
  assert.deepEqual(parseSemver(null), [0, 0, 0]);
});

test('compareSemver performs proper numeric semantic comparison', () => {
  // Test examples from specification:
  // 1.0.10 > 1.0.9
  assert.equal(compareSemver('1.0.10', '1.0.9'), 1);
  assert.equal(compareSemver('1.0.9', '1.0.10'), -1);

  // 1.1.0 > 1.0.9
  assert.equal(compareSemver('1.1.0', '1.0.9'), 1);
  assert.equal(compareSemver('1.0.9', '1.1.0'), -1);

  // 2.0.0 > 1.9.9
  assert.equal(compareSemver('2.0.0', '1.9.9'), 1);
  assert.equal(compareSemver('1.9.9', '2.0.0'), -1);

  // 1.0.0 == 1.0.0
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('v1.0.0', '1.0.0'), 0);

  // 1.0.1 > 1.0.0
  assert.equal(compareSemver('1.0.1', '1.0.0'), 1);
});

test('isUpdateAvailable returns true only when latest > current', () => {
  // Current 1.0.0 / Latest 1.0.0 -> No update
  assert.equal(isUpdateAvailable('1.0.0', '1.0.0'), false);

  // Current 1.0.0 / Latest 1.0.1 -> Update available
  assert.equal(isUpdateAvailable('1.0.0', '1.0.1'), true);

  // Current 1.0.1 / Latest 1.0.0 -> No downgrade
  assert.equal(isUpdateAvailable('1.0.1', '1.0.0'), false);

  // Semantic tests
  assert.equal(isUpdateAvailable('1.0.9', '1.0.10'), true);
  assert.equal(isUpdateAvailable('1.0.9', '1.1.0'), true);
  assert.equal(isUpdateAvailable('1.9.9', '2.0.0'), true);
});
