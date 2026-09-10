import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

const ROOT_DIR = path.resolve();
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const CHROME_PATH = '/usr/bin/google-chrome';

test('E2E Build: Vite production build succeeds and generates complete PWA distribution', () => {
  // Execute clean build
  execSync('npm run build', { cwd: ROOT_DIR, stdio: 'pipe' });

  // 1. Validate required distribution files exist
  const requiredFiles = [
    'index.html',
    'manifest.webmanifest',
    'sw.js',
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-512.png',
    'apple-touch-icon.png',
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(DIST_DIR, file);
    assert.ok(fs.existsSync(filePath), `Missing required build artifact: ${file}`);
    const stat = fs.statSync(filePath);
    assert.ok(stat.size > 0, `Artifact ${file} is empty`);
  }

  // 2. Validate manifest.webmanifest conforms to PWA specification
  const manifestPath = path.join(DIST_DIR, 'manifest.webmanifest');
  const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  assert.equal(manifestContent.name, 'WebSocket Terminal');
  assert.equal(manifestContent.short_name, 'WSTerm');
  assert.equal(manifestContent.display, 'standalone');
  assert.equal(manifestContent.start_url, './');
  assert.ok(Array.isArray(manifestContent.icons));
  assert.ok(manifestContent.icons.some((icon) => icon.sizes === '192x192' && icon.src === 'icon-192.png'));
  assert.ok(manifestContent.icons.some((icon) => icon.sizes === '512x512' && icon.src === 'icon-512.png'));
  assert.ok(manifestContent.icons.some((icon) => icon.purpose === 'maskable' && icon.src === 'icon-maskable-512.png'));

  // 3. Validate index.html includes critical DOM anchors and metadata
  const indexPath = path.join(DIST_DIR, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf-8');

  assert.ok(html.includes('manifest.webmanifest'), 'HTML must link to Web App Manifest');
  assert.ok(html.includes('apple-touch-icon.png'), 'HTML must link to apple-touch-icon');
  assert.ok(html.includes('id="cmenuReact"'), 'Missing context menu root');
  assert.ok(html.includes('id="TermWindow"'), 'Missing TermWindow container');
  assert.ok(html.includes('id="t"'), 'Missing hidden input area');
  assert.ok(html.includes('id="fpsOverlay"'), 'Missing FPS overlay');
  assert.ok(html.includes('id="connLogOverlay"'), 'Missing Connection Log overlay');

  // 4. Validate sw.js exists and is valid JavaScript
  const swPath = path.join(DIST_DIR, 'sw.js');
  const swContent = fs.readFileSync(swPath, 'utf-8');
  assert.ok(swContent.includes('install'), 'Service worker must handle install event');
  assert.ok(swContent.includes('fetch'), 'Service worker must handle fetch event');

  // 5. If Google Chrome is installed, test running Headless Chrome on the built bundle
  if (fs.existsSync(CHROME_PATH)) {
    const renderedHtml = execFileSync(
      CHROME_PATH,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--dump-dom',
        `file://${indexPath}`,
      ],
      { encoding: 'utf-8', timeout: 10000 }
    );

    assert.ok(renderedHtml.includes('id="TermWindow"'), 'TermWindow element missing in browser DOM');
    assert.ok(renderedHtml.includes('id="cmenuReact"'), 'Context menu element missing in browser DOM');
    assert.ok(renderedHtml.includes('WebSocket Terminal'), 'Page title missing in browser DOM');
  }
});
