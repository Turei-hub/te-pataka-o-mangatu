# Te Pātaka o Mangatū

*The storehouse of Mangatū* — a Māori data sovereignty vault for Whatatutu, Tairāwhiti.

A place to store taonga knowledge — whakapapa, karakia & waiata, hui minutes, whenua
records, and kōrero tuku iho — where **each entry is encrypted in the browser before it
is ever stored**. Only whoever holds an entry's passphrase can open it.

## Encryption

Real client-side cryptography, keys never leave the device:

- **AES-GCM** (256-bit) for content encryption
- **PBKDF2** key derivation — 150,000 iterations, SHA-256, per-entry random salt
- A unique passphrase per entry; the key is derived on unlock and discarded on re-seal
- Passphrases are never stored — if lost, the entry cannot be recovered

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:5180.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/components/MangatuVault.jsx` | The vault component (UI + crypto) |
| `src/storageShim.js` | Local-dev `window.storage` shim, backed by `localStorage` |
| `src/main.jsx` | App entry — imports the shim first, then renders the vault |

## Note on storage

The component was first authored as a Claude Artifact and calls the Artifacts
`window.storage` API. For local development that API is shimmed with `localStorage`
(`src/storageShim.js`). For a real deployment — ideally iwi/hapū-controlled hosting,
in keeping with the kaupapa of data sovereignty — replace that shim with proper
persistence.
