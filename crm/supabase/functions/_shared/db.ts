import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

export async function saveMessage(
  leadId: string,
  role: 'user' | 'assistant',
  content: string
) {
  const { error } = await supabase
    .from('conversations')
    .insert({ lead_id: leadId, role, content });
  
  if (error) {
    console.error(`[db] Erro ao salvar mensagem para lead ${leadId}:`, error.message);
    throw error;
  }
}

export async function logActivity(
  leadId: string,
  type: string,
  description: string,
  fromStage: number | null,
  toStage: number | null
) {
  const { error } = await supabase.from('activities').insert({
    lead_id: leadId,
    type,
    description,
    from_stage_id: fromStage,
    to_stage_id:   toStage,
  });

  if (error) {
    console.error(`[db] Erro ao logar atividade para lead ${leadId}:`, error.message);
  }
}
