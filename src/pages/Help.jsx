import React from 'react';
import PageShell, { H2, P } from '../components/PageShell.jsx';
import { MAX_FILE_BYTES, MAX_FILES, formatBytes } from '../media.js';

const FAQS = [
  {
    q: "I've lost my passphrase. Can it be reset?",
    a: "No. The passphrase is the only key, and it's never stored anywhere, so nobody can reset it. Not even the person who built the pātaka. Keep it somewhere safe, or make sure a trusted person in the whānau has it too.",
  },
  {
    q: 'What makes a good passphrase?',
    a: "At least 10 characters. A short phrase is easier to remember and harder to guess than a single word, e.g. three or four words that mean something to you but aren't obvious to others. Avoid names and birthdays.",
  },
  {
    q: 'How do I share an entry with someone?',
    a: "Share the passphrase kanohi ki te kanohi (in person) or by phone call where you can. Avoid sending it by text, email or Messenger, where it can sit around for years.",
  },
  {
    q: "Why can't I search for an entry by name?",
    a: 'Names are sealed too, so the pātaka itself doesn\'t know what any entry is called. Use the category tabs on the home page and the dates to find what you\'re after, then open it with the passphrase.',
  },
  {
    q: 'Who can add or delete entries?',
    a: 'Only people holding the admin key. Anyone can view the list of sealed entries, but adding or removing them needs the admin key. Ask the marae committee if you think you should have one.',
  },
  {
    q: 'How do I record a waiata or kōrero?',
    a: 'Press "Seal new entry", then tap Record audio (or Record video). Your browser will ask for permission to use the microphone, so tap Allow. You can also attach recordings or videos you already have on your phone.',
  },
  {
    q: 'How big can files be?',
    a: `Up to ${formatBytes(MAX_FILE_BYTES)} per file, and up to ${MAX_FILES} files per entry. For long videos, trim or split them first.`,
  },
  {
    q: "I'm using a shared or marae computer. Anything I should do?",
    a: 'Lock any entries you opened when you\'re done, and press "Admin key on · Lock" in the menu if you used the admin key. Then close the tab. Never let the browser save your passphrase.',
  },
];

export default function Help() {
  return (
    <PageShell
      eyebrow="Āwhina · Help"
      title="Pātai? Questions?"
      intro="Common questions about using the pātaka. If you're stuck, ask the marae committee."
      image="/images/bush-bend.jpg"
    >
      <div className="faq">
        {FAQS.map(({ q, a }) => (
          <details key={q}>
            <summary>{q}</summary>
            <div>{a}</div>
          </details>
        ))}
      </div>

      <H2>Kōrero mai · Still stuck?</H2>
      <P>Talk to the marae committee, or whoever looks after the pātaka for your whānau.</P>
    </PageShell>
  );
}
