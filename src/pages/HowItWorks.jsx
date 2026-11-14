import React from 'react';
import { FileText, KeyRound, Lock, Database, EyeOff, Eye } from 'lucide-react';
import PageShell, { H2, P, Card } from '../components/PageShell.jsx';

const STEPS = [
  { icon: FileText, title: 'You add a taonga', body: 'Write it, attach photos, or record a waiata or kōrero.' },
  { icon: KeyRound, title: 'You choose a passphrase', body: 'Only people you share it with will be able to open the entry.' },
  { icon: Lock, title: 'Your device seals it', body: 'Your browser locks everything before it leaves your phone or computer.' },
  { icon: Database, title: 'The pātaka stores it', body: 'Only the sealed copy is saved. It looks like scrambled text to anyone else.' },
];

const SEALED = ['The entry name', 'Everything written in it', 'Photos, videos and recordings', 'File names and types'];
const VISIBLE = ['That an entry exists', 'Its category (e.g. Whakapapa)', 'The date it was sealed', 'How many attachments it has, and roughly how big they are'];

export default function HowItWorks() {
  return (
    <PageShell
      eyebrow="Pēhea · How it works"
      title="Sealed before it leaves your hands"
      intro="You don't need to understand the technology to trust it. Here's what happens when you seal an entry."
    >
      <div className="steps">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <Card key={title} style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', top: 12, right: 14, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#7C7263' }}>{i + 1}</span>
            <Icon size={22} color="#C77D3B" />
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 17, margin: '10px 0 6px' }}>{title}</h3>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: '#B8AC97', margin: 0 }}>{body}</p>
          </Card>
        ))}
      </div>

      <H2>What stays sealed, and what doesn't</H2>
      <div className="two-col">
        <Card style={{ borderColor: '#3E6653' }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, margin: '0 0 10px' }}><EyeOff size={17} color="#3E6653" /> Sealed (needs the passphrase)</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8, color: '#D9CDB9' }}>{SEALED.map(s => <li key={s}>{s}</li>)}</ul>
        </Card>
        <Card>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, margin: '0 0 10px' }}><Eye size={17} color="#C77D3B" /> Visible to anyone on the site</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8, color: '#D9CDB9' }}>{VISIBLE.map(s => <li key={s}>{s}</li>)}</ul>
        </Card>
      </div>

      <H2>Nobody else can open it</H2>
      <P>
        Not the marae committee, not the person who built the pātaka, not the companies running the servers. Without the
        passphrase, a sealed entry can't be opened. That's also why a lost passphrase can't be recovered: there's no
        spare key anywhere.
      </P>

      <H2>Where it's kept</H2>
      <P>
        The sealed copies are stored on servers in Sydney, Australia. Because everything is sealed before it gets there,
        the companies hosting it can't read any of it. Hosting the pātaka on servers controlled by the iwi or hapū is
        something we'd like to offer in future.
      </P>

      <details style={{ marginTop: 24, fontSize: 13, color: '#7C7263' }}>
        <summary style={{ cursor: 'pointer' }}>Technical details</summary>
        <p style={{ lineHeight: 1.7, marginTop: 8 }}>
          AES-GCM 256-bit encryption in the browser (Web Crypto API). Keys are derived from the passphrase with
          PBKDF2-SHA256 at 600,000 iterations, with a random salt and IV for each field. Passphrases are never sent to or
          stored on the server. Adding or deleting entries needs a separate admin key.
        </p>
      </details>
    </PageShell>
  );
}
