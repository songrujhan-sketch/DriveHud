# DriveHUD V1.6 — 第一階段製作 Prompt 套件

版本：2026-11-20 v1 ｜ Repo：github.com/songrujhan-sketch/drivehud（main，GitHub Pages 由 main 根目錄發布）

---

## 0. 執行總覽

| 角色 | 模型 | 負責模組 | 擁有的路徑（只能寫這些） |
|---|---|---|---|
| Orchestrator | Fable 5.1 | 契約、資料快照取得、整合、部署、最終驗證、驗收表 | `README.md`, `docs/`, `index.html` 整合, `data/snapshots/` |
| Worker A | Opus 5.5 | AlertEngine、direct 正規化、模擬重播引擎、五條情境、單元測試 | `src/engine/`, `sim/`, `test/engine/` |
| Worker B | Opus 5.5 | Three.js 三款原創車模、動畫、換色、車燈 | `src/car/`, `vendor/three*` |
| Worker C | Sonnet 5.5 | 資料管線：CSV 解析（7320 / 100855）、統一 schema、去重、驗證、IndexedDB、匯入 UI 與設定頁資料區塊 | `src/data/`, `src/ui/settings-data.js`, `test/data/` |
| Worker D | Sonnet 5.5 | 畫面外殼、GPS/語音/Wake Lock/Maps adapter、三種版面、暗色模式、模擬入口頁、Playwright 截圖、驗收表草稿 | `src/ui/`（除 settings-data.js）、`src/adapters/`, `styles/`, `e2e/`, `docs/acceptance.md` |

執行順序：
1. Fable 建立 repo 骨架 + `src/contracts/`（本文件第 1 節的型別與介面以 JSDoc 落地）+ `config.js`，並用 Chrome 抓官方 CSV 寫入 `data/snapshots/`。
2. A、B、C、D **平行**啟動（Agent tool，model 分別 opus/opus/sonnet/sonnet，同一工作樹，路徑互不重疊）。
3. Fable 整合 `index.html`、跑 `npm test` 與 `npm run e2e`、修正介面不一致、部署 GitHub Pages、填驗收表。
4. 回報使用者：連結 + 驗收表 + 待 iPhone 實測清單。

技術基線（所有 worker 共同遵守）：
- 純 ES modules，無 bundler、無框架；GitHub Pages 直接發布根目錄。
- Three.js 以 vendored 檔案載入（`vendor/three.module.js`，由 Worker B 放入），不用 CDN。
- 測試：Node ≥ 20 內建 `node --test`；E2E：Playwright `webkit` + `iPhone 15` device descriptor。
- 語言：UI 與語音繁體中文（台灣），速度 km/h；程式註解可中英混用；commit 訊息中文。
- 不得使用任何需要後端的功能；不得呼叫 data.gov.tw 以外的第三方 API。
- 每個 worker 結束時：所有 owned 路徑的檔案可直接被 `index.html` 匯入、`node --test` 通過、在最後回報中列出「已完成／未完成／需要 Fable 決定」。

---

## 1. 共用契約（每個 worker 的 prompt 都附上本節全文）

### 1.1 Repo 結構
```
index.html              主畫面（Fable 整合）
sim.html                模擬測試入口（Worker D）
config.js               所有可調參數（Fable 建立，worker 只讀）
src/contracts/types.js  JSDoc typedef（Fable 建立）
src/engine/             Worker A
src/car/                Worker B
src/data/               Worker C
src/ui/                 Worker D（settings-data.js 屬 Worker C）
src/adapters/           Worker D（geolocation / speech / wakelock / maps）
sim/scenarios/*.json    Worker A
data/snapshots/         Fable（官方 CSV 原檔 + 轉換後 cameras.json）
test/                   node --test
e2e/                    Playwright
docs/                   文件、驗收表
```

