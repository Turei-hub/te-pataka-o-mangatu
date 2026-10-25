// Vercel serverless function: /api/entries
// Stores only ciphertext — all encryption/decryption happens in the browser.
//   GET              list all entries + their media (public; everything but category/date/size is encrypted)
//   POST             insert one entry, optionally with media rows   (requires x-admin-key)
//   DELETE ?id=uuid  delete one entry, its media rows and blobs     (requires x-admin-key)

import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import { del } from '@vercel/blob';
import { isAdmin } from './_auth.js';

const sql = neon(process.env.DATABASE_URL);

const CATEGORIES = new Set(['whakapapa', 'karakia', 'hui', 'whenua', 'korero']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const BLOB_URL_RE = /^https:\/\/([a-z0-9]+)\.public\.blob\.vercel-storage\.com\/media\/[0-9a-f-]{36}\.bin$/i;

// Max base64 lengths per field.
const LIMITS = {
  name_enc: 4_000,
  name_iv: 32,
  name_salt: 32,
  ciphertext: 1_400_000, // ~1 MB of plaintext
  iv: 32,
  salt: 32,
};

const MEDIA_LIMITS = { salt: 32, iv: 32, meta_enc: 4_000, meta_iv: 32 };
const MAX_MEDIA = 20;
const MAX_CIPHERTEXT_BYTES = 210 * 1024 * 1024;

// Our blob store id, from BLOB_READ_WRITE_TOKEN ("vercel_blob_rw_<storeId>_<secret>").
// Media URLs must point at our own store.
function ownStoreId() {
  const m = /^vercel_blob_rw_([a-z0-9]+)_/i.exec(process.env.BLOB_READ_WRITE_TOKEN || '');
  return m ? m[1].toLowerCase() : null;
}

function isB64(v, max) {
  return typeof v === 'string' && v.length > 0 && v.length <= max && B64_RE.test(v);
}

function validateMedia(media) {
  if (media === undefined) return null;
  if (!Array.isArray(media) || media.length > MAX_MEDIA) return 'Invalid media list.';
  const storeId = ownStoreId();
  for (const m of media) {
    if (!m || typeof m !== 'object') return 'Invalid media item.';
    const urlMatch = typeof m.blob_url === 'string' && BLOB_URL_RE.exec(m.blob_url);
    if (!urlMatch) return 'Invalid media URL.';
    if (storeId && urlMatch[1].toLowerCase() !== storeId) return 'Media URL is not in this blob store.';
    for (const [field, max] of Object.entries(MEDIA_LIMITS)) {
      if (!isB64(m[field], max)) return `Invalid media ${field}.`;
    }
    if (!Number.isInteger(m.chunk_size) || m.chunk_size < 64 * 1024 || m.chunk_size > 16 * 1024 * 1024) {
      return 'Invalid media chunk_size.';
    }
    if (!Number.isInteger(m.size_bytes) || m.size_bytes < 16 || m.size_bytes > MAX_CIPHERTEXT_BYTES) {
      return 'Invalid media size_bytes.';
    }
  }
  return null;
}

function validateEntry(body) {
  if (!body || typeof body !== 'object') return 'Body must be a JSON object.';
  if (!CATEGORIES.has(body.category)) return 'Unknown category.';
  for (const [field, max] of Object.entries(LIMITS)) {
    if (!isB64(body[field], max)) return `Invalid ${field}.`;
  }
  return validateMedia(body.media);
}

function attachMedia(entries, mediaRows) {
  const byEntry = new Map();
  for (const m of mediaRows) {
    const row = { ...m, size_bytes: Number(m.size_bytes) };
    if (!byEntry.has(m.entry_id)) byEntry.set(m.entry_id, []);
    byEntry.get(m.entry_id).push(row);
  }
  return entries.map(e => ({ ...e, media: byEntry.get(e.id) || [] }));
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const [rows, media] = await Promise.all([
        sql`
          select id, name_enc, name_iv, name_salt, category, ciphertext, iv, salt, created_at
          from entries
          order by created_at desc`,
        sql`
          select id, entry_id, blob_url, salt, iv, chunk_size, meta_enc, meta_iv, size_bytes, created_at
          from media
          order by created_at asc`,
      ]);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(attachMedia(rows, media));
    }

    if (req.method === 'POST') {
      if (!isAdmin(req)) return res.status(401).json({ error: 'Admin key required.' });
      const body = req.body;
      const problem = validateEntry(body);
      if (problem) return res.status(400).json({ error: problem });

      const id = randomUUID();
      const media = body.media || [];
      const results = await sql.transaction([
        sql`
          insert into entries (id, name_enc, name_iv, name_salt, category, ciphertext, iv, salt)
          values (${id}, ${body.name_enc}, ${body.name_iv}, ${body.name_salt}, ${body.category},
                  ${body.ciphertext}, ${body.iv}, ${body.salt})
          returning id, name_enc, name_iv, name_salt, category, ciphertext, iv, salt, created_at`,
        ...media.map(m => sql`
          insert into media (entry_id, blob_url, salt, iv, chunk_size, meta_enc, meta_iv, size_bytes)
          values (${id}, ${m.blob_url}, ${m.salt}, ${m.iv}, ${m.chunk_size},
                  ${m.meta_enc}, ${m.meta_iv}, ${m.size_bytes})
          returning id, entry_id, blob_url, salt, iv, chunk_size, meta_enc, meta_iv, size_bytes, created_at`),
      ]);
      const [[entry], ...mediaResults] = results;
      return res.status(201).json(attachMedia([entry], mediaResults.map(r => r[0]))[0]);
    }

    if (req.method === 'DELETE') {
      if (!isAdmin(req)) return res.status(401).json({ error: 'Admin key required.' });
      const id = req.query.id;
      if (typeof id !== 'string' || !UUID_RE.test(id)) {
        return res.status(400).json({ error: 'Invalid id.' });
      }
      const media = await sql`select blob_url from media where entry_id = ${id}`;
      // media rows go with it (on delete cascade)
      const deleted = await sql`delete from entries where id = ${id} returning id`;
      if (deleted.length === 0) return res.status(404).json({ error: 'Not found.' });
      if (media.length) {
        try {
          await del(media.map(m => m.blob_url));
        } catch (e) {
          // Entry is gone either way; an orphaned blob is still only ciphertext.
          console.error('blob delete failed', e);
        }
      }
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    console.error('entries API error', e);
    return res.status(500).json({ error: 'Server error.' });
  }
}
