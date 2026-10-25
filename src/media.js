// Encrypted media attachments (photos, video clips, audio recordings).
//
// Each file is encrypted in the browser in 4 MiB chunks with AES-GCM before upload,
// so the blob store only ever holds ciphertext. Chunked so phones don't have to hold
// one giant encrypt/decrypt buffer.
//
//   chunk i IV  = random 12-byte base IV with the last 4 bytes XOR'd with i
//   chunk i AAD = "pataka-media-v1:<i>:<1 if last chunk else 0>"
// The AAD stops chunks being reordered, and stops the file being silently truncated
// (a chunk sealed as "not last" won't open as the last one).
//
// File name, MIME type and size are encrypted separately (meta_enc) with the same key.

import { put } from '@vercel/blob/client';
import { bufToB64, b64ToBuf } from './crypto.js';

export const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB plaintext per chunk
export const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB per file (phone photos + short clips)
export const MAX_FILES = 20;
const TAG_BYTES = 16;

const enc = new TextEncoder();
const dec = new TextDecoder();

function chunkIv(baseIv, index) {
  const iv = new Uint8Array(baseIv); // copy
  const view = new DataView(iv.buffer);
  view.setUint32(8, view.getUint32(8) ^ index);
  return iv;
}

function chunkAad(index, isLast) {
  return enc.encode(`pataka-media-v1:${index}:${isLast ? 1 : 0}`);
}

const META_AAD = enc.encode('pataka-media-meta-v1');

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  const mb = n / (1024 * 1024);
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

export function mediaKind(type = '') {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

// Returns { blob, iv } where blob is the full ciphertext ready to upload.
export async function encryptFile(key, file, onProgress) {
  const baseIv = crypto.getRandomValues(new Uint8Array(12));
  const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const parts = [];
  for (let i = 0; i < total; i++) {
    const plain = await file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).arrayBuffer();
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: chunkIv(baseIv, i), additionalData: chunkAad(i, i === total - 1) },
      key,
      plain
    );
    parts.push(cipher);
    onProgress?.((i + 1) / total);
  }
  return { blob: new Blob(parts, { type: 'application/octet-stream' }), iv: bufToB64(baseIv) };
}

export async function encryptMeta(key, meta) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: META_AAD },
    key,
    enc.encode(JSON.stringify(meta))
  );
  return { meta_enc: bufToB64(cipher), meta_iv: bufToB64(iv) };
}

export async function decryptMeta(key, { meta_enc, meta_iv }) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(meta_iv), additionalData: META_AAD },
    key,
    b64ToBuf(meta_enc)
  );
  return JSON.parse(dec.decode(plain));
}

// Uploads ciphertext straight from the browser to the blob store using a short-lived
// client token from /api/media-token. Never goes through our serverless function.
export async function uploadCiphertext(blob, { pathname, token }, onProgress) {
  const result = await put(pathname, blob, {
    access: 'public',
    token,
    contentType: 'application/octet-stream',
    multipart: blob.size > 8 * 1024 * 1024,
    onUploadProgress: e => onProgress?.(e.percentage / 100),
  });
  return result.url;
}

// Downloads one attachment and decrypts it. Returns a Blob of the original file.
export async function downloadAndDecrypt(key, row, type, onProgress) {
  const res = await fetch(row.blob_url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const data = new Uint8Array(await res.arrayBuffer());
  const step = row.chunk_size + TAG_BYTES;
  const total = Math.max(1, Math.ceil(data.length / step));
  const baseIv = new Uint8Array(b64ToBuf(row.iv));
  const parts = [];
  for (let i = 0; i < total; i++) {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: chunkIv(baseIv, i), additionalData: chunkAad(i, i === total - 1) },
      key,
      data.subarray(i * step, (i + 1) * step)
    );
    parts.push(plain);
    onProgress?.((i + 1) / total);
  }
  return new Blob(parts, { type: type || 'application/octet-stream' });
}
