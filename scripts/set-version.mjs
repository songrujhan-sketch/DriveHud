// 統一版號：node scripts/set-version.mjs [版號]
// - 不給版號時沿用 package.json 的 version（只做一致化）。
// - 所有自家 ES module 的相對 import 一律帶 ?v=<版號>；vendor/（three.js）不加，避免同一套 three 被載入兩份。
// - HTML 入口（index.html、sim.html、模板、車模展示）引用的 app.css／*.js 一律帶 ?v=<版號>。
// - src/version.js 寫入版號，畫面上的版本標籤由此讀取。
// test/version.test.js 會檢查上述規則，漏改會讓 npm test 失敗。
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const MODULE_DIRS = ['src', 'sim'];
export const HTML_FILES = ['index.html', 'sim.html', 'src/ui/index.template.html', 'src/car/demo.html'];

/** 相對 import 規格字串（from '…' / import('…') / import '…'）；JSDoc 的 {import('…')} 型別註解不算。 */
export const IMPORT_RE = /((?<![{<|(.\w])(?:from|import)\s*\(?\s*)(['"])(\.{1,2}\/[^'"?]+?\.js)(\?[^'"]*)?\2/g;
/** HTML 內自家資源（href/src 指向相對路徑的 .css/.js）。 */
export const HTML_REF_RE = /((?:href|src)=)(["'])(\.{0,2}\/?[^"':]*?\.(?:css|js))(\?[^"']*)?\2/g;

export const isVendor = (spec) => spec.includes('/vendor/');

export async function listModules(dir = root) {
  const out = [];
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  }
  for (const m of MODULE_DIRS) await walk(path.join(dir, m));
  return out;
}

const isCommentLine = (line) => /^\s*(?:\/\/|\/?\*)/.test(line);

/** 逐行處理；註解行（// 或 JSDoc 的 * 開頭）不動。 */
export function stampModule(text, version) {
  return text.split('\n').map((line) => (isCommentLine(line) ? line : line.replace(IMPORT_RE,
    (all, lead, q, spec) => (isVendor(spec) ? `${lead}${q}${spec}${q}` : `${lead}${q}${spec}?v=${version}${q}`)))).join('\n');
}

/** 取出一個模組內所有（非註解行的）相對 import：[{ spec, query }] */
export function relativeImports(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (isCommentLine(line)) continue;
    for (const m of line.matchAll(IMPORT_RE)) out.push({ spec: m[3], query: m[4] || '' });
  }
  return out;
}

export function stampHtml(text, version) {
  // 只處理 <script type="module" src> 與 <link href>，以及 HTML 內 <script type="module"> 區塊中的 import。
  const refs = text.replace(HTML_REF_RE, (all, attr, q, spec) => (isVendor(spec) ? all : `${attr}${q}${spec}?v=${version}${q}`));
  return refs.replace(/(<script type="module">)([\s\S]*?)(<\/script>)/g, (all, a, body, b) => a + stampModule(body, version) + b);
}

async function main() {
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  const version = process.argv[2] || pkg.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`版號格式錯誤：${version}`);
  if (pkg.version !== version) {
    pkg.version = version;
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  const lockPath = path.join(root, 'package-lock.json');
  try {
    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    lock.version = version;
    if (lock.packages?.['']) lock.packages[''].version = version;
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  } catch { /* 沒有 lock 檔 */ }

  let changed = 0;
  for (const file of await listModules()) {
    const before = await readFile(file, 'utf8');
    const after = stampModule(before, version);
    if (after !== before) { await writeFile(file, after); changed++; }
  }
  for (const rel of HTML_FILES) {
    const file = path.join(root, rel);
    const before = await readFile(file, 'utf8');
    const after = stampHtml(before, version);
    if (after !== before) { await writeFile(file, after); changed++; }
  }
  await writeFile(path.join(root, 'src/version.js'),
    `// 由 scripts/set-version.mjs 產生；請勿手動修改。\nexport const VERSION = '${version}';\n`);
  console.log(`版號 ${version}：更新 ${changed} 個檔案`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