### 1.2 config.js（初始值，Fable 建立；worker 不得硬編碼這些數字）
```js
export const CONFIG = {
  alert: {
    radiusUrbanM: 300,          // 市區提醒距離
    radiusExpresswayM: 500,     // 快速道路提醒距離
    radiusUnknownM: 300,
    candidateBufferM: 150,      // 進入候選狀態的額外緩衝
    sameDirMaxDeg: 45,          // |Δbearing| ≤ 45 → SAME
    oppositeMinDeg: 135,        // |Δbearing| ≥ 135 → OPPOSITE
    approachMinFixes: 3,        // 連續逐漸接近的有效定位數
    passedMinFixes: 2,          // 連續遠離的定位數 → PASSED
    cooldownM: 450,             // 通過後離開此距離才允許再次提醒
    overspeedToleranceKmh: 0,   // 超速判定容忍
    overspeedMinFixes: 3,
  },
  fix: {
    maxAccuracyM: 30,           // accuracy 超過視為訊號不佳
    maxAgeMs: 3000,             // 超過此時間無新定位 → 車速顯示「—」
    stationarySpeedMps: 1.5,    // 低於此速度連續 N 筆 → 停車
    stationaryMinFixes: 3,
    minDisplacementM: 5,        // 位移估速的最小距離
    headingHoldMs: 15000,       // heading 為 null 時沿用最後有效 heading 的時限
  },
  data: {
    dedupeDistanceM: 15,
    dedupeBearingDeg: 30,
    directSemantics: 'travel',  // 'travel' = direct 描述車流前進方向；'facing' = 相反
  },
  speech: { lang: 'zh-TW', rate: 1.0 },
  ui: { autoCompactOnApproach: true },
};
```

### 1.3 資料型別（src/contracts/types.js，JSDoc）
```js
/** @typedef {Object} Camera
 *  @property {string} id            穩定 ID：sha1(source|lat6|lon6|bearingKey)
 *  @property {number} lat
 *  @property {number} lon
 *  @property {number[]} bearings    車流前進方向（度，0=北，順時針）；雙向給兩個；未知給 []
 *  @property {boolean} bidirectional
 *  @property {boolean} directionKnown  bearings.length>0
 *  @property {number|null} limit    km/h；缺漏為 null
 *  @property {'urban'|'expressway'|'unknown'} roadClass
 *  @property {boolean} interval     區間測速（V1 僅標示，不做區間邏輯）
 *  @property {'npa7320'|'npa100855'} source
 *  @property {string} address
 *  @property {string} city
 *  @property {string} region
 *  @property {string} rawDirect     原始 direct 文字
 */

/** @typedef {Object} Fix
 *  @property {number} t             epoch ms
 *  @property {number} lat
 *  @property {number} lon
 *  @property {number|null} speedMps coords.speed；null 表示未提供
 *  @property {number|null} headingDeg
 *  @property {number} accuracyM
 */

/** @typedef {'SEARCHING'|'OK'|'POOR'|'DENIED'|'STALE'} GpsStatus */

/** @typedef {Object} EngineState
 *  @property {GpsStatus} gps
 *  @property {number|null} speedKmh     定位無效時 null（UI 顯示「—」）
 *  @property {number|null} headingDeg
 *  @property {boolean} stationary
 *  @property {null|{camera:Camera, distanceM:number, relation:'SAME'|'OPPOSITE'|'AMBIGUOUS', phase:'CANDIDATE'|'APPROACHING'|'PASSED'}} focus
 *  @property {Array<{camera:Camera, distanceM:number, relation:string}>} nearby
 *  @property {boolean} overspeed
 */

/** @typedef {{type:'APPROACH_ALERT'|'NEARBY'|'OVERSPEED_ALERT'|'PASSED'|'FIX_STALE'|'FIX_VALID'|'STATIONARY'|'MOVING'|'GPS_STATUS',
 *             t:number, camera?:Camera, distanceM?:number, limit?:number|null, speechText?:string, status?:GpsStatus}} EngineEvent */
```

