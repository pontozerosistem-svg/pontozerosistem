import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { supabase } from '../_shared/db.ts';
import { sendWhatsApp } from '../_shared/evolution.ts';

serve(async (req) => {
  // Authorization header check can be added if called securely
  console.log('[process-reminders] Starting execution');

  try {
    const { data: settings } = await supabase.from('scheduling_settings').select('*').single();
    const consultantPhone = settings?.consultant_phone;
    
    if (!consultantPhone) {
      console.log('[process-reminders] Consultant phone not set. Still processing lead reminders.');
    }

    // Busca todas as reuniões agendadas pendentes de alguma notificação
    const { data: meetings } = await supabase
      .from('meetings')
      .select('*, leads(name, phone)')
      .eq('status', 'scheduled')
      .or('reminder_sent.eq.false,feedback_sent.eq.false,proposal_reminder_sent.eq.false');

    if (!meetings || meetings.length === 0) {
      console.log('[process-reminders] No pending meetings found.');
      return new Response('No pending meetings', { status: 200 });
    }

    const now = new Date();
    
    for (const m of meetings) {
      if (!m.scheduled_start) continue;
      const scheduledStart = new Date(m.scheduled_start);
      const leadName = m.leads?.name || 'Lead';
      const leadPhone = m.leads?.phone;
      
      const diffMs = now.getTime() - scheduledStart.getTime(); // Positivo = passou, Negativo = futuro
      const diffMinutes = diffMs / (1000 * 60);

      const updates: any = {};

      // 1. Lembrete 30 minutos antes
      // Se diffMinutes >= -30 e ainda não foi enviado
      if (!m.reminder_sent && diffMinutes >= -30 && diffMinutes <= 0) {
        console.log(`[process-reminders] Sending 30m reminder for lead ${m.lead_id}`);
        
        // Avisa Lead
        if (leadPhone) {
          const pb = Array.isArray(leadPhone) ? leadPhone[0] : leadPhone;
          const phone = typeof pb === 'string' && !pb.includes('@lid') ? pb : (m.leads?.phone || pb); // evita enviar pra @lid diretamente se puder evitar, sendWhatsApp lida um pouco com isso mas a msg direta vai pro numero. Se for só lid, sendWhatsApp ignora ou tentar.
          await sendWhatsApp(phone as string, `Olá ${leadName.split(' ')[0]}! Passando apenas para lembrar que a nossa Reunião de Descoberta começa daqui a pouquinho, em 30 minutos.\n\nAté logo!`);
        }
        
        // Avisa Consultor
        if (consultantPhone) {
          await sendWhatsApp(consultantPhone, `⏰ *Lembrete de Reunião:*\nDaqui a 30 minutos você tem uma reunião com *${leadName}*.`);
        }
        
        updates.reminder_sent = true;
      }

      // 2. Feedback 15 minutos DEPOIS do início
      if (!m.feedback_sent && diffMinutes >= 15) {
        console.log(`[process-reminders] Sending 15m feedback prompt for lead ${m.lead_id}`);
        
        if (consultantPhone) {
          await sendWhatsApp(consultantPhone, `📋 *Acompanhamento:*\nComo está/foi sua reunião com *${leadName}* que começou há 15 minutos?\nNão esqueça de puxar o lead no funil se necessário!`);
        }
        updates.feedback_sent = true;
      }

      // 3. Proposta/Follow-up ~2h DEPOIS do início
      if (!m.proposal_reminder_sent && diffMinutes >= 120) {
        console.log(`[process-reminders] Sending proposal reminder for lead ${m.lead_id}`);
        
        if (consultantPhone) {
          await sendWhatsApp(consultantPhone, `📝 *Ação Necessária:*\nA reunião com *${leadName}* já deve ter finalizado há algum tempo.\nLembrete de enviar a Proposta de Consultoria ou os próximos passos acordados!`);
        }
        updates.proposal_reminder_sent = true;
        updates.status = 'completed'; // auto-close the meeting
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('meetings').update(updates).eq('id', m.id);
      }
    }

    return new Response('Reminders processed', { status: 200 });

  } catch (error: any) {
    console.error('[process-reminders] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
