import React from 'react';

// Shared layout for the content pages (About, How it works, Help).
export default function PageShell({ eyebrow, title, intro, image = '/images/hills-mist.jpg', children }) {
  return (
    <>
      <header
        className="img-banner"
        style={{ backgroundImage: `url('${image}')`, borderRadius: 0, border: 'none', borderBottom: '1px solid #2E2620', padding: '64px 20px 34px' }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {eyebrow && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: '0.12em', color: '#C77D3B', textTransform: 'uppercase' }}>
              {eyebrow}
            </span>
          )}
          <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 'clamp(28px, 6vw, 40px)', margin: '8px 0 0', lineHeight: 1.1 }}>{title}</h1>
          {intro && <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: '#D9CDB9', maxWidth: 560, marginBottom: 0 }}>{intro}</p>}
        </div>
      </header>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 64px' }}>{children}</main>
    </>
  );
}

export function H2({ children }) {
  return <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, margin: '32px 0 10px' }}>{children}</h2>;
}

export function P({ children, style }) {
  return <p style={{ fontSize: 15, lineHeight: 1.7, color: '#D9CDB9', margin: '0 0 12px', ...style }}>{children}</p>;
}

export function Card({ children, style }) {
  return <div style={{ background: '#211B15', border: '1px solid #3E342A', borderRadius: 12, padding: 16, ...style }}>{children}</div>;
}

export function DraftNote({ children }) {
  return (
    <p style={{ fontSize: 12, color: '#7C7263', border: '1px dashed #3E342A', borderRadius: 8, padding: '8px 12px', margin: '0 0 20px' }}>
      {children || 'Draft kōrero, still to be confirmed with whānau.'}
    </p>
  );
}