### 1.4 AlertEngine 介面（src/engine/alertEngine.js，Worker A）
```js
export function createAlertEngine({ cameras, config, now = () => Date.now() })
// returns {
//   pushFix(fix: Fix): EngineEvent[]        // 每筆定位呼叫一次，回傳本次產生的事件（可為空）
//   tick(): EngineEvent[]                   // UI 每 1 s 呼叫，用於判斷資料過期（FIX_STALE）
//   getState(): EngineState
//   setCameras(cameras)                     // 資料更新後替換
//   reset()                                 // 返回頁面／解鎖後進入「重新定位中」
// }
```
純函式／無 DOM／無 timer；真實 GPS 與模擬重播都只透過 `pushFix` 與 `tick` 餵資料。

判斷規則（Worker A 實作，Fable 驗收）：
- 定位有效：`accuracyM ≤ fix.maxAccuracyM` 且 `now - t ≤ fix.maxAgeMs`。無效 → `speedKmh = null`、暫停所有判定。
- 車速：`speedMps` 非 null 用之；否則用與上一筆有效定位的位移／時間估算，位移 < `minDisplacementM` 視為 0。
- heading：`headingDeg` 非 null 用之；否則沿用最後有效 heading 不超過 `headingHoldMs`；停車狀態下 heading 凍結。
- 停車：連續 `stationaryMinFixes` 筆速度 < `stationarySpeedMps` → `stationary=true`，期間不產生新的 APPROACH/OVERSPEED/PASSED，也不因漂移改變 phase（情境 ④）。
- 方向關係：以「車輛 heading」與「相機 bearings 中最接近者」的夾角分類 SAME / OPPOSITE / AMBIGUOUS；`directionKnown=false` 或 `bidirectional && bearings=[]` → AMBIGUOUS；`bidirectional` 且有 bearings → 任一 bearing 符合即 SAME。另外要求「相機相對車輛的方位角」與 heading 夾角 ≤ 60°（相機在前方），否則不視為接近。
- 逐漸接近：連續 `approachMinFixes` 筆有效定位距離遞減。
- 狀態機（每台相機獨立）：IDLE → CANDIDATE（進入 radius+buffer）→ APPROACHING（SAME 且逐漸接近且在 radius 內 → 發 `APPROACH_ALERT` 一次）→ PASSED（距離連續 `passedMinFixes` 筆遞增 → 發 `PASSED`）→ COOLDOWN（距離 > `cooldownM` 才回 IDLE）。AMBIGUOUS 在 radius 內 → 發 `NEARBY` 一次並列入 `state.nearby`；OPPOSITE → 不提醒。
- 超速：phase=APPROACHING 且 `limit` 非 null 且連續 `overspeedMinFixes` 筆 `speedKmh > limit + tolerance` → `OVERSPEED_ALERT` 一次、`state.overspeed=true`；`limit` null → 不判定（UI 顯示「速限未知」）。
- 語音文字由引擎產生（`speechText`），格式：「前方三百公尺有測速照相，速限六十」；距離四捨五入到 50 m 並轉中文數字；超速：「注意，目前超速，速限六十」。
- 半徑：`roadClass` 對應 config 三個 radius。

### 1.5 direct 正規化（src/data/direct.js，Worker C 實作；Worker A 的測試也會用）
```js
export function parseDirect(raw: string, config): { bearings:number[], bidirectional:boolean, interval:boolean, known:boolean }
```
規則：
- 「X向Y」「X往Y」「往Y」「Y向」「Y下／上車道」「Y上方向」→ 前進方向 = Y（北=0、東北=45、東=90、東南=135、南=180、西南=225、西=270、西北=315）。
- 「南北雙向」→ [0,180]；「東西雙向」→ [90,270]；「雙向」（無方位）→ bidirectional=true, bearings=[], known=false。
- 含「區間測速」→ interval=true，其餘照常解析。
- 「往大溪方向」等地名式 → known=false。
- `config.data.directSemantics === 'facing'` 時把所有 bearing 反轉 180°。
- 必須附 table-driven 測試，涵蓋本文件 §8 列出的 30 種實際字串。

