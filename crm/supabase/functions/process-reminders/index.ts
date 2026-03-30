import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ── Gera link Jitsi único (sem API, sem custo) ─────────────────────────
function generateMeetLink(meetingId: string): string {
  const slug = `PontoZero-${meetingId.replace(/-/g, '').substring(0, 10).toUpperCase()}`;
  return `https://meet.jit.si/${slug}`;
}

// ── Envia mensagem via WhatsApp (Evolution API) ─────────────────────────
async function sendWhatsApp(phone: string, text: string) {
  const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
  const instanceName = Deno.env.get('EVOLUTION_INSTANCE');
  const apiKey       = Deno.env.get('EVOLUTION_API_KEY');
  if (!evolutionUrl || !instanceName || !apiKey) return;

  const number = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number,
      options: { delay: 1200, linkPreview: false },
      textMessage: { text },
    }),
  }).catch(e => console.error('[evolution] Erro:', e));
}

serve(async () => {
  console.log('[process-reminders] Iniciando...');

  try {
    const { data: settings } = await supabase
      .from('scheduling_settings')
      .select('*')
      .single();

    const consultantPhone = settings?.consultant_phone as string | null;

    // Busca reuniões agendadas que ainda precisam de alguma notificação
    const { data: meetings } = await supabase
      .from('meetings')
      .select('*, leads(name, phone)')
      .eq('status', 'scheduled')
      .or('reminder_sent.eq.false,feedback_sent.eq.false,proposal_reminder_sent.eq.false');

    if (!meetings || meetings.length === 0) {
      console.log('[process-reminders] Nenhuma reunião pendente.');
      return new Response('No pending meetings', { status: 200 });
    }

    const now = new Date();

    for (const m of meetings) {
      if (!m.scheduled_start) continue;

      const scheduledStart = new Date(m.scheduled_start);
      const diffMs         = now.getTime() - scheduledStart.getTime();
      const diffMinutes    = diffMs / (1000 * 60); // positivo = já passou

      const leadName  = (m.leads as any)?.name || 'Lead';
      const leadPhone = (m.leads as any)?.phone as string | null;

      const updates: Record<string, unknown> = {};

      // ── 1. LEMBRETE 30 MIN ANTES ───────────────────────────────────────
      // diffMinutes entre -35 e 0 (janela: 35 min antes até o horário exato)
      if (!m.reminder_sent && diffMinutes >= -35 && diffMinutes <= 0) {
        console.log(`[reminders] Lembrete 30min → lead ${m.lead_id}`);

        // Garante que o meet_link já existe (gera se necessário)
        let meetLink = m.meet_link as string | null;
        if (!meetLink) {
          meetLink = generateMeetLink(m.id);
          await supabase.from('meetings').update({ meet_link: meetLink }).eq('id', m.id);
        }

        const firstName = leadName.split(' ')[0];

        // Mensagem para o Lead
        if (leadPhone && !leadPhone.includes('@lid')) {
          await sendWhatsApp(leadPhone, [
            `Olá ${firstName}! 👋 Passando para lembrar que nossa *Reunião de Descoberta* começa em aproximadamente *30 minutos*.`,
            `🔗 *Link da videochamada:*\n${meetLink}`,
            `Acesse pelo navegador ou pelo app Jitsi Meet. Até daqui a pouco!`,
          ].join('\n\n'));
        }

        // Mensagem para o Consultor
        if (consultantPhone) {
          await sendWhatsApp(consultantPhone, [
            `⏰ *Reunião em 30 minutos!*`,
            `Lead: *${leadName}*`,
            `🔗 Link da chamada:\n${meetLink}`,
          ].join('\n'));
        }

        updates.reminder_sent = true;
      }

      // ── 2. FEEDBACK 15 MIN DEPOIS DO INÍCIO ────────────────────────────
      if (!m.feedback_sent && diffMinutes >= 15) {
        console.log(`[reminders] Feedback 15min → lead ${m.lead_id}`);

        if (consultantPhone) {
          await sendWhatsApp(consultantPhone, [
            `📋 *Acompanhamento pós-reunião:*`,
            `A reunião com *${leadName}* começou há 15 minutos.`,
            `Como está indo? Lembre de mover o lead no pipeline se necessário!`,
          ].join('\n'));
        }

        updates.feedback_sent = true;
      }

      // ── 3. LEMBRETE DE PROPOSTA ~2H DEPOIS ─────────────────────────────
      if (!m.proposal_reminder_sent && diffMinutes >= 120) {
        console.log(`[reminders] Proposta → lead ${m.lead_id}`);

        if (consultantPhone) {
          await sendWhatsApp(consultantPhone, [
            `📝 *Ação Necessária:*`,
            `A reunião com *${leadName}* já deve ter encerrado.`,
            `Não esqueça de enviar a Proposta de Consultoria ou definir os próximos passos!`,
          ].join('\n'));
        }

        updates.proposal_reminder_sent = true;
        updates.status = 'completed';
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('meetings').update(updates).eq('id', m.id);
      }
    }

    return new Response('Reminders processed', { status: 200 });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[process-reminders] Erro fatal:', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
