// Google Maps adapter：先以自製對話框確認（不使用 window.confirm），再開啟地圖。
export const MAPS_WARNING = '離開 DriveHUD 後，測速提醒可能暫停';

export function mapsUrl(pos) {
  if (pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lon)) {
    return `https://maps.google.com/?q=${pos.lat},${pos.lon}`;
  }
  return 'https://maps.google.com/';
}

/** 顯示自製確認對話框，回傳 Promise<boolean>。 */
export function confirmDialog({ doc = document, message, okText = '繼續', cancelText = '取消', root } = {}) {
  return new Promise((resolve) => {
    const host = root || doc.body;
    const backdrop = doc.createElement('div');
    backdrop.className = 'dh-dialog-backdrop';
    backdrop.innerHTML = `
      <div class="dh-dialog" role="dialog" aria-modal="true" aria-labelledby="dh-dialog-msg">
        <p id="dh-dialog-msg" class="dh-dialog-msg"></p>
        <div class="dh-dialog-actions">
          <button type="button" class="dh-btn" data-act="cancel"></button>
          <button type="button" class="dh-btn primary" data-act="ok"></button>
        </div>
      </div>`;
    backdrop.querySelector('.dh-dialog-msg').textContent = message;
    backdrop.querySelector('[data-act=cancel]').textContent = cancelText;
    backdrop.querySelector('[data-act=ok]').textContent = okText;
    const done = (v) => { backdrop.remove(); resolve(v); };
    backdrop.addEventListener('click', (e) => {
      const act = e.target && e.target.dataset && e.target.dataset.act;
      if (act === 'ok') done(true);
      else if (act === 'cancel' || e.target === backdrop) done(false);
    });
    host.appendChild(backdrop);
    const ok = backdrop.querySelector('[data-act=ok]');
    ok && ok.focus();
  });
}

export async function openGoogleMaps(pos, { win = globalThis.window, doc = globalThis.document, root } = {}) {
  const yes = await confirmDialog({ doc, message: MAPS_WARNING, root });
  if (!yes) return false;
  const url = mapsUrl(pos);
  const w = win.open ? win.open(url, '_blank') : null;
  if (!w) win.location.href = url;
  return true;
}