### 1.6 統一資料流（Worker C）
```
data/snapshots/npa7320.csv, npa100855.csv  →  parseNpa7320(text) / parseNpa100855(text)  →  Camera[]
→ dedupe(cameras, config)  →  validate(cameras)  →  { cameras, stats:{total, dropped, byCity, limitMissing, directionUnknown} }
→ saveToIndexedDB({ cameras, source, fetchedAt, stats })  /  loadFromIndexedDB()
```
- 7320 CSV 第 2 列是中文欄位名（設置縣市…），必須跳過；數字欄位可能含空白或非數字，一律 trim 並以 `Number()` 驗證，失敗則該筆 `limit=null` 或整筆丟棄（座標無效）。
- 100855 欄位：設備編號、型式、縣市、行政區、科技執法種類、取締項目、設置區域描述、設置地點(路口或路段)、座標緯度、座標經度、拍攝方向、速限、管轄單位；只保留「取締項目」含「速」者。
- roadClass 推斷：address 含 `快速道路|台6\d線|台7\d線|國道|高架|交流道|快速公路` → expressway；否則 urban。
- 去重：同 source 或跨 source，座標距離 ≤ `dedupeDistanceM` 且（兩者皆 directionKnown 且最接近 bearing 差 ≤ `dedupeBearingDeg`，或任一方 directionKnown=false）→ 視為同一點，保留資訊較完整者（有 limit、有方向者優先）。
- 線上更新：`fetch` 官方 URL；成功且解析後筆數 ≥ 上一版 × 0.5 才替換；任何失敗保留舊版並回傳可顯示的錯誤原因（含 CORS）。
- 匯入 CSV：`<input type="file" accept=".csv,text/csv">`，自動判斷是 7320 或 100855 格式，流程同上。

### 1.7 UI 狀態（Worker D）
- 三種版面：`normal`（車模 + 車速 + 方向 + GPS 狀態）、`minimal`（手動，隱藏車模）、`approach`（自動：縮小車模、放大「速限 + 剩餘距離」、車速仍清楚）。`minimal` 手動開啟時不會被 `approach` 覆蓋。
- 顏色：跟隨 `prefers-color-scheme`；超速時 `approach` 區塊紅色警示。
- 事件 → 語音：只播 `APPROACH_ALERT` 與 `OVERSPEED_ALERT` 的 `speechText`；同一次接近各類最多一次由引擎保證，UI 不再去重。
- 「開始行車」按下時：先呼叫 `speech.unlock()`（播放空白 utterance）、`wakeLock.request()`、`geolocation.watch()`。
- `visibilitychange` 回到可見：`engine.reset()`、顯示「重新定位中」，直到下一筆有效定位。
- Google Maps 按鈕：先顯示提示「離開 DriveHUD 後，測速提醒可能暫停」，確認後開 `https://maps.google.com/?q=lat,lon`（有定位時）或 `https://maps.google.com/`。
- 模擬模式：`sim.html` 全程顯示「模擬」標記；用 `sim/player.js` 以 1× / 4× 速度把 scenario 餵進同一個 engine。

### 1.8 模擬情境檔格式（sim/scenarios/*.json，Worker A）
```json
{ "id":"01-same-dir-overspeed", "title":"同向接近並持續超速",
  "cameras":[ Camera... ],
  "fixes":[ Fix... ],
  "expectedEvents":[ {"type":"APPROACH_ALERT","camera":"id"}, {"type":"OVERSPEED_ALERT"}, {"type":"PASSED"} ],
  "expectedFinal":{ "layout":"normal", "speedKmh":"number|null" } }
```
五條情境的 fixes 以 1 Hz 產生，座標取自本文件 §8 的真實台中相機。

---

## 2. Prompt A — Opus：AlertEngine + 模擬 + 單元測試

