import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, Unlock, ShieldCheck, Plus, X, KeyRound, ScrollText, AlertTriangle, Loader2, Trash2, Camera, Video, Mic, Paperclip, Download, Play, FileAudio, FileVideo, FileImage } from 'lucide-react';
import { listEntries, createEntry, deleteEntry, getMediaToken, AdminKeyError } from '../api.js';
import { deriveKey, encryptText, decryptText, randomSaltB64 } from '../crypto.js';
import {
  CHUNK_SIZE, MAX_FILE_BYTES, MAX_FILES, formatBytes, mediaKind,
  encryptFile, encryptMeta, decryptMeta, uploadCiphertext, downloadAndDecrypt,
} from '../media.js';
import AudioRecorder from './AudioRecorder.jsx';


// ---------- categories ----------

const CATEGORIES = [
  { id: 'whakapapa', label: 'Whakapapa', desc: 'Genealogy & family records' },
  { id: 'karakia', label: 'Karakia & Waiata', desc: 'Prayers & songs' },
  { id: 'hui', label: 'Hui Minutes', desc: 'Meeting records & decisions' },
  { id: 'whenua', label: 'Whenua Records', desc: 'Land history & boundaries' },
  { id: 'korero', label: 'Kōrero Tuku Iho', desc: 'Oral history & stories' },
];

const MIN_PASSPHRASE = 10;

