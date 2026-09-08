import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'yaml';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const SITES_DIR = path.join(PROJECT_ROOT, '.github/workflows/sites');
const LOAD_SITES_SCRIPT = path.join(PROJECT_ROOT, '.github/workflows/load_sites.py');

const REQUIRED_FIELDS = [
  'CNAME',
  'TARGET_REPO',
  'SITE_URL',
  'DEV_PROXY_TARGET',
  'DEV_PROXY_HEADER',
];

test('sites directory contains valid site configurations', () => {
  assert.ok(fs.existsSync(SITES_DIR), 'sites directory must exist');

  const files = fs.readdirSync(SITES_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  assert.ok(files.length >= 2, 'should have at least ptt.yml and ptt2.yml');
  assert.ok(files.includes('ptt.yml'), 'ptt.yml must exist');
  assert.ok(files.includes('ptt2.yml'), 'ptt2.yml must exist');

  for (const file of files) {
    if (file.startsWith('_') || file.startsWith('.')) continue;
    const content = fs.readFileSync(path.join(SITES_DIR, file), 'utf-8');
    const doc = yaml.parse(content);
    assert.ok(typeof doc === 'object' && doc !== null, `${file} should be a valid YAML map`);

    for (const field of REQUIRED_FIELDS) {
      assert.ok(doc[field], `${file} must contain required field "${field}"`);
      assert.equal(typeof doc[field], 'string', `${file} field "${field}" must be a string`);
    }
  }
});

test('ptt.yml and ptt2.yml have correct values', () => {
  const ptt = yaml.parse(fs.readFileSync(path.join(SITES_DIR, 'ptt.yml'), 'utf-8'));
  assert.equal(ptt.CNAME, 'term.ptt.cc');
  assert.equal(ptt.TARGET_REPO, 'ptt/term.ptt.cc');
  assert.equal(ptt.THEME, 'ptt.cc');
  assert.equal(ptt.SITE_TYPE, 'ptt');

  const ptt2 = yaml.parse(fs.readFileSync(path.join(SITES_DIR, 'ptt2.yml'), 'utf-8'));
  assert.equal(ptt2.CNAME, 'term.ptt2.cc');
  assert.equal(ptt2.TARGET_REPO, 'ptt/term.ptt2.cc');
  assert.equal(ptt2.THEME, 'ptt2.cc');
  assert.equal(ptt2.SITE_TYPE, 'ptt');
});

test('load_sites.py outputs valid GitHub Actions matrix JSON', () => {
  const output = execFileSync('python3', [LOAD_SITES_SCRIPT], {
    encoding: 'utf-8',
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
  });

  const match = output.match(/^matrix=(.+)$/m);
  assert.ok(match, 'output must contain matrix=<json>');

  const parsed = JSON.parse(match[1]);
  assert.ok(Array.isArray(parsed.site), 'matrix must have "site" array');
  assert.ok(parsed.site.length >= 2, 'matrix must contain at least 2 sites');

  const pttEntry = parsed.site.find((s) => s.SITE_ID === 'ptt');
  assert.ok(pttEntry, 'ptt entry must exist in matrix');
  assert.equal(pttEntry.CNAME, 'term.ptt.cc');
  assert.equal(pttEntry.BRANCH, 'gh-pages');
  assert.equal(pttEntry.DYNAMIC_TITLE, 'false');

  const ptt2Entry = parsed.site.find((s) => s.SITE_ID === 'ptt2');
  assert.ok(ptt2Entry, 'ptt2 entry must exist in matrix');
  assert.equal(ptt2Entry.CNAME, 'term.ptt2.cc');
  assert.equal(ptt2Entry.BRANCH, 'gh-pages');
  assert.equal(ptt2Entry.DYNAMIC_TITLE, 'false');
});
