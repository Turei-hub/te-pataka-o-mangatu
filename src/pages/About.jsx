import React from 'react';
import PageShell, { H2, P, Card, DraftNote } from '../components/PageShell.jsx';

const MARAE = [
  ['Rohe', 'Whatatutu, Tairāwhiti'],
  ['Iwi', 'Te Aitanga ā Māhaki'],
  ['Wharenui', 'Te Ngāwari'],
  ['Maunga', 'Maungahaumia'],
  ['Awa', 'Mangatū'],
  ['Waka', 'Horouta'],
];

export default function About() {
  return (
    <PageShell
      eyebrow="Mō Mātou · About"
      title="A pātaka for our taonga"
      intro="Te Pātaka o Mangatū keeps the records of Mangatū Marae safe, sealed and in the hands of the people they belong to."
    >
      <DraftNote />

      <H2>Te kaupapa</H2>
      <P>
        Te Pātaka o Mangatū is a storehouse for the taonga of Mangatū Marae: whakapapa, karakia and waiata, hui minutes,
        whenua records and kōrero tuku iho. A pātaka kept food and treasured things safe, raised up off the ground.
        This one keeps our records safe online, sealed so only the people we choose can open them.
      </P>

      <H2>He aha ai? · Why it matters</H2>
      <P>
        Data about our people, our whenua and our kōrero should be governed by us. That's the heart of Māori data
        sovereignty, the kaupapa championed by groups like Te Mana Raraunga.
      </P>
      <P>
        Most online storage means trusting a company with readable copies of your files. Here, every entry is sealed on
        your own device before it goes anywhere, so the servers only ever hold locked copies. The key stays with whānau.
      </P>

      <H2>Mangatū Marae</H2>
      <Card>
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 20px', margin: 0, fontSize: 15 }}>
          {MARAE.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#C77D3B', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 2 }}>{k}</dt>
              <dd style={{ margin: 0, color: '#EDE3D3' }}>{v}</dd>
            </React.Fragment>
          ))}
        </dl>
      </Card>

      <H2>Nā wai i hanga? · Who built it</H2>
      <Card style={{ borderLeft: '3px solid #C77D3B', marginBottom: 16 }}>
        <p lang="mi" style={{ fontFamily: "'Fraunces', serif", fontSize: 17, lineHeight: 1.8, margin: 0, color: '#EDE3D3' }}>
          Ko Turei tōku ingoa<br />
          Ko Maungahaumia te maunga<br />
          Ko Waipaoa te awa<br />
          Ko Horouta te waka<br />
          Ko Ngāriki Kaipūtahi te iwi ki te taha o tōku māmā<br />
          Ko Ngāti Porou te iwi ki te taha o tōku pāpā
        </p>
      </Card>
      <P>
        I grew up in Whatatutu and spent years working with my hands: felling trees, building, working the bush. That
        mahi taught me to work with precision and see a job through, and I bring the same into code.
      </P>
      <P>
        Moving into software was a deliberate choice. What clicked for me at Mission Ready was realising I could build
        tools that serve communities, especially my own. Te Pātaka o Mangatū is that kaupapa: a safe place for our
        taonga, built by one of our own, through Kaupeka Digital. Decisions about what goes in it and who holds the keys
        belong to the marae, not the developer.
      </P>
      <P>I'm a father, and this mahi is part of what I'm leaving for my sons.</P>
      <P>
        More of my story: <a href="https://turei.dev" target="_blank" rel="noopener noreferrer">turei.dev</a>
      </P>
    </PageShell>
  );
}
