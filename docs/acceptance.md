# DriveHUD V1.6 驗收表（2026-11-20）

狀態：已驗證／待 iPhone 實測／未完成。雲端驗證以 Chromium 模擬 iPhone 15（WebKit 下載被環境擋下），實機行為一律以 iPhone 實測為準。

**內建資料**：警政署 7320 全國快照（2026-11-20 抓取，1,909 筆 → 拆分雙速限 4 處並去重後 1,905 筆，含國道 169 筆；方向未知 330 筆，其中 192 筆為未註明方位的「雙向」）。

**未完成**：無（第一階段範圍內）。只寫「雙向」的 192 筆已改為在前方且接近時語音提醒（2026-11-20 使用者決定）；地名式方向的 138 筆維持只顯示「附近測速點」。
E2E 指令：`npm run e2e`（webkit；無法安裝時 `E2E_BROWSER=chromium E2E_CHROMIUM_PATH=<chrome> npm run e2e`）。

## 規格 §1 畫面
| 項目 | 內容 | 驗證方式 | 狀態 |
|---|---|---|---|
| 1-1a | 橫向為優先版面（852×393）無需捲動 | e2e landscape 截圖 | 已驗證（Chromium iPhone 15 模擬） |
| 1-1b | 直向（393×852）可用 | e2e portrait 截圖 | 已驗證（Chromium iPhone 15 模擬） |
| 1-1c | 車速為畫面最大元素，tabular-nums | e2e layout.spec（字級比較） | 已驗證（Chromium iPhone 15 模擬） |
| 1-1d | 顯示方向（N/NE/E… 加中文） | e2e 截圖 | 已驗證（Chromium iPhone 15 模擬） |
| 1-1e | GPS 狀態列：定位中／定位正常／訊號不佳／權限遭拒／重新定位中 | e2e + 待 iPhone 實測 | 已驗證（iPhone 實測：定位正常與車速顯示）；其餘狀態切換待實測 |
| 1-2a | 四款車模（女武神／黑暗騎士／阿斯拉／裝甲越野）可切換；第四款由平行原型移植，面數較低 | 設定頁 e2e + src/car/demo.html 目視 | 已驗證（功能）；V1.6b 已升級為 ~3 萬三角形 + 展示廳渲染（clearcoat 車漆、反射地板、bloom）；iPhone 實測流暢不發熱，設定頁可切低畫質 |
| 1-2b | 6 種車色、車燈開關 | 設定頁 e2e + 目視 | 已驗證（Chrome demo 截圖） |
| 1-2d | 外觀列（畫面下方，不遮住車子）：車款、車色、視角（前 45°／後 45°／正後方）、車燈、場景（展示間／山路／城市）、時段（自動／白天／夜晚） | 單元測試（設定儲存）+ Chromium 截圖 | 已驗證（Chromium）；iPhone 上戶外場景的流暢度待 iPhone 實測 |
| 1-2c | 輪圈隨車速轉動、速度 0 停止 | demo.html 目視 | 已驗證（Chrome demo；iPhone 實測高畫質流暢、不發熱） |
| 1-3a | 跟隨 prefers-color-scheme（明／暗） | e2e colorScheme light/dark | 已驗證（Chromium iPhone 15 模擬） |
| 1-3b | 極簡模式（手動）隱藏車模 | e2e layout.spec | 已驗證（Chromium iPhone 15 模擬） |
| 1-4a | 接近時自動切 approach：車模縮小、速限＋剩餘距離放大、地址一行 | e2e 情境① | 已驗證（Chromium iPhone 15 模擬） |
| 1-4b | 通過後恢復 normal | e2e 情境① 結束版面 | 已驗證（Chromium iPhone 15 模擬） |
| 1-4c | 極簡模式開啟時不被 approach 覆蓋 | e2e layout.spec | 已驗證（Chromium iPhone 15 模擬） |
| 1-4d | 設定（車型／色／車燈／極簡）存 localStorage 並於重新載入保留 | e2e | 已驗證（Chromium iPhone 15 模擬） |
| 1-4e | 橫向／直向、暗色、極簡於 iPhone 實機 | 待 iPhone 實測 | 待 iPhone 實測 |

