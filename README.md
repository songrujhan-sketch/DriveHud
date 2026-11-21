# DriveHUD V1.9

iPhone Safari 專用行車儀表板：台灣固定式測速照相提醒 + 原創 3D 車模。純 ES modules、無 bundler、無後端。

- [GitHub Pages 正式站](https://songrujhan-sketch.github.io/DriveHud/)
- [ChatGPT Sites 私人站](https://drivehud-v17.song-ru-jhan.chatgpt.site/)
- 主畫面：`index.html`（需 HTTPS 與定位權限）
- 模擬測試：`sim.html`（不需 GPS，五條情境重播）
- 車模展示：`src/car/demo.html`

## 使用（iPhone Safari）
1. 以 Safari 開啟 GitHub Pages 連結（請勿「加入主畫面」，Wake Lock 在主畫面模式不生效）。
2. 按「開始行車」→ 允許定位。首次按下會解鎖語音。
3. 車圖左下角的車款鍵可輪換九款車。右側依序為車燈、車門、停車噴射與 360° 環繞。點車圖可切換固定視角。支援開門的車款在車速達 5 km/h 時會自動關門並鎖定。
4. 展開「外觀與場景」可選十六種車色、五個場景與白天／夜晚／自動時段。右上角設定提供背景音樂、極簡模式、車模畫質、提醒距離與測速資料匯入。
5. 內建資料為警政署 7320 全國快照（2026-11-20，1,905 筆，含國道）。要更新時到 https://data.gov.tw/dataset/7320 下載 CSV，於設定頁「匯入官方 CSV」載入。

## 本機啟動
```bash
python3 -m http.server 8080      # 開 http://localhost:8080/sim.html
npm test                          # 引擎 + 資料 單元測試（Node ≥ 20）
npm run e2e                       # Playwright webkit + iPhone 15；無 webkit 時：
E2E_BROWSER=chromium E2E_CHROMIUM_PATH=<chrome 路徑> npm run e2e
node scripts/build-snapshot.mjs   # 由 data/snapshots/*.csv 重建 cameras.json
```

## 介面設計

V1.9 使用中性色操作按鈕、放大的車庫與車速、測速雷達區塊。色彩 token 在 `styles/app.css` 的 `:root`；`--bg` 若調整，請同步 `src/car/stage.js` 的 `PAGE_EDGE`。

戶外場景（山路、城市）在 `src/car/scenery.js`，場景與時段的外觀參數在 `src/car/stage.js` 的 `THEMES`。

## 結構
```
config.js            所有可調參數（提醒距離 200/300 m、方向容忍角、停車判定、去重規則…）
src/contracts/       共用型別（Camera / Fix / EngineState / EngineEvent）
src/engine/          AlertEngine 純函式狀態機（README 內有 Mermaid 圖）
src/data/            CSV 解析、direct 正規化、去重、IndexedDB、更新／匯入
src/car/             Three.js 九款原創車模（vendor/three.module.js r170）
src/ui/, src/adapters/   畫面、設定頁、GPS／語音／Wake Lock adapters
sim/                 情境檔與播放器
data/snapshots/      內建快照（META.json 記錄來源與時間）
docs/                prompts-v1.6.md（契約與分工）、acceptance.md（驗收表）
```

## 判斷邏輯摘要
- 只有定位有效（accuracy ≤ 30 m、≤ 3 s 內）才顯示車速；否則顯示「—」並暫停判定。
- 相機方向以 `direct` 欄解讀為「被拍車輛的前進方向」（`config.data.directSemantics`）；夾角 ≤ 45° 同向、≥ 135° 反向、其餘「附近測速點」。
- 同向、相機在前方、連續 3 筆逐漸接近且進入 200 m（快速道路與道路類型未知為 300 m）→ 語音一次；接近中連續 3 筆超速 → 紅色警示 + 語音一次；通過後恢復。
- 停車（< 1.5 m/s 連續 3 筆）期間凍結 heading 與狀態機，避免漂移誤報。

## 已知限制（V1）
- Safari 背景／鎖屏時定位與語音會暫停（規格範圍內；原生版再處理）。
- iOS 語音需使用者手勢解鎖；iOS 18 升級機的 zh-TW 口音可能被系統設定覆蓋。
- 黎明路三段近僑大五路口：官方 `direct` 與實際拍攝方向相反，待實測。
- 只寫「雙向」的 192 筆視為兩向都拍，在前方且接近時照常語音（平行道路可能誤報）；地名式方向（如「往大溪方向」）的 138 筆只顯示「附近測速點」，不語音。
