// 版號一致性：所有自家模組與 HTML 入口都必須帶同一個 ?v=<package.json version>，避免部署後新舊檔混用。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listModules, relativeImports, isVendor, HTML_FILES, HTML_REF_RE, stampModule } from '../scripts/set-version.mjs';
import { VERSION } from '../src/version.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

test('src/version.js 與 package.json 同版', () => {
  assert.equal(VERSION, pkg.version);
});

test('自家模組的相對 import 全部帶 ?v=<版號>；vendor 不帶', async () => {
  const bad = [];
  for (const file of await listModules(root)) {
    for (const { spec, query } of relativeImports(await readFile(file, 'utf8'))) {
      const want = isVendor(spec) ? '' : `?v=${pkg.version}`;
      if (query !== want) bad.push(`${path.relative(root, file)} → ${spec}${query}`);
    }
  }
  assert.deepEqual(bad, [], '請執行 node scripts/set-version.mjs');
});

test('HTML 入口引用的 css/js 全部帶 ?v=<版號>', async () => {
  const bad = [];
  for (const rel of HTML_FILES) {
    const html = await readFile(path.join(root, rel), 'utf8');
    for (const m of html.matchAll(HTML_REF_RE)) {
      if (!isVendor(m[3]) && m[4] !== `?v=${pkg.version}`) bad.push(`${rel} → ${m[3]}${m[4] || ''}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('stampModule：註解行與 vendor 不動，舊版號被取代', () => {
  const src = [
    "import { a } from './a.js?v=0.0.1';",
    "import * as THREE from '../../vendor/three.module.js';",
    " * @param {import('../contracts/types.js').Camera} c",
    "const m = await import('./lazy.js');",
  ].join('\n');
  assert.equal(stampModule(src, '9.9.9'), [
    "import { a } from './a.js?v=9.9.9';",
    "import * as THREE from '../../vendor/three.module.js';",
    " * @param {import('../contracts/types.js').Camera} c",
    "const m = await import('./lazy.js?v=9.9.9');",
  ].join('\n'));
});