## 規格 §2 定位與系統行為
| 項目 | 內容 | 驗證方式 | 狀態 |
|---|---|---|---|
| 2-1a | 「開始行車」依序 speech.unlock → wakeLock.request → geo.start | 程式審查 + 待 iPhone 實測 | 已驗證（iPhone 實測：開始行車流程正常） |
| 2-1b | 權限提示後狀態 SEARCHING→OK；拒絕→「權限遭拒」；accuracy>30 m→「訊號不佳」 | 待 iPhone 實測 | 部分已驗證（iPhone：允許定位後顯示定位正常）；拒絕／訊號不佳待實測 |
| 2-1c | enableHighAccuracy:true、maximumAge:0 | 程式審查 | 已驗證（程式審查） |
| 2-2a | 無效定位（accuracy 大／過期）車速顯示「—」 | e2e 情境⑤ + 單元測試 | 已驗證（Chromium iPhone 15 模擬） + 單元測試 |
| 2-2b | 停車定位漂移不誤報、不改變 phase | e2e 情境④ | 已驗證（Chromium iPhone 15 模擬） + 單元測試 |
| 2-2c | 每秒呼叫 engine.tick() 以偵測過期 | 程式審查 | 已驗證（程式審查） |
| 2-3a | Google Maps 按鈕先顯示自製提示「離開 DriveHUD 後，測速提醒可能暫停」（非 window.confirm） | e2e／待 iPhone 實測 | 已驗證（程式審查）；待 iPhone 實測 |
| 2-3b | 確認後開 maps.google.com/?q=lat,lon；無定位開 maps.google.com | 待 iPhone 實測 | 待 iPhone 實測 |
| 2-3c | 返回頁面（visibilitychange）→ engine.reset()、顯示「重新定位中」，有效定位後恢復 | 待 iPhone 實測 | 待 iPhone 實測 |
| 2-3d | Wake Lock 回前景自動重新取得；不支援時不報錯 | 待 iPhone 實測 | 已驗證（iPhone 實測：螢幕保持常亮）；回前景重新取得待實測 |
| 2-3e | 語音 zh-TW；找不到 voice 時退回預設；播放失敗顯示「語音無法播放」 | 待 iPhone 實測 | 已驗證（iPhone 實測：語音有播出） |

## 規格 §3 提醒邏輯
| 項目 | 內容 | 驗證方式 | 狀態 |
|---|---|---|---|
| 3-1a | 方向關係 SAME／OPPOSITE／AMBIGUOUS，相機需在前方 | 單元測試 | 已驗證（單元測試） |
| 3-1b | direct 正規化（§8 的 30 種字串）、directSemantics=travel | test/data + §8 比對 | 已驗證（單元測試）；黎明路三段點與實際相反，標為資料異常 |
| 3-2a | 同一次接近只語音一次（APPROACH_ALERT） | e2e 情境①（語音記錄筆數） | 已驗證（Chromium iPhone 15 模擬） |
| 3-2b | 反向相機略過，不語音、不進 approach | e2e 情境② | 已驗證（Chromium iPhone 15 模擬） |
| 3-2c | 方向不明顯示小提示「附近測速點」 | e2e 情境③ | 已驗證（Chromium iPhone 15 模擬） |
| 3-2d | 只播 APPROACH_ALERT / OVERSPEED_ALERT 的 speechText | e2e 語音記錄 | 已驗證（Chromium iPhone 15 模擬） |
| 3-3a | 市區 300 m／快速道路 500 m／未知 300 m 由 config 集中設定 | config.js + 設定頁唯讀顯示 e2e | 已驗證（Chromium iPhone 15 模擬） |
| 3-4a | 超速：approach 區塊整塊紅底、語音一次 | e2e 情境① | 已驗證（Chromium iPhone 15 模擬） |
| 3-4b | 速限缺漏顯示「速限未知」且不判超速 | 單元測試 + 目視 | 已驗證（單元測試） |
| 3-4c | 實際開過 §8.1 五個點的提醒距離、通過後恢復、停紅燈不誤報 | 待 iPhone 實測 | 待 iPhone 實測 |