```
你是 DriveHUD V1.6 的 Worker A。只能寫 src/engine/、sim/、test/engine/。先完整閱讀下面的【共用契約】（§1 全文貼入）。

任務：
1. 實作 src/engine/alertEngine.js（createAlertEngine）、src/engine/geo.js（haversine 距離、initial bearing、角度差）、src/engine/speech-text.js（距離與速限轉繁體中文語音字串）。純 ESM、無 DOM、無 timer，Node 20 可直接 import。
2. 依契約 §1.4 的規則實作狀態機，並把所有門檻從 config 讀取。
3. 產生 sim/scenarios/01~05.json 五條情境（契約 §1.8），座標使用：
   - 情境①③④ 用福科路617號 (24.186693,120.61284) 西向東 50 km/h；③ 的平行道路用與福科路平行、北側 40 m 的虛擬路徑，相機設為 directionKnown=false。
   - 情境② 用東大路一段450號 (24.18653,120.60414) 南向北 50 km/h，車輛由北往南行駛。
   - 情境⑤ 用中彰快速道路 4.8K (24.129442,120.619804) 南北雙向 80 km/h，中途 8 秒 accuracy=200 再恢復。
   每條情境 fixes 需 1 Hz、含合理的 speedMps/headingDeg/accuracyM；④ 必須包含停車 20 秒期間座標漂移 ±8 m 的樣本。
4. 實作 sim/player.js：createPlayer({engine, scenario, speed}) 提供 play/pause/seek/onEvent/onState，供 Worker D 的 sim.html 使用。
5. test/engine/*.test.js（node --test）：每條情境斷言 expectedEvents 的「類型與順序」完全一致、同一次接近每類事件只出現一次、通過後 focus 為 null；另加 direct 關係分類（SAME/OPPOSITE/AMBIGUOUS）、位移估速、heading 沿用、stationary 凍結、limit=null 不判超速、stale 後 speedKmh=null 的單元測試。
6. 提供 src/engine/README.md：狀態機圖（Mermaid）、每個 config 參數的影響、已知限制。

限制：不要修改 config.js 與 src/contracts/；需要新參數時在最後回報中列出並附預設值。parseDirect 由 Worker C 提供，你的測試先用 src/engine/__stub__/direct.js 自帶最小版本，介面同契約 §1.5。
完成條件：`node --test test/engine` 全綠；在最後回報用中文列出：已完成／未完成／需要 Fable 決定的事項。
```

## 3. Prompt B — Opus：Three.js 原創車模

```
你是 DriveHUD V1.6 的 Worker B。只能寫 src/car/ 與 vendor/。先閱讀【共用契約】§1.1、§1.7。

任務：
1. 把 Three.js（r16x 以上）的 ESM 建置檔放到 vendor/three.module.js（單一檔案，不依賴 CDN、不需 import map 以外的工具）。
2. 實作 src/car/carView.js：createCarView(canvas, {model, color, headlights, darkMode}) 回傳 { setSpeedKmh(v), setColor(hex), setHeadlights(bool), setModel(id), setCompact(bool), setDarkMode(bool), resize(), dispose() }。固定前 45° 視角（camera 位於車頭左前方上方），不提供自由旋轉。
3. 三款**原創**車模，純幾何（BoxGeometry/CylinderGeometry/ExtrudeGeometry/LatheGeometry 組合，可用簡單 bevel），每款 ≤ 3,000 三角形：
   - `valkyrie`（顯示名「女武神」）：低趴雙座 hypercar 風格，長車尾擴散器、大尾翼、淚滴座艙。
   - `darkknight`（顯示名「黑暗騎士」）：寬體裝甲越野風格，高離地、大輪胎、稜角裝甲板、低矮座艙。
   - `asurada`（顯示名「阿斯拉」）：流線電動雙門跑車風格，長軸距、平滑車頂弧線、貫穿式尾燈。
   這三個名稱只是標籤；幾何必須是你自己的原創設計，不得重現任何既有汽車品牌、電影或動畫中的車輛造型、標誌或可辨識特徵。
4. 輪圈：四輪以車速換算角速度旋轉（輪徑 0.66 m），speed=0 時完全停止；車燈切換時頭燈／尾燈 emissive 與一盞 SpotLight 開關；換色只影響車身材質。
5. compact 模式：畫面縮小至 40% 高度並靠邊，仍維持動畫。效能目標：iPhone 15 Safari 60 fps、不開 shadow map、pixelRatio 上限 2。
6. src/car/demo.html：可切換三款車、拉桿調整車速、切換車燈、換色，用來目視驗收。

完成條件：demo.html 在桌面 Chrome 與 Playwright webkit 無 console error；最後回報用中文列出三款車的三角形數與已知限制。
```

