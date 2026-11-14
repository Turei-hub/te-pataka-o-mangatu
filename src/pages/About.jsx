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
      <P>
        Built by Turei Milner of Kaupeka Digital. Turei is from Mangatū and grew up in Whatatutu. The pātaka is built
        for the marae and guided by whānau. Decisions about what goes in it and who holds the keys belong to the marae,
        not the developer.
      </P>
    </PageShell>
  );
}
