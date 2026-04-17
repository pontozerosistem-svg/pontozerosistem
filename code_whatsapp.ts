import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { supabase, saveMessage } from '../_shared/db.ts';
import { sendWhatsApp } from '../_shared/evolution.ts';
import { generateAgentReply } from '../_shared/agent.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  
  try {
    const rawBody = await req.text();
    if (!rawBody) return new Response('ok');
    
    const event = JSON.parse(rawBody);
    const dataObj = event.data || event;
    const isFromMe = dataObj.key?.fromMe || event.fromMe === true;

    if (isFromMe) return new Response('ok');

    const jid = dataObj.key?.remoteJid || dataObj.remoteJid || event.sender;
    const numeric = jid.replace(/\D/g, '');
    const text = dataObj.message?.conversation || dataObj.message?.extendedTextMessage?.text || (dataObj.message?.audioMessage ? '[Áudio]' : '');

    if (!jid || !text) return new Response('ok');

    const orQuery = 'phone.eq.' + jid + ',phone.eq.' + numeric + ',metadata->known_lids.cs.["' + jid + '"],metadata->known_numbers.cs.["' + numeric + '"]';
    
    const { data: lead } = await supabase
      .from('leads')
      .select('*, agent_state(*)')
      .or(orQuery)
      .maybeSingle();

    if (!lead) return new Response('ok');

    const agentState = (lead.agent_state?.[0] || lead.agent_state) || { spin_phase: 'agendamento', is_active: true };
    if (!agentState.is_active) return new Response('ok');

    await saveMessage(lead.id, 'user', text);

    const { reply, newPhase } = await generateAgentReply([], agentState, lead, "");

    await saveMessage(lead.id, 'assistant', reply);
    await sendWhatsApp(jid, reply.replace(/\*\*/g, '*'));

    await supabase.from('agent_state').upsert({
      lead_id: lead.id,
      spin_phase: newPhase,
      last_message_at: new Date().toISOString()
    }, { onConflict: 'lead_id' });

    return new Response('ok');
  } catch (e) {
    console.error('Erro:', e.message);
    return new Response('ok');
  }
});
