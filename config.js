// DriveHUD V1.6 — 所有可調參數集中於此（原型測試值，實測後調整）
export const CONFIG = {
  alert: {
    radiusUrbanM: 100,          // 市區提醒距離
    radiusExpresswayM: 200,     // 快速道路提醒距離
    radiusUnknownM: 200,        // 道路類型未知
    candidateBufferM: 150,      // 進入候選狀態的額外緩衝
    sameDirMaxDeg: 45,          // |Δbearing| ≤ 45 → SAME
    oppositeMinDeg: 135,        // |Δbearing| ≥ 135 → OPPOSITE
    aheadMaxDeg: 60,            // 相機相對車輛方位角與 heading 夾角 ≤ 60 → 相機在前方
    approachMinFixes: 3,        // 連續逐漸接近的有效定位數
    passedMinFixes: 2,          // 連續遠離的定位數 → PASSED
    cooldownM: 450,             // 通過後離開此距離才允許再次提醒
    overspeedToleranceKmh: 0,   // 超速判定容忍
    overspeedMinFixes: 3,
    bidirectionalUnknownAxisAsSame: true, // direct 只寫「雙向」（無方位）的點：在前方且接近時照常語音
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
    directSemantics: 'travel',  // 'travel' = direct 描述被拍車輛的前進方向；'facing' = 相反
    sources: {
      npa7320: 'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/EA5E6FCD-B82D-43B7-A5CF-E9893253187E/resource/7957B67D-2191-46CB-BD5D-63312764E1E8/download',
      npa100855: null,          // 由 Fable 於快照取得後填入
    },
    minAcceptRatio: 0.5,        // 新資料筆數 ≥ 舊資料 × 此值才替換
  },
  speech: { lang: 'zh-TW', rate: 1.0 },
  ui: { autoCompactOnApproach: true },
};
