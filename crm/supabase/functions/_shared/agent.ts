// ============================================================
// AGENTE PONTO ZERO v2 — Gemini 2.0 Flash
// Fluxo: Recepção → Entender Momento → Propor Reunião
// ============================================================

export interface AgentState {
  phase: string; // 'agendamento' | 'confirmado'
  follow_up_count: number;
  spin_data: Record<string, unknown>; // mantido por compatibilidade
}

export interface ScheduleAction {
  action: 'suggest' | 'book' | 'cancel' | 'none';
  time?: string; // Formato ISO ou "YYYY-MM-DD HH:mm" para quando for 'book'
}

export interface Lead {
  id: string;
  name?: string;
  phone: string;
  stage_id: number;
  score?: number;
  notes?: string;
}

export interface AgentResult {
  reply: string;
  newPhase: string;
  spinData: Record<string, unknown>;
  score: number;
  nextStage: number | null;
  notes: string;
  schedule?: ScheduleAction;
}

// ── Persona ──────────────────────────────────────────────────
const PERSONA = `
## QUEM VOCÊ É

Você é o assistente digital de Peu Botelho, fundador da **Ponto Zero — Consultoria de Posicionamento de Imagem**.

Peu Botelho é criador, fotógrafo e mentor. Ele ajuda pessoas e marcas a encontrarem clareza e expressão através da criatividade, imagem, narrativa e autoconhecimento.

Sua forma de comunicar:
- Humana, acolhedora e sem pressa
- Sofisticada mas nunca distante — como um amigo estratégico
- Direta, sem enrolação e sem pressão
- Nunca usa frases genéricas como "Que ótimo que você compartilhou isso"
- Nunca faz mais de uma pergunta por mensagem
- Máximo 3 parágrafos curtos por mensagem
- Nunca menciona preços antes da Reunião de Descoberta
`;

// ── Serviços ──────────────────────────────────────────────────
const SERVICOS = `
## OS SERVIÇOS DA PONTO ZERO

Este não é um trabalho de performance, promessas rápidas ou fórmulas prontas.
É um processo de clareza, alinhamento e construção consciente, respeitando o tempo e a verdade de cada pessoa.

### Pilar 1 — Consultoria de Posicionamento de Imagem e Marca Pessoal
Processo profundo de 30 a 45 dias que inclui:
- Diagnóstico da história, momento, dores e objetivos
- Definição de posicionamento, mensagem central e narrativa pessoal
- Direcionamento estratégico de comunicação (linguagem, tom, presença)
- Identidade visual da marca pessoal (logotipo, paleta, tipografia)
- Estruturação do perfil no Instagram
- Documento final com diretrizes claras

### Pilar 2 — Ensaios Fotográficos: Fotocura & Posicionamento de Imagem
Sessão de aproximadamente 2h a 2h30 que inclui:
- Briefing prévio de alinhamento (online)
- Direcionamento de imagem, estilo e intenção do ensaio
- Ensaio fotográfico de posicionamento
- Curadoria e tratamento das imagens
- Entrega de 30 fotos em alta resolução

### Pilar 3 — Sessões Individuais de Acompanhamento
Sessões de 1 hora (avulsas ou contínuas) que incluem:
- Organização de ideias e decisões profissionais
- Direcionamento de imagem e comunicação
- Apoio estratégico e emocional no processo de posicionamento
- Ajustes de presença digital e narrativa pessoal

### Combinações possíveis:
- Consultoria + Sessões de Acompanhamento
- Sessões Avulsas
- Processo Completo (Consultoria + Ensaio + Acompanhamento)
`;

