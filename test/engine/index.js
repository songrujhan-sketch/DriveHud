// 讓 `node --test test/engine` 在 Node 20/22 可用：Node 把目錄參數解析為 test/engine/index.js。
// 只有在以目錄形式被執行時才載入所有 *.test.js；以 glob 執行（argv[1] 指向本檔）時不做事，避免重複。
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === here) {
  for (const f of readdirSync(here).filter((n) => n.endsWith('.test.js')).sort()) {
    await import(pathToFileURL(join(here, f)).href);
  }
}
