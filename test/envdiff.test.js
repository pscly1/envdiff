'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { parseDotenv, diffEnv, looksSecret, maskValue, formatReport } = require('../bin/envdiff');
const BIN = path.join(__dirname, '..', 'bin', 'envdiff');

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envdiff-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

test('parses plain key=value pairs', () => {
  const env = parseDotenv('A=1\nB=two\n');
  assert.deepStrictEqual(env, { A: '1', B: 'two' });
});

test('ignores comments and blank lines', () => {
  const env = parseDotenv('# note\n\nA=1\n   \nB=2\n');
  assert.deepStrictEqual(env, { A: '1', B: '2' });
});

test('strips quotes and inline comments', () => {
  const env = parseDotenv('A="quoted value"\nB=bare # trailing\nC=\'single\'\n');
  assert.strictEqual(env.A, 'quoted value');
  assert.strictEqual(env.B, 'bare');
  assert.strictEqual(env.C, 'single');
});

test('handles export prefix and escaped newlines', () => {
  const env = parseDotenv('export A=1\nB="line1\\nline2"\n');
  assert.strictEqual(env.A, '1');
  assert.strictEqual(env.B, 'line1\nline2');
});

test('handles CRLF line endings', () => {
  assert.deepStrictEqual(parseDotenv('A=1\r\nB=2\r\n'), { A: '1', B: '2' });
});

test('keeps empty values and equals signs inside values', () => {
  const env = parseDotenv('A=\nB=base64==\n');
  assert.strictEqual(env.A, '');
  assert.strictEqual(env.B, 'base64==');
});

test('diffEnv classifies only-left, only-right, changed, same', () => {
  const d = diffEnv({ A: '1', B: '2', C: '3' }, { A: '1', B: 'x', D: '4' });
  assert.deepStrictEqual(d.onlyLeft, ['C']);
  assert.deepStrictEqual(d.onlyRight, ['D']);
  assert.deepStrictEqual(d.changed, ['B']);
  assert.deepStrictEqual(d.same, ['A']);
});

test('looksSecret spots obvious secret keys', () => {
  assert.ok(looksSecret('API_KEY'));
  assert.ok(looksSecret('DB_PASSWORD'));
  assert.ok(looksSecret('GITHUB_TOKEN'));
  assert.ok(!looksSecret('PORT'));
  assert.ok(!looksSecret('LOG_LEVEL'));
});

test('maskValue hides secrets but respects reveal', () => {
  assert.strictEqual(maskValue('API_KEY', 'sk-abcdefghijklmn', false).includes('abcdef'), false);
  assert.strictEqual(maskValue('API_KEY', 'sk-abcdefghijklmn', true), 'sk-abcdefghijklmn');
  assert.strictEqual(maskValue('PORT', '8080', false), '8080');
});

test('formatReport reports in-sync when nothing differs', () => {
  const out = formatReport(diffEnv({ A: '1' }, { A: '1' }, 'a', 'b'), {});
  assert.match(out, /in sync/);
});

test('CLI exits 0 for identical files', () => {
  const a = tmpFile('a.env', 'A=1\nB=2\n');
  const b = tmpFile('b.env', 'A=1\nB=2\n');
  const out = execFileSync(process.execPath, [BIN, a, b], { encoding: 'utf8' });
  assert.match(out, /in sync/);
});

test('CLI exits 1 when a key is missing', () => {
  const a = tmpFile('a.env', 'A=1\nB=2\n');
  const b = tmpFile('b.env', 'A=1\n');
  let code = 0;
  try {
    execFileSync(process.execPath, [BIN, a, b], { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    code = err.status;
  }
  assert.strictEqual(code, 1);
});

test('CLI --only-missing ignores value drift', () => {
  const a = tmpFile('a.env', 'A=1\nB=2\n');
  const b = tmpFile('b.env', 'A=9\nB=2\n');
  const out = execFileSync(process.execPath, [BIN, a, b, '--only-missing'], { encoding: 'utf8' });
  assert.match(out, /different values/);
});

test('CLI --json emits parseable output even when it exits 1', () => {
  const a = tmpFile('a.env', 'A=1\n');
  const b = tmpFile('b.env', 'A=2\n');
  let out = '';
  let code = 0;
  try {
    out = execFileSync(process.execPath, [BIN, a, b, '--json'], { encoding: 'utf8' });
  } catch (err) {
    out = err.stdout;   // drift means exit 1, but stdout is still valid JSON
    code = err.status;
  }
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.changed[0].key, 'A');
  assert.strictEqual(code, 1);
});

test('CLI --keys narrows the comparison', () => {
  const a = tmpFile('a.env', 'A=1\nB=2\nC=3\n');
  const b = tmpFile('b.env', 'A=1\nB=9\n');
  const out = execFileSync(process.execPath, [BIN, a, b, '--keys', 'A', '--json'], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.deepStrictEqual(parsed.changed, []);
  assert.deepStrictEqual(parsed.onlyLeft, []);
});

test('CLI --format github emits workflow annotations', () => {
  const a = tmpFile('a.env', 'A=1\nB=2\n');
  const b = tmpFile('b.env', 'A=1\n');
  let out = '';
  let code = 0;
  try {
    out = execFileSync(process.execPath, [BIN, a, b, '--format', 'github'], { encoding: 'utf8' });
  } catch (err) {
    out = err.stdout;
    code = err.status;
  }
  assert.match(out, /::error file=b\.env::missing key B/);
  assert.strictEqual(code, 1);
});

test('CLI --format rejects unknown values', () => {
  const a = tmpFile('a.env', 'A=1\n');
  const b = tmpFile('b.env', 'A=1\n');
  let code = 0;
  try {
    execFileSync(process.execPath, [BIN, a, b, '--format', 'yaml'], { stdio: 'pipe' });
  } catch (err) {
    code = err.status;
  }
  assert.strictEqual(code, 2);
});

test('CLI exits 2 on a missing file', () => {
  const a = tmpFile('a.env', 'A=1\n');
  let code = 0;
  try {
    execFileSync(process.execPath, [BIN, a, '/nonexistent/nope.env'], { stdio: 'pipe' });
  } catch (err) {
    code = err.status;
  }
  assert.strictEqual(code, 2);
});
