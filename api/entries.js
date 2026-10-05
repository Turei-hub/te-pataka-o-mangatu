// Vercel serverless function: /api/entries
// Stores only ciphertext — all encryption/decryption happens in the browser.
//   GET              list all entries (public; everything but category/date is encrypted)
//   POST             insert one entry        (requires x-admin-key)
//   DELETE ?id=uuid  delete one entry        (requires x-admin-key)

import { neon } from '@neondatabase/serverless';
import { createHash, timingSafeEqual } from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);

const CATEGORIES = new Set(['whakapapa', 'karakia', 'hui', 'whenua', 'korero']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

// Max base64 lengths per field.
const LIMITS = {
  name_enc: 4_000,
  name_iv: 32,
  name_salt: 32,
  ciphertext: 1_400_000, // ~1 MB of plaintext
  iv: 32,
  salt: 32,
};

function isAdmin(req) {
  const expected = process.env.ADMIN_KEY;
  const given = req.headers['x-admin-key'];
  if (!expected || typeof given !== 'string' || !given) return false;
  // Hash both so timingSafeEqual gets equal-length buffers.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function validateEntry(body) {
  if (!body || typeof body !== 'object') return 'Body must be a JSON object.';
  if (!CATEGORIES.has(body.category)) return 'Unknown category.';
  for (const [field, max] of Object.entries(LIMITS)) {
    const v = body[field];
    if (typeof v !== 'string' || !v || v.length > max || !B64_RE.test(v)) {
      return `Invalid ${field}.`;
    }
  }
  return null;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const rows = await sql`
        select id, name_enc, name_iv, name_salt, category, ciphertext, iv, salt, created_at
        from entries
        order by created_at desc`;
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      if (!isAdmin(req)) return res.status(401).json({ error: 'Admin key required.' });
      const body = req.body;
      const problem = validateEntry(body);
      if (problem) return res.status(400).json({ error: problem });
      const [row] = await sql`
        insert into entries (name_enc, name_iv, name_salt, category, ciphertext, iv, salt)
        values (${body.name_enc}, ${body.name_iv}, ${body.name_salt}, ${body.category},
                ${body.ciphertext}, ${body.iv}, ${body.salt})
        returning id, name_enc, name_iv, name_salt, category, ciphertext, iv, salt, created_at`;
      return res.status(201).json(row);
    }

    if (req.method === 'DELETE') {
      if (!isAdmin(req)) return res.status(401).json({ error: 'Admin key required.' });
      const id = req.query.id;
      if (typeof id !== 'string' || !UUID_RE.test(id)) {
        return res.status(400).json({ error: 'Invalid id.' });
      }
      const deleted = await sql`delete from entries where id = ${id} returning id`;
      if (deleted.length === 0) return res.status(404).json({ error: 'Not found.' });
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    console.error('entries API error', e);
    return res.status(500).json({ error: 'Server error.' });
  }
}
