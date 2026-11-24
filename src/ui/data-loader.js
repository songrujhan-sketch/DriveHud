// 測速資料載入的時序控制：每次載入或外部更新（匯入、線上更新）都取一個新的 generation，
// 較早發出、較晚完成的載入不論成功或失敗都直接丟棄，不能蓋掉較新的資料或把正常狀態改成 error。
export function createDataLoader({ load, onLoading, onData, onError }) {
  let gen = 0;
  return {
    /** 重新載入；回傳 'ok' | 'error' | 'stale'（已被較新的更新取代，結果未套用）。 */
    async reload() {
      const g = ++gen;
      onLoading();
      try {
        const ds = await load();
        if (g !== gen) return 'stale';
        onData(ds);
        return 'ok';
      } catch (err) {
        if (g !== gen) return 'stale';
        onError(err);
        return 'error';
      }
    },
    /** 外部已取得的新資料（匯入、線上更新）：直接套用，並讓進行中的載入作廢。 */
    push(ds) {
      gen++;
      onData(ds);
    },
  };
}
