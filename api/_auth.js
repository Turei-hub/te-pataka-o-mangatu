// Shared admin-key check. Files starting with "_" in /api aren't deployed as routes.

import { createHash, timingSafeEqual } from 'node:crypto';

export function isAdmin(req) {
  const expected = process.env.ADMIN_KEY;
  const given = req.headers['x-admin-key'];
  if (!expected || typeof given !== 'string' || !given) return false;
  // Hash both so timingSafeEqual gets equal-length buffers.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
