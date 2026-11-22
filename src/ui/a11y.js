// 無障礙小工具：role="radiogroup" 的方向鍵操作（roving tabindex）。
// 一個群組只佔一個 Tab 停駐點（目前選取的那一個），方向鍵在群組內移動。
// selectOnMove=true：移動即選取（車色、超速容忍）；false：只移動焦點，按 Enter／空白鍵才選（車款：每次選取都要建模）。

const KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'first', End: 'last' };

export function rovingRadios(group, { selectOnMove = true } = {}) {
  const radios = () => [...group.querySelectorAll('[role="radio"]')].filter((r) => !r.disabled);
  function sync() {
    const rs = radios();
    const cur = rs.find((r) => r.getAttribute('aria-checked') === 'true') || rs[0];
    rs.forEach((r) => { r.tabIndex = r === cur ? 0 : -1; });
  }
  group.addEventListener('keydown', (e) => {
    if (!(e.key in KEYS)) return;
    const rs = radios();
    const i = rs.indexOf(e.target.closest?.('[role="radio"]'));
    if (i < 0) return;
    e.preventDefault();
    const k = KEYS[e.key];
    const n = k === 'first' ? 0 : k === 'last' ? rs.length - 1 : (i + k + rs.length) % rs.length;
    rs.forEach((r) => { r.tabIndex = r === rs[n] ? 0 : -1; });
    rs[n].focus();
    if (selectOnMove) rs[n].click();
  });
  sync();
  return { sync };
}
