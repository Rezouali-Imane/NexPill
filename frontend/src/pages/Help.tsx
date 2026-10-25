import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import p from '@/components/ui/Page.module.css';
import { CareTeamDialog } from '@/features/dialogs/ContactDialogs';
import f from './Help.module.css';

const FAQ = [
  ['What if I miss a dose?', 'Take it as soon as you remember, unless it is almost time for the next one. Never take a double dose. If you are unsure, use “I have a concern” on the dose or contact your care team.'],
  ['Who sees my updates?', 'Only your connected caregivers and your care team. Caregivers are told when a dose is missed or skipped, when you report a concern, and when you request a refill.'],
  ['How do I request a refill?', 'Open Medications and choose “Request refill”, or use the reminder on your Overview when supply runs low.'],
  ['Can I change my reminder times?', 'Reminder lead time can be changed in Settings. To change dose times, speak to your care team.'],
];

export default function Help() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Help & support" subtitle="Answers, and people to talk to" />
      <Callout tone="concern" label="In an emergency,">call your local emergency number now. Do not use this app.</Callout>
      <Card aria-labelledby="faq-h">
        <h2 id="faq-h" className={p.h2}>Common questions</h2>
        <div className={f.faq}>
          {FAQ.map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
      </Card>
      <Card aria-labelledby="contact-h">
        <h2 id="contact-h" className={p.h2}>Still need help?</h2>
        <p className={p.sub}>Send a message to your care team and we will reply within one working day.</p>
        <div style={{ marginTop: 20 }}><Button size="md" variant="primary" onClick={() => setOpen(true)}>Contact care team</Button></div>
        <CareTeamDialog open={open} onClose={() => setOpen(false)} />
      </Card>
    </>
  );
}
