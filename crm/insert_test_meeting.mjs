import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zyuldjccrpmvzlgdxmtk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5dWxkamNjcnBtdnpsZ2R4bXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTcxMTEsImV4cCI6MjA5MDE5MzExMX0.Zork4rU4pTMAa-2IFXeyzKLEsNP_xdna8VMS4DkDmP8'; // anon key

const supabase = createClient(supabaseUrl, supabaseKey);

async function addMeeting() {
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .ilike('name', '%luiza%')
    .limit(1);

  if (error || !leads || leads.length === 0) {
    console.error("Lead 'luiza' não encontrado:", error);
    return;
  }

  const luiza = leads[0];
  console.log("Lead Luiza encontrado! ID:", luiza.id);

  const parsedDate = new Date();
  parsedDate.setDate(parsedDate.getDate() + 1);
  parsedDate.setHours(15, 0, 0, 0);

  const meetingId = crypto.randomUUID();
  const meetSlug = `PontoZero-${meetingId.replace(/-/g, '').substring(0, 10).toUpperCase()}`;
  const meetLink = `https://meet.jit.si/${meetSlug}`;

  const { error: insertErr } = await supabase.from('meetings').insert({
    id: meetingId,
    lead_id: luiza.id,
    scheduled_start: parsedDate.toISOString(),
    meet_link: meetLink,
    status: 'scheduled',
  });

  if (insertErr) {
    console.error("Erro ao criar reunião:", insertErr);
  } else {
    console.log(`============= SUCESSO =============`);
    console.log(`Reunião de teste criada com sucesso!`);
    console.log(`Lead: ${luiza.name}`);
    console.log(`Data e Hora: ${parsedDate.toLocaleString('pt-BR')}`);
    console.log(`Link Jitsi: ${meetLink}`);
    console.log(`===================================`);
  }
}

addMeeting();
