# Te Pātaka o Mangatū

*The storehouse of Mangatū* — a Māori data sovereignty vault for Whatatutu, Tairāwhiti.

A place to store taonga knowledge — whakapapa, karakia & waiata, hui minutes, whenua
records, and kōrero tuku iho — where **each entry is encrypted in the browser before it
is ever stored**. Only whoever holds an entry's passphrase can open it.

## Encryption

Real client-side cryptography, keys never leave the device:

- **AES-GCM** (256-bit) for both the entry name and its content
- **PBKDF2** key derivation — 600,000 iterations, SHA-256, random salt per field
- A unique passphrase per entry (minimum 10 characters); the key is derived on unlock and discarded on re-seal
- Passphrases are never stored — if lost, the entry cannot be recovered

The server only ever sees ciphertext. Category and creation date are stored in plain text.

## Storage

Entries live in Neon Postgres, reached through a Vercel serverless function
(`api/entries.js`). Listing is public (it returns only ciphertext plus category/date);
adding and deleting require the `ADMIN_KEY`, which the browser asks for and keeps in
memory for the current tab only.

Create the table once in Neon's SQL Editor:

```sql
create table if not exists entries (
  id          uuid primary key default gen_random_uuid(),
  name_enc    text not null,
  name_iv     text not null,
  name_salt   text not null,
  category    text not null,
  ciphertext  text not null,
  iv          text not null,
  salt        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists entries_created_at_idx on entries (created_at desc);
```

## Running locally

`.env` (gitignored) needs:

```dotenv
DATABASE_URL=postgres://...
ADMIN_KEY=<long random string>
```

Neither is prefixed with `VITE_`, so Vite never bundles them into the frontend.

```bash
npm install
vercel link      # once
vercel dev       # or: npm run dev:vercel
```

Then open <http://localhost:3000>. (`npm run dev` still starts Vite alone, but `/api` won't exist.)

For deployment, add both variables to the Vercel project: `vercel env add DATABASE_URL`, `vercel env add ADMIN_KEY`.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/components/MangatuVault.jsx` | The vault component (UI + crypto) |
| `src/api.js` | Browser client for `/api/entries` |
| `api/entries.js` | Vercel function: GET / POST / DELETE against Neon |
| `src/main.jsx` | App entry |

## Media attachments (photos, video, audio)

Files are encrypted in the browser in 4 MiB AES-GCM chunks (same passphrase as the entry) and uploaded straight to Vercel Blob as ciphertext. Neon's `media` table holds the blob URL, IV/salt and encrypted metadata (file name, type, size).

Setup:
1. Run `migrations/002_media.sql` in the Neon SQL editor.
2. Vercel → Storage → Create Blob store (pick Sydney), connect it to this project. That adds `BLOB_READ_WRITE_TOKEN`.
3. Redeploy.
