import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { supabase, saveMessage } from '../_shared/db.ts';
import { sendWhatsApp } from '../_shared/evolution.ts';
import { STAGES } from '../_shared/stages.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });

  try {
    const { nome_completo, telefone_whatsapp, canal_origem } = await req.json();
    let phone = String(telefone_whatsapp).replace(/\D/g, '');
    if (phone.length === 10 || phone.length === 11) phone = '55' + phone;

    const { data: lead, error } = await supabase.from('leads').upsert({
      name: nome_completo || 'Lead',
      phone: phone,
      source: canal_origem || 'landing_page',
      stage_id: STAGES.PRIMEIRO_CONTATO
    }, { onConflict: 'phone' }).select('id').single();

    if (error) throw error;

    const msg = `Oi ${nome_completo.split(' ')[0]}, eu sou a Luiza da Ponto Zero!\n\nHoje você já atua no mercado ou está iniciando?`;
    
    await saveMessage(lead.id, 'assistant', msg);
    await sendWhatsApp(phone, msg);

    return new Response('ok');
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
});