## 規格 §4 資料
| 項目 | 內容 | 驗證方式 | 狀態 |
|---|---|---|---|
| 4-1a | 資料來源：警政署 7320（100855 視 Fable 決定是否納入） | test/data + stats | 已驗證（7320 全國 1,905 筆，含國道；100855 非測速資料已剔除） |
| 4-1b | 去重（15 m／30°）、同座標多方向不視為重複 | test/data | 已驗證（單元測試） |
| 4-2a | 設定頁 #settings-data：來源、上次更新時間、有效筆數、速限缺漏、方向未知 | e2e（整合後） | 已驗證（Chromium 目視） |
| 4-2b | 「更新測速資料」按鈕與結果顯示 | e2e（整合後） | 已驗證（Chromium：顯示 CORS 失敗原因並保留舊版） |
| 4-3a | 更新失敗保留舊版並顯示原因（含 CORS） | e2e + 待 iPhone 實測 | 已驗證（Chromium）；iPhone Safari 待 iPhone 實測 |
| 4-3b | 「匯入官方 CSV」自動判斷格式並顯示筆數 | 待 iPhone 實測 | 已驗證（iPhone 實測：匯入成功約 1,910 筆） |

## 規格 §5 模擬
| 項目 | 內容 | 驗證方式 | 狀態 |
|---|---|---|---|
| 5-1 | sim.html 不需 GPS，列出五條情境（標題＋預期結果） | e2e scenarios.spec | 已驗證（Chromium iPhone 15 模擬） |
| 5-2 | 播放／暫停／重來、1×／4×、進度 | e2e | 已驗證（Chromium iPhone 15 模擬） |
| 5-3 | 事件與語音記錄面板 | e2e | 已驗證（Chromium iPhone 15 模擬） |
| 5-4 | 全程右上角「模擬」標記 | e2e | 已驗證（Chromium iPhone 15 模擬） |
| 5-5 | 與主畫面共用同一個 app 渲染 | 程式審查（createApp） | 已驗證（程式審查） |
| 5-6 | 五條情境實際事件序列與 expectedEvents 一致 | e2e（Worker A 情境檔就位後） | 已驗證（Chromium iPhone 15 模擬）：五條情境事件序列一致 |

## 規格 §6 交付
| 項目 | 內容 | 驗證方式 | 狀態 |
|---|---|---|---|
| 6-1 | 原始碼完整、純 ES modules、無 bundler | README | 已驗證 |
| 6-2 | 啟動方式（`python3 -m http.server`）、GitHub Pages 連結 | README + 部署確認 | 已驗證：https://songrujhan-sketch.github.io/DriveHud/ （Pages Source = GitHub Actions，每次 push main 自動部署；sim.html 線上載入正常） |
| 6-3 | 驗收表已填寫、待 iPhone 實測清單 | 本文件 + prompts §9 | 已驗證 |
| 6-4 | 主畫面與 sim.html 載入無 console error | e2e | 已驗證（Chromium iPhone 15 模擬） |

## 待 iPhone 實測（併自 prompts §9）
2026-11-20 08:50 iPhone 實測通過：定位與車速、匯入 CSV（約 1,910 筆）、語音播出、螢幕常亮。

仍待實測：1. 切到 Google Maps 再返回的「重新定位中」。2. 線上更新按鈕在 Safari 的失敗訊息。3. 橫／直向、暗色、極簡於實機。4. 實開 §8.1 五個點（提醒距離、通過後恢復、停紅燈不誤報）。5. 權限拒絕／訊號不佳的狀態顯示。
