// E2E：預設 webkit + iPhone 15（橫向 852×393、直向 393×852）。
// 若 webkit 無法安裝，可用 E2E_BROWSER=chromium 改跑 chromium（同一組 viewport / 裝置參數）。
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browserName = process.env.E2E_BROWSER === 'chromium' ? 'chromium' : 'webkit';
const { defaultBrowserType, ...iphone } = devices['iPhone 15'];

const exe = process.env.E2E_CHROMIUM_PATH; // 本機已有 chromium 但版本號不符時可指定
const base = { ...iphone, browserName, ...(exe ? { launchOptions: { executablePath: exe } } : {}) };
const PORT = process.env.E2E_PORT || '8080';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: 'landscape', use: { ...base, viewport: { width: 852, height: 393 } } },
    { name: 'portrait', use: { ...base, viewport: { width: 393, height: 852 } } },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    cwd: root,
    url: `http://localhost:${PORT}/sim.html`,
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
