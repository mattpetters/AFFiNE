if (location.origin === 'http://127.0.0.1:47861') {
  // Runtime identity only: keep the web storage adapter, never pretend that
  // Electron's native IPC/SQLite integrations are available.
  globalThis.__AFFINE_TAURI__ = true;
  globalThis.__AFFINE_TAURI_STORAGE_PERSISTENCE__ = (async () => {
    try {
      if (await navigator.storage?.persisted?.()) return true;
      return (await navigator.storage?.persist?.()) ?? null;
    } catch {
      return null;
    }
  })();
  localStorage.setItem('global-state:open-link-mode', '"open-in-web"');
}
