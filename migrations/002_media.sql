-- Encrypted media attachments for entries.
-- Run once in the Neon SQL editor (same database as the entries table).
-- Only ciphertext lives in the blob store; name/type/size of the original file are in meta_enc.

create table if not exists media (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references entries(id) on delete cascade,
  blob_url    text not null,
  salt        text not null,   -- PBKDF2 salt (b64); one per sealing, shared by that entry's files
  iv          text not null,   -- base IV (b64); chunk i uses base IV with last 4 bytes XOR i
  chunk_size  integer not null,
  meta_enc    text not null,   -- AES-GCM of {"name","type","size"}
  meta_iv     text not null,
  size_bytes  bigint not null, -- ciphertext size
  created_at  timestamptz not null default now()
);

create index if not exists media_entry_id_idx on media (entry_id);
