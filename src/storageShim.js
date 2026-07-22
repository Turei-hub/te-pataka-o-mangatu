// Shim for the Claude Artifacts `window.storage` API so the vault runs in a
// normal browser during local development. Backed by localStorage — data
// persists on this machine. The `encrypted` flag is accepted for API
// compatibility but ignored here (the component already encrypts its own
// payloads client-side before calling storage).
if (typeof window !== 'undefined' && !window.storage) {
  window.storage = {
    async get(key /*, encrypted */) {
      const value = localStorage.getItem(key);
      return value === null ? null : { value };
    },
    async set(key, value /*, encrypted */) {
      localStorage.setItem(key, value);
    },
    async delete(key) {
      localStorage.removeItem(key);
    },
  };
}