## 4. Prompt C — Sonnet：資料管線

```
你是 DriveHUD V1.6 的 Worker C。只能寫 src/data/、src/ui/settings-data.js、test/data/。先閱讀【共用契約】§1.2、§1.3、§1.5、§1.6，以及 §8 的 direct 實際字串清單。

任務：
1. src/data/direct.js：parseDirect（契約 §1.5），table-driven 測試涵蓋 §8 全部 30 種字串與 5 個邊界（空字串、英文、全形括號、「雙向(區間測速)」、「往X方向」地名）。
2. src/data/parsers.js：parseNpa7320(text)、parseNpa100855(text)、detectFormat(text)。自行實作 RFC4180 CSV 解析（處理引號內逗號、BOM、CRLF）。
3. src/data/normalize.js：toCamera(row, source)、inferRoadClass(address)、makeId()。
4. src/data/dedupe.js、validate.js：規則見契約 §1.6；validate 回傳 stats。
5. src/data/store.js：IndexedDB（db `drivehud`, store `dataset`）save/load；另提供 loadBundledSnapshot() 讀 data/snapshots/cameras.json 作為初次啟動資料。
6. src/data/update.js：updateOnline({urls}) 與 importFromFile(file)，回傳 {ok, reason, stats, fetchedAt}；失敗保留舊版。
7. src/ui/settings-data.js：掛載到設定頁的資料區塊（Worker D 會提供容器 #settings-data）：來源、上次成功更新時間、有效筆數、速限缺漏數、方向未知數、「更新測速資料」按鈕、「匯入官方 CSV」按鈕、最近一次結果（成功／失敗原因）。
8. test/data/*.test.js（node --test，IndexedDB 部分用 fake-indexeddb 或以介面抽象後 mock）。

資料事實：7320 CSV 第 2 列為中文欄名需跳過；目前約 1,910 筆；BranchNm 常為空；同一座標多筆代表不同方向，不是重複。
完成條件：`node --test test/data` 全綠；用 data/snapshots/ 的真實檔跑出 stats 並寫入最後回報（中文）。
```

## 5. Prompt D — Sonnet：UI 外殼、adapters、E2E、驗收表

```
你是 DriveHUD V1.6 的 Worker D。只能寫 src/ui/（settings-data.js 除外）、src/adapters/、styles/、sim.html、e2e/、docs/acceptance.md。先閱讀【共用契約】§1.1～§1.4、§1.7、§1.8。

任務：
1. src/adapters/geolocation.js：watch(onFix, onStatus)，把 GeolocationPosition 轉成契約 Fix；依 accuracy 與錯誤碼回報 GpsStatus（SEARCHING/OK/POOR/DENIED）；可注入 fake 來源供 sim 與 e2e。
2. src/adapters/speech.js：unlock()（在使用者手勢內播空白 utterance）、speak(text)（zh-TW、cancel 前一句、失敗時回傳 false 並在 UI 顯示小圖示）。
3. src/adapters/wakelock.js、maps.js（契約 §1.7）。
4. src/ui/app.js + styles/app.css：三種版面、橫向優先、直向可用、prefers-color-scheme、極簡模式開關、GPS 狀態列、速限／剩餘距離大字、超速紅色警示、「附近測速點」小提示、「速限未知」。車速字體為畫面最大元素；數字用等寬數字字型（font-variant-numeric: tabular-nums）。
5. src/ui/settings.js：設定頁（車型、車色、車燈、極簡模式、提醒距離顯示、#settings-data 容器交給 Worker C）。
6. sim.html + src/ui/sim.js：不需 GPS 權限；列出五條情境、顯示預期結果、播放／暫停／倍速；全程顯示「模擬」標記；事件與語音記錄面板。
7. e2e/：Playwright（webkit，devices['iPhone 15']，橫向與直向各一）：開 sim.html 逐條情境播放到底，斷言畫面出現的版面狀態與事件文字，並存截圖到 e2e/screenshots/。
8. docs/acceptance.md：以規格 §1～§6 逐項列表，狀態欄預填「待驗證」，Fable 最後填寫。

介面只能透過契約；engine、car、data 模組尚未存在時用 src/ui/__stub__/ 內的最小 stub 開發，stub 檔名與真實模組一致，整合時由 Fable 替換 import 路徑。
完成條件：`npm run e2e` 可跑（允許因 stub 導致的預期失敗，需在回報列出）；最後回報用中文列出已完成／未完成／待 iPhone 實測。
```

