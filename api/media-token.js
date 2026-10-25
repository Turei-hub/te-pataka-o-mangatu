// Vercel serverless function: /api/media-token
//   POST  issue a short-lived client token for ONE encrypted upload   (requires x-admin-key)
//
// The browser encrypts the file first, then uploads the ciphertext straight to Vercel Blob
// with this token. Files never pass through this function, so the 4.5 MB body limit
// doesn't apply. Token is locked to one random pathname, one content type and a max size.

import { randomUUID } from 'node:crypto';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { isAdmin } from './_auth.js';

// Ciphertext is plaintext + 16 bytes per 4 MiB chunk; leave headroom over the 200 MB file cap.
const MAX_CIPHERTEXT_BYTES = 210 * 1024 * 1024;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    if (!isAdmin(req)) return res.status(401).json({ error: 'Admin key required.' });

    const pathname = `media/${randomUUID()}.bin`;
    const token = await generateClientTokenFromReadWriteToken({
      pathname,
      maximumSizeInBytes: MAX_CIPHERTEXT_BYTES,
      allowedContentTypes: ['application/octet-stream'],
      validUntil: Date.now() + 30 * 60 * 1000,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ pathname, token });
  } catch (e) {
    console.error('media-token API error', e);
    return res.status(500).json({ error: 'Server error.' });
  }
}
