// Wake Lock adapter：回到前景時自動重新取得；狀態變化用 onChange(cb) 通知畫面。
// 螢幕熄滅後定位與語音都會停，所以取得失敗（不支援、加入主畫面模式、低電量）要讓駕駛知道。
export function createWakeLock({ navigatorImpl = globalThis.navigator, documentImpl = globalThis.document } = {}) {
  const supported = !!(navigatorImpl && navigatorImpl.wakeLock && navigatorImpl.wakeLock.request);
  let sentinel = null;
  let wanted = false;
  let acquiring = null;
  const listeners = [];
  const notify = () => listeners.forEach((cb) => { try { cb({ active: !!sentinel, wanted, supported }); } catch (_) { /* ignore */ } });

  async function acquire() {
    if (!supported) { notify(); return false; }
    if (acquiring) return acquiring;
    acquiring = (async () => {
      try {
        const s = await navigatorImpl.wakeLock.request('screen');
        if (!wanted) { try { await s.release(); } catch (_) { /* ignore */ } return false; }
        sentinel = s;
        sentinel.addEventListener && sentinel.addEventListener('release', () => {
          if (sentinel === s) { sentinel = null; notify(); }
        });
        return true;
      } catch (_) {
        sentinel = null;
        return false;
      } finally {
        acquiring = null;
        notify();
      }
    })();
    return acquiring;
  }

  if (documentImpl && documentImpl.addEventListener) {
    documentImpl.addEventListener('visibilitychange', () => {
      if (wanted && documentImpl.visibilityState === 'visible' && !sentinel) acquire();
    });
  }

  async function request() {
    wanted = true;
    return acquire();
  }

  async function release() {
    wanted = false;
    const s = sentinel;
    sentinel = null;
    if (s) {
      try { await s.release(); } catch (_) { /* ignore */ }
    }
    notify();
  }

  return {
    request,
    release,
    supported,
    get active() { return !!sentinel; },
    /** cb({active, wanted, supported})；回傳取消訂閱函式。 */
    onChange(cb) {
      listeners.push(cb);
      return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
    },
  };
}