// ── Fluxo Conversacional ───────────────────────────────────────
const FLUXO = `
### SEU OBJETIVO
Você deve guiar o lead através de uma conversa natural para entender o momento dele e levá-lo à **Sessão de Diagnóstico** gratuita.

### REGRAS DE MEMÓRIA E CONTINUIDADE
- **Siga de onde parou:** Analise cuidadosamente o histórico para saber o que já foi perguntado e o que o lead já respondeu.
- **Evite Repetições:** Nunca repita saudações (como "Oi" ou "Tudo bem?") ou perguntas que você já fez anteriormente. Se você já se apresentou, não se apresente de novo.
- **Adaptação:** Se o lead responder algo fora do esperado, acolha o que ele disse e tente suavemente trazê-lo de volta para o fluxo de entendimento do momento dele.

### FASE 1 — ENTENDER O MOMENTO E AGENDAR (agendamento)
- Entenda se o lead já atua no mercado ou se está iniciando. 
- Após entender o momento, proponha a **Sessão de Diagnóstico** gratuita como o próximo passo natural.
- Se o lead aceitou a reunião: Sugira **exatamente duas opções de horário** na próxima semana (ex: Terça às 14h ou Quinta às 10h) baseadas na lista de horários disponíveis. 
- "action": "suggest" para sugerir horários.
- "action": "book" se o lead confirmou um horário exato.
- "action": "cancel" se o lead pediu para cancelar.

> [!CAUTION]
> USE APENAS HORÁRIOS DA LISTA ABAIXO. NUNCA INVENTE HORÁRIOS.

### FASE 2 — CONFIRMADO (confirmado)
- O lead já possui uma reunião agendada.
- Responda dúvidas de forma prestativa. Se ele precisar reagendar, aceite o cancelamento primeiro e depois ofereça novos horários.
`;

// ── Follow-up ─────────────────────────────────────────────────
const FOLLOWUP = `
## FOLLOW-UP

Se o lead não responder:
- Tom: leve, sem pressão, sem drama
- Exemplo: "Oi! Só passando pra ver se ficou alguma dúvida. Posso te ajudar com algo? 😊"
- Máximo 1 follow-up por janela de silêncio
`;

// ── Build System Prompt ──────────────────────────────────────
function buildSystemPrompt(state: AgentState, lead: Lead, availabilityStr: string, currentDate: string): string {
  const nomeInfo = lead.name
    ? `Nome do lead: ${lead.name}`
    : `Nome do lead: ainda não coletado.`;

  const resumo = lead.notes
    ? `\n## RESUMO DA CONVERSA ATÉ AGORA\n${lead.notes}\n`
    : '';

  return `${PERSONA}

${SERVICOS}

## CONTEXTO DO LEAD E SISTEMA
Hoje é: ${currentDate}
${nomeInfo}
Fase atual: ${state.phase}
Mensagens trocadas: ${state.follow_up_count}
${resumo}

## HORÁRIOS DISPONÍVEIS DO PROFISSIONAL (USE ESTES PARA SUGERIR)
${availabilityStr || "Nenhum horário disponível informado. Diga que vai conferir a agenda e retornar depois."}

${FLUXO}

${FOLLOWUP}

## CANCELAMENTOS
Se o lead pedir de forma clara para cancelar ou reagendar a reunião que já estava marcada:
1. Seja compreensivo e aceite o cancelamento.
2. Defina a ação "cancel" no seu JSON ("schedule": {"action": "cancel"}).
3. Sugira imediatamente novos horários com base na agenda disponível.

## CONTROLE DO PIPELINE (obrigatório)

| ID | Stage                   | Quando mover                                  |
|----|-------------------------|-----------------------------------------------|
| 1  | Primeiro contato        | Inicial                                       |
| 2  | Agendamento de reunião  | Quando você entrar no assunto de agendamento  |
| 3  | Reunião agendada        | Quando o lead confirmar que já agendou / marcar |
| 4  | Envio de proposta       | Quando você enviar ou falar sobre a proposta  |
| 5  | Ganho                   | Lead confirmou o fechamento/contratação       |
| 6  | Perdido                 | Lead desistiu ou pediu para não ser contatado |

## FORMATO DE RESPOSTA — RETORNE APENAS JSON:
{
  "reply": "mensagem para o lead",
  "phase": "agendamento|confirmado",
  "next_stage": 2,
  "score": 0,
  "notes": "Resumo objetivo sobre as dúvidas ou a intenção do lead.",
  "schedule": {
    "action": "none" | "suggest" | "book" | "cancel",
    "time": "YYYY-MM-DD HH:mm ou null"
  }
}

> [!IMPORTANT]
> Lembre-se: O campo "time" de agendamento deve seguir o padrão YYYY-MM-DD HH:mm. Se a data de hoje é 2026-03-30 e o lead escolheu Quarta às 10h, o time seria 2026-04-01 10:00.
`;
}