## 6. Prompt E — Fable（Orchestrator 自用）

```
1. 骨架：package.json（scripts: test=node --test, e2e=playwright test）、config.js、src/contracts/types.js、.gitignore、README.md 草稿、.nojekyll。
2. 資料快照：用 Claude in Chrome 開 https://opdadm.moi.gov.tw/robots.txt 後在同源 fetch
   /api/v1/no-auth/resource/api/dataset/EA5E6FCD-B82D-43B7-A5CF-E9893253187E/resource/7957B67D-2191-46CB-BD5D-63312764E1E8/download
   以每 400 列分批回傳寫入 data/snapshots/npa7320.csv；100855 同法（先到 data.gov.tw/dataset/100855 取下載網址）。記錄抓取時間到 data/snapshots/META.json。
3. 平行啟動 A、B、C、D（Agent tool；model=opus/opus/sonnet/sonnet；run_in_background=true；prompt = 各節 prompt + §1 全文）。
4. 整合：替換 stub import、index.html 串接、`node --test`、`npm run e2e`；修正契約不一致處（以契約為準，不改 worker 的設計決策）。
5. 部署：commit 到 main、`gh api` 啟用 Pages（source=main, path=/）；取得 https://songrujhan-sketch.github.io/drivehud/ 並用 Playwright webkit 開一次確認載入。
6. 驗收：填 docs/acceptance.md（已驗證／待 iPhone 實測／未完成）；把 §9 的待 iPhone 實測清單併入。
7. 回報使用者（中文）：連結、驗收表摘要、三件最需要實測的事、下一步選擇框。
```

---

## 7. 驗收表骨架（docs/acceptance.md）

| 規格項 | 內容 | 驗證方式 | 狀態 |
|---|---|---|---|
| 1-1 | 橫向優先、車速最大字、方向與 GPS 狀態 | Playwright 截圖 | 待驗證 |
| 1-2 | 三款車模、換色、車燈、輪圈隨速 | demo.html 目視 + e2e | 待驗證 |
| 1-3 | 明暗模式、極簡模式 | e2e 兩種 colorScheme | 待驗證 |
| 1-4 | 接近時自動縮小車模、通過後恢復、極簡優先 | 情境① | 待驗證 |
| 2-1 | 開始行車→權限→四種定位狀態 | 待 iPhone 實測 | 待驗證 |
| 2-2 | 無效定位顯示「—」、停車不誤報 | 情境④⑤ | 待驗證 |
| 2-3 | Maps 提示、返回重新定位 | 待 iPhone 實測 | 待驗證 |
| 3-1 | 方向／接近判斷、direct 對應 | 單元測試 + §8 比對 | 待驗證 |
| 3-2 | 語音一次、反向略過、附近測速點 | 情境①②③ | 待驗證 |
| 3-3 | 300/500 m 集中設定 | config.js | 待驗證 |
| 3-4 | 超速紅色警示＋語音一次、速限未知 | 情境① + 單元測試 | 待驗證 |
| 4-1 | 7320 + 100855、去重 | test/data + stats | 待驗證 |
| 4-2 | 更新按鈕、來源、時間、筆數、結果 | e2e | 待驗證 |
| 4-3 | 失敗保留舊版、匯入 CSV | e2e + 待 iPhone 實測 | 待驗證 |
| 5 | 模擬入口、五條情境、標示「模擬」 | e2e | 待驗證 |
| 6 | 原始碼、啟動方式、驗收表 | README | 待驗證 |

