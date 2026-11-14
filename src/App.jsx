import React, { useState, useEffect, useCallback } from 'react';
import Nav from './components/Nav.jsx';
import MangatuVault from './components/MangatuVault.jsx';
import About from './pages/About.jsx';
import HowItWorks from './pages/HowItWorks.jsx';
import Help from './pages/Help.jsx';

// reo label first, English underneath
export const ROUTES = [
  { path: '/', reo: 'Te Pātaka', en: 'Home' },
  { path: '/mo-matou', reo: 'Mō Mātou', en: 'About' },
  { path: '/pehea', reo: 'Pēhea', en: 'How it works' },
  { path: '/awhina', reo: 'Āwhina', en: 'Help' },
];

// Tiny hash router: #/mo-matou etc. No extra packages, no Vercel rewrites needed.
function currentPath() {
  const p = window.location.hash.replace(/^#/, '') || '/';
  return ROUTES.some(r => r.path === p) ? p : '/';
}

export default function App() {
  const [path, setPath] = useState(currentPath);
  // admin key lives here so it survives moving between pages (memory only, never persisted)
  const [adminKey, setAdminKey] = useState('');
  const [sealRequest, setSealRequest] = useState(0);

  useEffect(() => {
    const onHash = () => { setPath(currentPath()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const r = ROUTES.find(r => r.path === path);
    document.title = path === '/' ? 'Te Pātaka o Mangatū' : `${r.reo} · Te Pātaka o Mangatū`;
  }, [path]);

  const handleSeal = useCallback(() => {
    if (path !== '/') window.location.hash = '#/';
    setSealRequest(n => n + 1);
  }, [path]);

  let page;
  if (path === '/mo-matou') page = <About />;
  else if (path === '/pehea') page = <HowItWorks />;
  else if (path === '/awhina') page = <Help />;
  else page = (
    <MangatuVault
      adminKey={adminKey}
      setAdminKey={setAdminKey}
      sealRequest={sealRequest}
      onSealHandled={() => setSealRequest(0)}
    />
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#171310', color: '#EDE3D3', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{GLOBAL_CSS}</style>

      <a href="#main" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>

      <Nav
        path={path}
        routes={ROUTES}
        adminActive={!!adminKey}
        onLockAdmin={() => setAdminKey('')}
        onSeal={handleSeal}
      />

      <div id="main" tabIndex={-1} style={{ flex: 1, outline: 'none' }}>{page}</div>

      {/* Footer */}
      <footer className="img-banner" style={{ backgroundImage: "url('/images/bush-bend.jpg')", borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderBottom: 'none', padding: '56px 20px 40px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: 18, margin: 0 }}>Te Pātaka o Mangatū</p>
          <ul className="footer-links">
            {ROUTES.map(r => <li key={r.path}><a href={`#${r.path}`}>{r.reo}</a></li>)}
          </ul>
          <p style={{ fontSize: 12, color: '#B8AC97', margin: '6px 0 0' }}>Whatatutu, Tairāwhiti · Landscape images are AI-generated, not photos of Mangatū.</p>
          <div style={{ borderTop: '1px solid rgba(237,227,211,0.15)', marginTop: 16, paddingTop: 12, fontSize: 12, color: '#B8AC97', lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>© 2026 Turei Milner (Ngāriki Kaipūtahi) · Kaupeka Digital</p>
            <p style={{ margin: 0 }}>The taonga held in this pātaka belong to the whānau and hapū of Mangatū.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
  @font-face { font-family: 'Fraunces'; src: url('/fonts/fraunces-var.woff2') format('woff2'); font-weight: 100 900; font-style: normal; font-display: swap; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #171310; }
  a { color: #C77D3B; }
  .weave-bg {
    background-image: repeating-linear-gradient(45deg, rgba(199,125,59,0.06) 0px, rgba(199,125,59,0.06) 1px, transparent 1px, transparent 14px),
                       repeating-linear-gradient(-45deg, rgba(62,102,83,0.06) 0px, rgba(62,102,83,0.06) 1px, transparent 1px, transparent 14px);
  }
  .hero-bg {
    background-image: linear-gradient(180deg, rgba(23,19,16,0.35) 0%, rgba(23,19,16,0.75) 60%, #171310 100%), url('/images/hero-river.jpg');
    background-size: cover; background-position: center 40%;
  }
  .img-banner { position: relative; border-radius: 14px; overflow: hidden; background: #211B15 center / cover no-repeat; border: 1px solid #2E2620; }
  .img-banner::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(23,19,16,0.85) 0%, rgba(23,19,16,0.25) 100%); }
  .img-banner > * { position: relative; z-index: 1; }
  .seal-btn:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible, summary:focus-visible {
    outline: 2px solid #C77D3B; outline-offset: 2px;
  }
  #seal-form { scroll-margin-top: 84px; }

  .skip-link { position: absolute; left: -999px; top: 8px; z-index: 50; background: #C77D3B; color: #171310; padding: 8px 12px; border-radius: 8px; font-weight: 600; text-decoration: none; }
  .skip-link:focus { left: 8px; }

  /* ---------- nav ---------- */
  .site-nav { position: sticky; top: 0; z-index: 20; background: rgba(23,19,16,0.9); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-bottom: 1px solid #2E2620; }
  .nav-inner { max-width: 1080px; margin: 0 auto; padding: 10px 20px; display: flex; align-items: center; gap: 16px; }
  .nav-brand { display: flex; align-items: center; gap: 8px; color: #EDE3D3; text-decoration: none; font-family: 'Fraunces', serif; font-weight: 700; font-size: 17px; white-space: nowrap; }
  .nav-links { list-style: none; display: flex; gap: 4px; margin: 0 auto; padding: 0; }
  .nav-link { display: flex; flex-direction: column; align-items: center; padding: 6px 14px; border-radius: 8px; text-decoration: none; color: #B8AC97; line-height: 1.2; transition: background 0.15s, color 0.15s; }
  .nav-link .reo { font-size: 14px; font-weight: 600; }
  .nav-link .en { font-size: 11px; color: #7C7263; }
  .nav-link:hover { background: #211B15; color: #EDE3D3; }
  .nav-link.active { color: #EDE3D3; background: #211B15; box-shadow: inset 0 -2px 0 #C77D3B; }
  .nav-actions { display: flex; align-items: center; gap: 8px; }
  .nav-seal { display: flex; align-items: center; justify-content: center; gap: 6px; background: #3E6653; color: #EDE3D3; border: none; border-radius: 8px; padding: 9px 14px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; font-family: inherit; }
  .admin-pill { display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(199,125,59,0.08); border: 1px solid #5A4A2E; color: #C77D3B; border-radius: 999px; padding: 6px 11px; font-size: 12px; cursor: pointer; white-space: nowrap; font-family: inherit; }
  .nav-burger { display: none; align-items: center; justify-content: center; background: none; border: 1px solid #3E342A; color: #EDE3D3; border-radius: 8px; width: 40px; height: 40px; cursor: pointer; }
  .mobile-menu { display: none; }
  @media (max-width: 860px) {
    .nav-links, .nav-actions > .nav-seal, .nav-actions > .admin-pill { display: none; }
    .nav-burger { display: flex; }
    .nav-actions { margin-left: auto; }
    .mobile-menu { display: flex; flex-direction: column; gap: 4px; padding: 8px 20px 18px; border-top: 1px solid #2E2620; }
    .mobile-menu .nav-link { flex-direction: row; justify-content: space-between; align-items: baseline; padding: 13px 12px; }
    .mobile-menu .nav-link .reo { font-size: 16px; }
    .mobile-menu .nav-link .en { font-size: 13px; }
    .mobile-menu .nav-seal { margin-top: 8px; padding: 13px; font-size: 15px; }
    .mobile-menu .admin-pill { margin-top: 4px; padding: 10px; font-size: 13px; }
    .cat-tabs { flex-wrap: nowrap; }
  }

  /* ---------- category filter ---------- */
  .cat-tabs { display: flex; flex-wrap: wrap; gap: 6px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 16px; scrollbar-width: thin; }
  .cat-tab { flex-shrink: 0; background: #211B15; border: 1px solid #3E342A; color: #B8AC97; border-radius: 999px; padding: 7px 13px; font-size: 13px; cursor: pointer; font-family: inherit; white-space: nowrap; }
  .cat-tab:hover { color: #EDE3D3; }
  .cat-tab.active { background: #3E6653; border-color: #3E6653; color: #EDE3D3; }
  .cat-tab .count { opacity: 0.65; margin-left: 5px; font-size: 12px; }

  /* ---------- content pages ---------- */
  .faq details { background: #211B15; border: 1px solid #3E342A; border-radius: 10px; margin-bottom: 10px; }
  .faq summary { cursor: pointer; padding: 14px 16px; font-weight: 600; font-size: 15px; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
  .faq summary::-webkit-details-marker { display: none; }
  .faq summary::after { content: '+'; color: #C77D3B; font-size: 18px; line-height: 1; }
  .faq details[open] summary::after { content: '−'; }
  .faq details > div { padding: 0 16px 14px; font-size: 14px; line-height: 1.7; color: #D9CDB9; }
  .steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }

  .footer-links { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 0; margin: 10px 0 4px; }
  .footer-links a { color: #D9CDB9; text-decoration: none; font-size: 13px; }
  .footer-links a:hover { color: #EDE3D3; text-decoration: underline; }

  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; scroll-behavior: auto !important; } }
`;