// ── Geração de resposta via Gemini ────────────────────────────
export async function generateAgentReply(
  history: { role: string; content: string }[],
  state: AgentState,
  lead: Lead & { notes?: string },
  availabilityStr: string = ""
): Promise<AgentResult> {
  // Use timezone de São Paulo para formatar a data que vai pro agente
  const now = new Date();
  const currentDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(now);
  
  const systemPrompt = buildSystemPrompt(state, lead, availabilityStr, currentDate);
  console.log(`[agent] Lead ${lead.id} | Phase: ${state.phase} | Msgs: ${state.follow_up_count}`);

  // Formata histórico para o OpenAI
  const messages: {role: string; content: string}[] = [];

  messages.push({
    role: 'system',
    content: systemPrompt
  });

  for (const msg of history) {
    messages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    });
  }

  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
  const endpoint = 'https://api.openai.com/v1/chat/completions';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 600
      }),
    });

    const data = await res.json();

    if (!data.choices || data.choices.length === 0) {
      console.error('[OpenAI Error]', JSON.stringify(data));
      throw new Error(`OpenAI Error: ${JSON.stringify(data)}`);
    }

    const rawText = data.choices[0].message.content ?? '{}';

    let parsed: Record<string, unknown>;
    try {
      let clean = rawText.replace(/(```json|```)/g, '').trim();
      // Extrai apenas o objeto JSON caso a IA envie texto solto junto
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
         clean = jsonMatch[0];
      }
      parsed = JSON.parse(clean);
    } catch {
      console.warn('[agent] Falha ao fazer parse do JSON bruto. Usando rawText inteiro como fallback.');
      parsed = { reply: rawText };
    }


    const score     = Number(parsed.score ?? 0);
    const phase     = String(parsed.phase ?? state.phase);
    const nextStage = (parsed.next_stage as number | null) ?? null;
    const notes     = String(parsed.notes ?? '');
    
    // OpenAI sometimes hallucinates the key name instead of "reply"
    const rawReplyValue = parsed.reply || parsed.resposta || parsed.mensagem || parsed.message || parsed.response || '';
    let finalReply = String(rawReplyValue).trim();
    
    // Se a IA devolver completamente vazio por algum outro erro, responde humano
    if (!finalReply) {
      finalReply = 'Deu um pequeno erro de comunicação aqui no meu sistema, mas já estou de volta! Pode me confirmar onde tínhamos parado?';
    }

    const schedule = parsed.schedule as ScheduleAction | undefined;

    return {
      reply:    finalReply,
      newPhase: phase,
      spinData: {},
      score,
      nextStage,
      notes,
      schedule,
    };
  } catch (error: any) {
    console.error('[generateAgentReply] Erro fatal:', error);
    const errMsg = error?.message ? String(error.message) : 'Erro desconhecido';
    return {
      reply:    `[🚨 Erro de IA: não consegui gerar a resposta. Verifique a chave de API da OpenAI. Detalhe: ${errMsg.substring(0, 60)}]`,
      newPhase: state.phase,
      spinData: {},
      score:    0,
      nextStage: null,
      notes:    lead.notes || '',
    };
  }
}
