import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Unlock, ShieldCheck, Plus, X, KeyRound, ScrollText, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { listEntries, createEntry, deleteEntry, AdminKeyError } from '../api.js';

// ---------- crypto helpers (real client-side AES-GCM, key never leaves the browser) ----------

const enc = new TextEncoder();
const dec = new TextDecoder();

function bufToB64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function b64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(password, saltB64) {
  const salt = b64ToBuf(saltB64);
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptText(password, plaintext) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = bufToB64(saltBytes.buffer);
  const key = await deriveKey(password, saltB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return { ciphertext: bufToB64(cipherBuf), iv: bufToB64(iv.buffer), salt: saltB64 };
}

async function decryptText(password, { ciphertext, iv, salt }) {
  const key = await deriveKey(password, salt);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(iv) }, key, b64ToBuf(ciphertext)
  );
  return dec.decode(plainBuf);
}

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
    if (!formName.trim() || !formContent.trim() || !formPassword) {
      setFormError('Fill in a name, the content, and a passphrase.');
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
      const [name, content] = await Promise.all([
        encryptText(formPassword, formName.trim()),
        encryptText(formPassword, formContent),
      ]);
      const entry = {
        name_enc: name.ciphertext,
        name_iv: name.iv,
        name_salt: name.salt,
        category: formCategory,
        ...content,
      };
      const { cancelled, result: saved } = await withAdminKey(key => createEntry(entry, key));
      if (!cancelled) {
        setItems(prev => [saved, ...prev]);
        setFormName(''); setFormContent(''); setFormPassword(''); setFormPassword2('');
        setShowAdd(false);
      }
    } catch (err) {
      console.error('Save error', err);
      setFormError('Something went wrong sealing this entry. Try again.');
    }
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
      setUnlocked(u => ({ ...u, [item.id]: { name, content } }));
    } catch {
      setUnlockError(e => ({ ...e, [item.id]: 'Wrong passphrase — the seal held.' }));
    }
    setBusy(b => ({ ...b, [item.id]: false }));
  }

  function handleLock(id) {
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
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
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
          <span>Entries are stored encrypted in a shared database. Anyone who can reach this site can see that an entry exists, its category and its date — but the name and content stay sealed unless they know its passphrase. Only holders of the admin key can add or delete entries. A lost passphrase can't be recovered.</span>
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
          <form onSubmit={handleAdd} style={{ background: '#211B15', border: '1px solid #3E342A', borderRadius: 14, padding: 20, marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, margin: 0 }}>New entry</h2>
              <button type="button" onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: '#B8AC97', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <label style={fieldLabel}>Name</label>
            <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Ngā Ingoa o Mangatū — 1998 hui notes" style={fieldInput} />

            <label style={fieldLabel}>Category</label>
            <select value={formCategory} onChange={e => setFormCategory(e.target.value)} style={fieldInput}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label} — {c.desc}</option>)}
            </select>

            <label style={fieldLabel}>Content</label>
            <textarea value={formContent} onChange={e => setFormContent(e.target.value)} rows={5} placeholder="Whakapapa, karakia text, hui minutes, kōrero..." style={{ ...fieldInput, resize: 'vertical', fontFamily: 'inherit' }} />

            <label style={fieldLabel}>Set a passphrase for this entry</label>
            <input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} placeholder={`At least ${MIN_PASSPHRASE} characters`} style={fieldInput} />
            <input type="password" value={formPassword2} onChange={e => setFormPassword2(e.target.value)} placeholder="Confirm passphrase" style={fieldInput} />
            <p style={{ fontSize: 12, color: '#7C7263', marginTop: -4, marginBottom: 14 }}>
              It seals both the name and the content. Share it only with whoever should be able to open this entry. It's never stored anywhere — if it's lost, the entry can't be recovered.
            </p>

            {formError && <p style={{ color: '#D98577', fontSize: 13, marginBottom: 10 }}>{formError}</p>}

            <button type="submit" disabled={formBusy} className="seal-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#C77D3B', color: '#171310', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 600, cursor: formBusy ? 'default' : 'pointer', opacity: formBusy ? 0.7 : 1 }}>
              {formBusy ? <Loader2 size={16} className="spin" /> : <Lock size={16} />}
              {formBusy ? 'Sealing…' : 'Seal & store'}
            </button>
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
                      <p style={{ fontSize: 12, color: '#7C7263', margin: '2px 0 0' }}>{new Date(item.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
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
                      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, background: '#171310', border: '1px solid #2E2620', borderRadius: 8, padding: 12, margin: 0 }}>{unlocked[item.id].content}</pre>
                      <button onClick={() => handleLock(item.id)} style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3E342A', color: '#B8AC97', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}>
                        <Lock size={13} /> Re-seal
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <input
                        type="password"
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
