import React, { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Menu, X, KeyRound } from 'lucide-react';

export default function Nav({ path, routes, adminActive, onLockAdmin, onSeal }) {
  const [open, setOpen] = useState(false);

  // close the burger menu when the page changes or Escape is pressed
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const links = routes.map(r => (
    <a
      key={r.path}
      href={`#${r.path}`}
      className={`nav-link${path === r.path ? ' active' : ''}`}
      aria-current={path === r.path ? 'page' : undefined}
    >
      <span className="reo">{r.reo}</span>
      <span className="en">{r.en}</span>
    </a>
  ));

  const adminPill = adminActive && (
    <button type="button" className="admin-pill" onClick={onLockAdmin} title="Forget the admin key on this device">
      <KeyRound size={13} /> Admin key on · Lock
    </button>
  );

  const sealBtn = (
    <button type="button" className="nav-seal seal-btn" onClick={() => { setOpen(false); onSeal(); }}>
      <Plus size={15} /> Seal new entry
    </button>
  );

  return (
    <nav className="site-nav" aria-label="Main">
      <div className="nav-inner">
        <a href="#/" className="nav-brand">
          <ShieldCheck size={19} color="#3E6653" />
          <span>Te Pātaka o Mangatū</span>
        </a>

        <ul className="nav-links">
          {links.map(l => <li key={l.key}>{l}</li>)}
        </ul>

        <div className="nav-actions">
          {adminPill}
          {sealBtn}
          <button
            type="button"
            className="nav-burger"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen(o => !o)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-menu" className="mobile-menu">
          {links}
          {sealBtn}
          {adminPill}
        </div>
      )}
    </nav>
  );
}
