// Wake Lock adapter：回到前景時自動重新取得。
export function createWakeLock({ navigatorImpl = globalThis.navigator, documentImpl = globalThis.document } = {}) {
  const supported = !!(navigatorImpl && navigatorImpl.wakeLock && navigatorImpl.wakeLock.request);
  let sentinel = null;
  let wanted = false;

  async function acquire() {
    if (!supported) return false;
    try {
      sentinel = await navigatorImpl.wakeLock.request('screen');
      sentinel.addEventListener && sentinel.addEventListener('release', () => { sentinel = null; });
      return true;
    } catch (_) {
      sentinel = null;
      return false;
    }
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
    if (sentinel) {
      try { await sentinel.release(); } catch (_) { /* ignore */ }
      sentinel = null;
    }
  }

  return { request, release, supported, get active() { return !!sentinel; } };
}