export default function MangatuVault() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [unlocked, setUnlocked] = useState({}); // id -> { name, content }
  const [unlockError, setUnlockError] = useState({});
  const [busy, setBusy] = useState({});
  const [passInputs, setPassInputs] = useState({});
  const [confirmDelete, setConfirmDelete] = useState({});
  const [deleting, setDeleting] = useState({});
  const [deleteError, setDeleteError] = useState({});

  // admin key: held in memory for this tab only, never persisted
  const [adminKey, setAdminKey] = useState('');
  const [keyPrompt, setKeyPrompt] = useState(null); // { reason, resolve }
  const [keyInput, setKeyInput] = useState('');

  // add form state
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState(CATEGORIES[0].id);
  const [formContent, setFormContent] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formPassword2, setFormPassword2] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [formFiles, setFormFiles] = useState([]); // File[]
  const [showRecorder, setShowRecorder] = useState(false);
  const [sealProgress, setSealProgress] = useState('');

  // media for unlocked entries: entry id -> CryptoKey (never leaves memory), media id -> object URL
  const mediaKeys = useRef({});
  const [mediaUrls, setMediaUrls] = useState({});
  const [mediaBusy, setMediaBusy] = useState({});
  const [mediaError, setMediaError] = useState({});
  const photoInput = useRef(null);
  const videoInput = useRef(null);
  const deviceInput = useRef(null);

  function addFiles(list) {
    setFormError('');
    const incoming = Array.from(list || []);
    const tooBig = incoming.filter(f => f.size > MAX_FILE_BYTES);
    const ok = incoming.filter(f => f.size <= MAX_FILE_BYTES && f.size > 0);
    setFormFiles(prev => {
      const next = [...prev, ...ok].slice(0, MAX_FILES);
      if (prev.length + ok.length > MAX_FILES) setFormError(`Up to ${MAX_FILES} files per entry.`);
      return next;
    });
    if (tooBig.length) setFormError(`${tooBig.map(f => f.name).join(', ')} is over ${formatBytes(MAX_FILE_BYTES)}. Trim the clip or split it.`);
  }

  function removeFile(i) {
    setFormFiles(prev => prev.filter((_, idx) => idx !== i));
  }

  const loadItems = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setItems(await listEntries());
    } catch (e) {
      console.error('Load error', e);
      setItems([]);
      setLoadError("Couldn't reach the pātaka. Check your connection and reload.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  function askAdminKey(reason) {
    setKeyInput('');
    return new Promise(resolve => setKeyPrompt({ reason, resolve }));
  }

  function closeKeyPrompt(value) {
    keyPrompt?.resolve(value);
    setKeyPrompt(null);
    setKeyInput('');
  }

  // Runs action(key), prompting for the admin key if we don't have one or it's rejected.
  // Returns { cancelled: true } if the user dismisses the prompt.
  async function withAdminKey(action) {
    let key = adminKey;
    let reason = 'Enter the admin key to make changes to the pātaka.';
    for (;;) {
      if (!key) {
        key = await askAdminKey(reason);
        if (!key) return { cancelled: true };
      }
      try {
        const result = await action(key);
        setAdminKey(key);
        return { result };
      } catch (e) {
        if (!(e instanceof AdminKeyError)) throw e;
        setAdminKey('');
        key = '';
        reason = 'That admin key was rejected. Try again.';
      }
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    setFormError('');
    if (!formName.trim() || (!formContent.trim() && formFiles.length === 0) || !formPassword) {
      setFormError('Fill in a name, some content or at least one photo/recording, and a passphrase.');
      return;
    }
    if (formPassword !== formPassword2) {
      setFormError("Passphrases don't match.");
      return;
    }
    if (formPassword.length < MIN_PASSPHRASE) {
      setFormError(`Passphrase should be at least ${MIN_PASSPHRASE} characters.`);
      return;
    }
    setFormBusy(true);
    try {
      // Get the admin key sorted before the slow part, so nobody encrypts a video then gets rejected.
      let key = '';
      let firstToken = null;
      if (formFiles.length) {
        const { cancelled, result } = await withAdminKey(async k => {
          const t = await getMediaToken(k);
          key = k;
          return t;
        });
        if (cancelled) { setFormBusy(false); return; }
        firstToken = result;
      }

      setSealProgress('Sealing text…');
      const [name, content] = await Promise.all([
        encryptText(formPassword, formName.trim()),
        encryptText(formPassword, formContent),
      ]);

      // One key per entry for all its files (one PBKDF2 run, not one per photo).
      const media = [];
      if (formFiles.length) {
        const mediaSalt = randomSaltB64();
        const mediaKey = await deriveKey(formPassword, mediaSalt);
        for (let i = 0; i < formFiles.length; i++) {
          const file = formFiles[i];
          const label = `${i + 1} of ${formFiles.length}`;
          const { blob, iv } = await encryptFile(mediaKey, file, p => setSealProgress(`Encrypting ${label}… ${Math.round(p * 100)}%`));
          const meta = await encryptMeta(mediaKey, { name: file.name, type: file.type, size: file.size });
          const token = i === 0 ? firstToken : await getMediaToken(key);
          const blob_url = await uploadCiphertext(blob, token, p => setSealProgress(`Uploading ${label}… ${Math.round(p * 100)}%`));
          media.push({ blob_url, salt: mediaSalt, iv, chunk_size: CHUNK_SIZE, ...meta, size_bytes: blob.size });
        }
      }

      setSealProgress('Storing…');
      const entry = {
        name_enc: name.ciphertext,
        name_iv: name.iv,
        name_salt: name.salt,
        category: formCategory,
        ...content,
        ...(media.length && { media }),
      };
      const { cancelled, result: saved } = key
        ? { result: await createEntry(entry, key) }
        : await withAdminKey(k => createEntry(entry, k));
      if (!cancelled) {
        setItems(prev => [saved, ...prev]);
        setFormName(''); setFormContent(''); setFormPassword(''); setFormPassword2('');
        setFormFiles([]); setShowRecorder(false);
        setShowAdd(false);
      }
    } catch (err) {
      console.error('Save error', err);
      setFormError(err instanceof AdminKeyError
        ? 'The admin key was rejected partway through. Try again.'
        : 'Something went wrong sealing this entry. Check your connection and try again.');
    }
    setSealProgress('');
    setFormBusy(false);
  }

  async function handleUnlock(item) {
    const pw = passInputs[item.id];
    if (!pw) return;
    setBusy(b => ({ ...b, [item.id]: true }));
    setUnlockError(e => ({ ...e, [item.id]: '' }));
    try {
      const [name, content] = await Promise.all([
        decryptText(pw, { ciphertext: item.name_enc, iv: item.name_iv, salt: item.name_salt }),
        decryptText(pw, item),
      ]);
      let media = [];
      if (item.media?.length) {
        const mediaKey = await deriveKey(pw, item.media[0].salt);
        mediaKeys.current[item.id] = mediaKey;
        media = await Promise.all(item.media.map(async row => ({ row, meta: await decryptMeta(mediaKey, row) })));
      }
      setUnlocked(u => ({ ...u, [item.id]: { name, content, media } }));
      // photos open straight away; video/audio wait for a tap (they're bigger)
      for (const m of media) if (mediaKind(m.meta.type) === 'image') openMedia(item.id, m);
    } catch {
      setUnlockError(e => ({ ...e, [item.id]: 'Wrong passphrase — the seal held.' }));
    }
    setBusy(b => ({ ...b, [item.id]: false }));
  }

  async function openMedia(entryId, { row, meta }) {
    const key = mediaKeys.current[entryId];
    if (!key) return;
    setMediaBusy(b => ({ ...b, [row.id]: 0.01 }));
    setMediaError(e => ({ ...e, [row.id]: '' }));
    try {
      const blob = await downloadAndDecrypt(key, row, meta.type, p => setMediaBusy(b => ({ ...b, [row.id]: p })));
      const url = URL.createObjectURL(blob);
      setMediaUrls(u => ({ ...u, [row.id]: url }));
    } catch (err) {
      console.error('Media open error', err);
      setMediaError(e => ({ ...e, [row.id]: "Couldn't open this file." }));
    }
    setMediaBusy(b => { const n = { ...b }; delete n[row.id]; return n; });
  }

  function handleLock(id) {
    const open = unlocked[id];
    if (open?.media?.length) {
      setMediaUrls(u => {
        const n = { ...u };
        for (const { row } of open.media) { if (n[row.id]) URL.revokeObjectURL(n[row.id]); delete n[row.id]; }
        return n;
      });
    }
    delete mediaKeys.current[id];
    setUnlocked(u => { const n = { ...u }; delete n[id]; return n; });
    setPassInputs(p => ({ ...p, [id]: '' }));
  }

  async function handleDelete(id) {
    setDeleting(d => ({ ...d, [id]: true }));
    setDeleteError(e => ({ ...e, [id]: '' }));
    try {
      const { cancelled } = await withAdminKey(key => deleteEntry(id, key));
      if (!cancelled) {
        setItems(prev => prev.filter(i => i.id !== id));
        handleLock(id);
      }
    } catch (err) {
      console.error('Delete error', err);
      setDeleteError(e => ({ ...e, [id]: "Couldn't delete this entry. Try again." }));
    }
    setConfirmDelete(c => ({ ...c, [id]: false }));
    setDeleting(d => ({ ...d, [id]: false }));
  }

  const catInfo = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[0];

  return (
    <div style={{ minHeight: '100vh', background: '#171310', color: '#EDE3D3', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        @font-face { font-family: 'Fraunces'; src: url('/fonts/fraunces-var.woff2') format('woff2'); font-weight: 100 900; font-style: normal; font-display: swap; }
        * { box-sizing: border-box; }
        .weave-bg {
          background-image: repeating-linear-gradient(45deg, rgba(199,125,59,0.06) 0px, rgba(199,125,59,0.06) 1px, transparent 1px, transparent 14px),
                             repeating-linear-gradient(-45deg, rgba(62,102,83,0.06) 0px, rgba(62,102,83,0.06) 1px, transparent 1px, transparent 14px);
        }
        .seal-btn:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible {
          outline: 2px solid #C77D3B; outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      {/* Header */}
      <header className="weave-bg" style={{ borderBottom: '1px solid #2E2620', padding: '32px 20px 28px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <ShieldCheck size={20} color="#3E6653" />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: '0.12em', color: '#C77D3B', textTransform: 'uppercase' }}>
              Te Pātaka o Mangatū — demo build
            </span>
          </div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 'clamp(28px, 6vw, 40px)', margin: 0, lineHeight: 1.1 }}>
            A storehouse for Mangatū's own data
          </h1>
          <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: '#B8AC97', maxWidth: 560 }}>
            Whatatutu, Tairāwhiti. Everything sealed here is encrypted in your browser before it ever leaves your device —
            only whoever holds the passphrase for an entry can open it.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 60px' }}>
        {/* Notice */}
        <div style={{ display: 'flex', gap: 10, background: '#211B15', border: '1px solid #3E342A', borderRadius: 10, padding: '12px 14px', marginBottom: 24, fontSize: 13, color: '#B8AC97', lineHeight: 1.5 }}>
          <AlertTriangle size={16} color="#C77D3B" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>Entries are stored encrypted in a shared database. Anyone who can reach this site can see that an entry exists, its category, its date and how many attachments it has — but the name, content, photos and recordings stay sealed unless they know its passphrase. Only holders of the admin key can add or delete entries. A lost passphrase can't be recovered.</span>
        </div>

        {/* Add button */}
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="seal-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#3E6653', color: '#EDE3D3', border: 'none', borderRadius: 10, padding: '12px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 24 }}
          >
            <Plus size={17} /> Seal a new entry
          </button>
        )}

        {/* Add form */}
        {showAdd && (
          <form onSubmit={handleAdd} autoComplete="off" style={{ background: '#211B15', border: '1px solid #3E342A', borderRadius: 14, padding: 20, marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, margin: 0 }}>New entry</h2>
              <button type="button" onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: '#B8AC97', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <label style={fieldLabel}>Name</label>
            <input value={formName} onChange={e => setFormName(e.target.value)} autoComplete="off" placeholder="e.g. Ngā Ingoa o Mangatū — 1998 hui notes" style={fieldInput} />

            <label style={fieldLabel}>Category</label>
            <select value={formCategory} onChange={e => setFormCategory(e.target.value)} style={fieldInput}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label} — {c.desc}</option>)}
            </select>

            <label style={fieldLabel}>Content</label>
            <textarea value={formContent} onChange={e => setFormContent(e.target.value)} rows={5} placeholder="Whakapapa, karakia text, hui minutes, kōrero... (optional if you're attaching media)" style={{ ...fieldInput, resize: 'vertical', fontFamily: 'inherit' }} />

            <label style={fieldLabel}>Photos, video & recordings</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <button type="button" onClick={() => photoInput.current?.click()} style={attachBtn}><Camera size={15} /> Take photo</button>
              <button type="button" onClick={() => videoInput.current?.click()} style={attachBtn}><Video size={15} /> Record video</button>
              <button type="button" onClick={() => setShowRecorder(true)} style={attachBtn}><Mic size={15} /> Record audio</button>
              <button type="button" onClick={() => deviceInput.current?.click()} style={attachBtn}><Paperclip size={15} /> Add from device</button>
            </div>
            <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            <input ref={videoInput} type="file" accept="video/*" capture="environment" hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            <input ref={deviceInput} type="file" accept="image/*,video/*,audio/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            {showRecorder && (
              <AudioRecorder onRecorded={file => { addFiles([file]); setShowRecorder(false); }} onClose={() => setShowRecorder(false)} />
            )}
            {formFiles.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {formFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#171310', border: '1px solid #2E2620', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
                    <KindIcon type={f.type} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ color: '#7C7263', fontSize: 12, flexShrink: 0 }}>{formatBytes(f.size)}</span>
                    {!formBusy && (
                      <button type="button" onClick={() => removeFile(i)} aria-label={`Remove ${f.name}`} style={{ background: 'none', border: 'none', color: '#7C7263', cursor: 'pointer', display: 'flex', padding: 0 }}>
                        <X size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p style={{ fontSize: 12, color: '#7C7263', marginTop: 0, marginBottom: 4 }}>
              Files are encrypted on this device with the entry's passphrase before they upload. Up to {formatBytes(MAX_FILE_BYTES)} each. Make sure everyone in a photo or recording is okay with it being stored.
            </p>

            <label style={fieldLabel}>Set a passphrase for this entry</label>
            <input type="password" autoComplete="new-password" value={formPassword} onChange={e => setFormPassword(e.target.value)} placeholder={`At least ${MIN_PASSPHRASE} characters`} style={fieldInput} />
            <input type="password" autoComplete="new-password" value={formPassword2} onChange={e => setFormPassword2(e.target.value)} placeholder="Confirm passphrase" style={fieldInput} />
            <p style={{ fontSize: 12, color: '#7C7263', marginTop: -4, marginBottom: 14 }}>
              It seals both the name and the content. Share it only with whoever should be able to open this entry. It's never stored anywhere — if it's lost, the entry can't be recovered.
            </p>

            {formError && <p style={{ color: '#D98577', fontSize: 13, marginBottom: 10 }}>{formError}</p>}

            <button type="submit" disabled={formBusy} className="seal-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#C77D3B', color: '#171310', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 600, cursor: formBusy ? 'default' : 'pointer', opacity: formBusy ? 0.7 : 1 }}>
              {formBusy ? <Loader2 size={16} className="spin" /> : <Lock size={16} />}
              {formBusy ? (sealProgress || 'Sealing…') : 'Seal & store'}
            </button>
            {formBusy && formFiles.length > 0 && (
              <p style={{ fontSize: 12, color: '#7C7263', margin: '8px 0 0' }}>Keep this page open until it's done.</p>
            )}
          </form>
        )}

        {/* List */}
        {loading ? (
          <p style={{ color: '#7C7263', fontSize: 14 }}>Opening the pātaka…</p>
        ) : loadError ? (
          <p style={{ color: '#D98577', fontSize: 14 }}>{loadError}</p>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#7C7263' }}>
            <ScrollText size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
            <p style={{ fontSize: 14 }}>Nothing stored yet. The first entry you seal will sit here, encrypted, waiting for whoever holds the key.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {items.map(item => {
              const isOpen = unlocked[item.id] !== undefined;
              const cat = catInfo(item.category);
              return (
                <div key={item.id} style={{ background: '#211B15', border: `1px solid ${isOpen ? '#3E6653' : '#3E342A'}`, borderRadius: 12, padding: 16, transition: 'border-color 0.3s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#C77D3B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cat.label}</span>
                      <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, margin: '4px 0 0', overflowWrap: 'anywhere', ...(isOpen ? {} : { fontStyle: 'italic', color: '#7C7263' }) }}>
                        {isOpen ? unlocked[item.id].name : 'Sealed entry'}
                      </h3>
                      <p style={{ fontSize: 12, color: '#7C7263', margin: '2px 0 0' }}>
                        {new Date(item.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {item.media?.length > 0 && ` · ${item.media.length} attachment${item.media.length === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      {isOpen ? <Unlock size={18} color="#3E6653" /> : <Lock size={18} color="#7C7263" />}
                      {!confirmDelete[item.id] && (
                        <button
                          onClick={() => setConfirmDelete(c => ({ ...c, [item.id]: true }))}
                          aria-label="Delete entry"
                          title="Delete entry"
                          style={{ background: 'none', border: 'none', color: '#7C7263', cursor: 'pointer', padding: 2, display: 'flex' }}
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </div>
                  </div>

                  {confirmDelete[item.id] && (
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, background: '#2A1D18', border: '1px solid #5A3A30', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                      <span style={{ flex: 1, minWidth: 160 }}>Delete this entry for good? This can't be undone.</span>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deleting[item.id]}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#B5503F', color: '#EDE3D3', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: deleting[item.id] ? 'default' : 'pointer' }}
                      >
                        {deleting[item.id] ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />} Delete
                      </button>
                      <button
                        onClick={() => setConfirmDelete(c => ({ ...c, [item.id]: false }))}
                        disabled={deleting[item.id]}
                        style={{ background: 'none', border: '1px solid #3E342A', color: '#B8AC97', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {deleteError[item.id] && <p style={{ color: '#D98577', fontSize: 12, marginTop: 6 }}>{deleteError[item.id]}</p>}

                  {isOpen ? (
                    <div style={{ marginTop: 12 }}>
                      {unlocked[item.id].content.trim() && (
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, background: '#171310', border: '1px solid #2E2620', borderRadius: 8, padding: 12, margin: 0 }}>{unlocked[item.id].content}</pre>
                      )}
                      {unlocked[item.id].media?.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: unlocked[item.id].content.trim() ? 10 : 0 }}>
                          {unlocked[item.id].media.map(m => (
                            <MediaView
                              key={m.row.id}
                              media={m}
                              url={mediaUrls[m.row.id]}
                              progress={mediaBusy[m.row.id]}
                              error={mediaError[m.row.id]}
                              onOpen={() => openMedia(item.id, m)}
                            />
                          ))}
                        </div>
                      )}
                      <button onClick={() => handleLock(item.id)} style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3E342A', color: '#B8AC97', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>
                        <Lock size={13} /> Re-seal
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <input
                        type="password"
                        autoComplete="new-password"
                        placeholder="Passphrase"
                        value={passInputs[item.id] || ''}
                        onChange={e => setPassInputs(p => ({ ...p, [item.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && handleUnlock(item)}
                        style={{ ...fieldInput, marginBottom: 0, flex: 1 }}
                      />
                      <button
                        onClick={() => handleUnlock(item)}
                        disabled={busy[item.id]}
                        className="seal-btn"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2E2620', color: '#EDE3D3', border: '1px solid #3E342A', borderRadius: 8, padding: '0 14px', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
                      >
                        {busy[item.id] ? <Loader2 size={14} className="spin" /> : <KeyRound size={14} />}
                      </button>
                    </div>
                  )}
                  {unlockError[item.id] && <p style={{ color: '#D98577', fontSize: 12, marginTop: 6 }}>{unlockError[item.id]}</p>}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Admin key prompt */}
      {keyPrompt && (
        <div
          onClick={() => closeKeyPrompt(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 10 }}
        >
          <form
            role="dialog"
            autoComplete="off"
            aria-modal="true"
            aria-labelledby="admin-key-title"
            onClick={e => e.stopPropagation()}
            onSubmit={e => { e.preventDefault(); if (keyInput) closeKeyPrompt(keyInput); }}
            onKeyDown={e => e.key === 'Escape' && closeKeyPrompt(null)}
            style={{ width: '100%', maxWidth: 400, background: '#211B15', border: '1px solid #3E342A', borderRadius: 14, padding: 20 }}
          >
            <h2 id="admin-key-title" style={{ fontFamily: "'Fraunces', serif", fontSize: 20, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <KeyRound size={18} color="#C77D3B" /> Admin key
            </h2>
            <p style={{ fontSize: 13, color: '#B8AC97', margin: '0 0 12px', lineHeight: 1.5 }}>{keyPrompt.reason}</p>
            <input
              type="password"
              autoComplete="off"
              autoFocus
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder="Admin key"
              style={fieldInput}
            />
            <p style={{ fontSize: 12, color: '#7C7263', margin: '0 0 14px' }}>Kept in memory for this tab only — you'll be asked again after a reload.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => closeKeyPrompt(null)} style={{ background: 'none', border: '1px solid #3E342A', color: '#B8AC97', borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" disabled={!keyInput} className="seal-btn" style={{ background: '#C77D3B', color: '#171310', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: keyInput ? 'pointer' : 'default', opacity: keyInput ? 1 : 0.6 }}>
                Continue
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const fieldLabel = { display: 'block', fontSize: 12, color: '#B8AC97', marginBottom: 5, marginTop: 12, fontWeight: 500 };
const fieldInput = {
  width: '100%', background: '#171310', border: '1px solid #3E342A', borderRadius: 8,
  padding: '10px 12px', color: '#EDE3D3', fontSize: 14, marginBottom: 8,
};

const attachBtn = {
  display: 'flex', alignItems: 'center', gap: 6, background: '#2E2620', color: '#EDE3D3',
  border: '1px solid #3E342A', borderRadius: 8, padding: '9px 12px', fontSize: 13, cursor: 'pointer',
};

function KindIcon({ type }) {
  const kind = mediaKind(type);
  const props = { size: 15, color: '#C77D3B', style: { flexShrink: 0 } };
  if (kind === 'image') return <FileImage {...props} />;
  if (kind === 'video') return <FileVideo {...props} />;
  return <FileAudio {...props} />;
}

function MediaView({ media: { meta }, url, progress, error, onOpen }) {
  const kind = mediaKind(meta.type);
  const frame = { background: '#171310', border: '1px solid #2E2620', borderRadius: 8, overflow: 'hidden' };
  const caption = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', fontSize: 12, color: '#B8AC97' }}>
      <KindIcon type={meta.type} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.name}</span>
      <span style={{ color: '#7C7263', flexShrink: 0 }}>{formatBytes(meta.size)}</span>
      {url && (
        <a href={url} download={meta.name} aria-label={`Download ${meta.name}`} style={{ color: '#B8AC97', display: 'flex' }}>
          <Download size={15} />
        </a>
      )}
    </div>
  );

  if (!url) {
    return (
      <div style={frame}>
        {caption}
        <div style={{ padding: '0 10px 10px' }}>
          {progress !== undefined ? (
            <p style={{ fontSize: 12, color: '#7C7263', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={13} className="spin" /> Opening… {Math.round(progress * 100)}%
            </p>
          ) : (
            <button type="button" onClick={onOpen} style={{ ...attachBtn, padding: '7px 12px' }}>
              <Play size={14} /> Open {kind === 'image' ? 'photo' : kind === 'video' ? 'video' : 'recording'}
            </button>
          )}
          {error && <p style={{ color: '#D98577', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={frame}>
      {kind === 'image' && <img src={url} alt={meta.name} style={{ display: 'block', width: '100%', maxHeight: 520, objectFit: 'contain', background: '#0F0C0A' }} />}
      {kind === 'video' && <video src={url} controls playsInline style={{ display: 'block', width: '100%', maxHeight: 520, background: '#000' }} />}
      {kind === 'audio' && <audio src={url} controls style={{ display: 'block', width: 'calc(100% - 20px)', margin: '10px 10px 0' }} />}
      {caption}
    </div>
  );
}
