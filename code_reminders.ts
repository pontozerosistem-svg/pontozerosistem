import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function sendWhatsApp(phone: string, text: string) {
  const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
  const instanceName = Deno.env.get('EVOLUTION_INSTANCE');
  const apiKey       = Deno.env.get('EVOLUTION_API_KEY');
  if (!evolutionUrl || !instanceName || !apiKey) return;
  const number = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number, options: { delay: 1000 }, textMessage: { text } }),
  });
}

serve(async () => {
  try {
    const { data: settings } = await supabase.from('scheduling_settings').select('*').single();
    const { data: meetings } = await supabase.from('meetings').select('*, leads(name, phone)').eq('status', 'scheduled').eq('reminder_sent', false);

    if (!meetings?.length) return new Response('Nada pendente', { status: 200 });

    const now = new Date();
    for (const m of meetings.slice(0, 10)) {
      const scheduledStart = new Date(m.scheduled_at);
      const diffMin = (now.getTime() - scheduledStart.getTime()) / (1000 * 60);

      if (diffMin >= -65 && diffMin <= 0) {
        const link = m.meet_link || `https://meet.jit.si/PontoZero-${m.id.substring(0, 8)}`;
        if (m.leads.phone) await sendWhatsApp(m.leads.phone, `Olá! 👋 Nossa reunião começa em 30 min.\n🔗 Link: ${link}`);
        if (settings?.consultant_phone) await sendWhatsApp(settings.consultant_phone, `⏰ Reunião em 30 min com ${(m.leads as any).name}!\n🔗 Link: ${link}`);
        await supabase.from('meetings').update({ reminder_sent: true, meet_link: link }).eq('id', m.id);
      }
    }
    return new Response('Lembretes verificados', { status: 200 });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
});