---

## 8. direct 欄位實測比對（2026-11-20 抓取，1,910 筆）

### 8.1 使用者提供的五條路段 vs 官方資料

| # | 使用者路段（行進方向） | 官方資料命中 | direct | 速限 | 一致性 |
|---|---|---|---|---|---|
| 1 | 中科路，廣福路橋→福雅路口（往西） | 中科路段近科雅東路口(快車道) 24.207615,120.62186 | 雙向 | 60 | 相容（雙向） |
| 2 | 東大路，福科路口→西屯路（往北） | 東大路一段450號前往西屯路三段方向 24.18653,120.60414 | 南向北 | 50 | **一致：direct = 車流前進方向** |
| 3 | 黎明路，凱旋路口→漢翔路口（往東北） | 黎明路三段與僑大五路口 24.191656,120.64392 | 東向西 | 50 | **相反**，需確認 |
| 4 | 福科路，玉門路口→福雅路口（往東） | 福科路617號前往福林路方向中央分隔島 24.186693,120.61284 | 西向東 | 50 | **一致：direct = 車流前進方向** |
| 5 | 台74線，五權西路匝道→高鐵匝道（往南） | 南屯區中彰快速道路4.8K 24.129442,120.619804 | 南北雙向 | 80 | 相容（雙向） |

結論：#2、#4 的地址文字「前往 X 方向」與 direct 完全對應，支持 `directSemantics='travel'`（direct 描述被拍車輛的前進方向）。#3 需要使用者確認該相機實際拍的是往漢翔路（與資料相反）還是往凱旋路（與資料相同）。

### 8.2 direct 實際出現的字串（前 30 種，含筆數）
北向南 192、雙向 191、南北雙向 186、南向北 168、東西雙向 130、西向東 124、東向西 118、往南 86、往北 80、北往南 44、南向 44、北向 41、南往北 39、西南向東北 35、東北向西南 25、西北向東南 23、西往東 22、東往西 22、西向 19、東南向西北 19、往東 15、南北雙向(區間測速) 13、東向 13、東西向 13、南下車道 12、東西雙向(區間測速) 11、往西 11、北上車道 10、往大溪方向 10、北上方向 6

### 8.3 資料品質備註
- **100855 已剔除**（2026-11-20 實抓 25 筆：取締項目為跨越槽化線／雙白線／未繫安全帶，速限欄全空，非測速資料）。V1 資料來源僅警政署 7320；國道固定測速待找到正確資料集再補。
- 下載 URL 在 data.gov.tw 頁面上以 JS fetch 會被 CORS 擋（已實測 `Failed to fetch`）；同源（opdadm.moi.gov.tw）fetch 正常。iPhone Safari 直接更新預期失敗 → 設計已採快照 + 匯入。
- CSV 第 1 列英文欄名、第 2 列中文欄名。
- 總筆數 1,910（新聞報導 2025-12 為 2,518；差異原因未知，驗收時以實際抓取為準並顯示於設定頁）。
- BranchNm 多為空；臺中市 192 筆。

---

## 9. 待 iPhone 實測清單（由使用者完成）
1. 「開始行車」後語音是否正常播出（zh-TW 口音、音量、靜音開關影響）。
2. Wake Lock 是否讓螢幕常亮（Safari 分頁；不要加入主畫面）。
3. 切到 Google Maps 再返回：是否出現「重新定位中」並在幾秒內恢復。
4. 設定頁「更新測速資料」：預期顯示失敗原因（CORS）；「匯入官方 CSV」：從「檔案」app 選擇後是否成功並顯示筆數。
5. 橫向／直向排版、暗色模式、極簡模式。
6. 實際開過 §8.1 的五個點：是否在 300 m／500 m 前提醒、通過後是否恢復、停紅燈是否誤報。
