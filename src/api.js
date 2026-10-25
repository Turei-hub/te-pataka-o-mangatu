// Thin client for /api/entries. Only ciphertext ever goes over the wire —
// the component encrypts before calling createEntry and decrypts after listEntries.

export class AdminKeyError extends Error {}

async function request(path, options = {}) {
  const res = await fetch(path, options);
  if (res.status === 401) throw new AdminKeyError('Admin key rejected.');
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try { message = (await res.json()).error || message; } catch { /* no body */ }
    throw new Error(message);
  }
  return res.status === 204 ? null : res.json();
}

export function listEntries() {
  return request('/api/entries');
}

export function createEntry(entry, adminKey) {
  return request('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
    body: JSON.stringify(entry),
  });
}

export function deleteEntry(id, adminKey) {
  return request(`/api/entries?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'x-admin-key': adminKey },
  });
}

// Short-lived token for one encrypted upload straight to the blob store.
export function getMediaToken(adminKey) {
  return request('/api/media-token', {
    method: 'POST',
    headers: { 'x-admin-key': adminKey },
  });
}
