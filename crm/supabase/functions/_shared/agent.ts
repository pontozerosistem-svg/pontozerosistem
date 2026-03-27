// ============================================================
// AGENTE PONTO ZERO v2 — Gemini 2.0 Flash
// Fluxo: Recepção → Entender Momento → Propor Reunião
// ============================================================

export interface AgentState {
  phase: string; // 'agendamento' | 'confirmado'
  follow_up_count: number;
  spin_data: Record<string, unknown>; // mantido por compatibilidade
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
## SEU FLUXO CONVERSACIONAL — SIGA NESTA ORDEM

O chumbo (Lead) acabou de receber uma mensagem automática pelo WhatsApp dizendo: "Podemos agendar a sua [Sessão de Diagnóstico]?"

### FASE 1 — AGENDAMENTO (agendamento)
Seu objetivo é fechar o agendamento dessa Sessão de Diagnóstico gratuita.
- Se o lead aceitou (ex: "Sim", "Podemos", "Quero agendar"): Diga algo com entusiasmo e envie o link para ele escolher o horário.
Exemplo: "Perfeito! Fico feliz com a sua decisão. Escolha o melhor horário na agenda do Peu por aqui: [ENVIAR_LINK_AGENDAMENTO]"

- Se o lead fizer alguma pergunta sobre o processo ou o que é essa reunião: Seja objetivo, humano e reforce que a Reunião de Diagnóstico serve justamente para isso, sem nenhum compromisso.

> [!IMPORTANT]
> Quando o lead aceitar o agendamento, coloque DE FORMA EXATA a tag literal **[ENVIAR_LINK_AGENDAMENTO]** ao final da sua mensagem.

### FASE 2 — CONFIRMADO (confirmado)
Após o lead já ter recebido o link de agendamento em mensagens anteriores, se ele mandar mais alguma dúvida, responda de forma prestativa, mas não mande o link novamente a menos que ele peça.
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
function buildSystemPrompt(state: AgentState, lead: Lead): string {
  const nomeInfo = lead.name
    ? `Nome do lead: ${lead.name}`
    : `Nome do lead: ainda não coletado.`;

  const resumo = lead.notes
    ? `\n## RESUMO DA CONVERSA ATÉ AGORA\n${lead.notes}\n`
    : '';

  return `${PERSONA}

${SERVICOS}

## CONTEXTO DO LEAD
${nomeInfo}
Fase atual: ${state.phase}
Mensagens trocadas: ${state.follow_up_count}
${resumo}

${FLUXO}

${FOLLOWUP}

## CONTROLE DO PIPELINE (obrigatório)

| ID | Stage              | Quando mover                            |
|----|--------------------|-----------------------------------------|
| 1  | Novo Lead          | Inicial                                 |
| 2  | Primeiro Contato   | Lead respondeu pela primeira vez        |
| 3  | Qualificação       | Você respondeu à dúvida do lead        |
| 4  | Reunião Proposta   | Você enviou o link de agendamento      |
| 5  | Reunião Agendada   | Lead confirmou que já agendou          |
| 7  | Ganho 🏆           | Lead confirmou contratação             |
| 8  | Perdido ❌         | Lead pediu para parar                  |

## FORMATO DE RESPOSTA — RETORNE APENAS JSON:
{
  "reply": "mensagem para o lead",
  "phase": "agendamento|confirmado",
  "next_stage": 2,
  "score": 0,
  "notes": "Resumo objetivo sobre as dúvidas ou a intenção do lead."
}`;
}

// ── Geração de resposta via Gemini ────────────────────────────
export async function generateAgentReply(
  history: { role: string; content: string }[],
  state: AgentState,
  lead: Lead & { notes?: string }
): Promise<AgentResult> {
  const systemPrompt = buildSystemPrompt(state, lead);
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
        max_tokens: 600,
        response_format: { type: "json_object" }
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
      const clean = rawText.replace(/(```json|```)/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = { reply: rawText };
    }

    const score     = Number(parsed.score ?? 0);
    const phase     = String(parsed.phase ?? state.phase);
    const nextStage = (parsed.next_stage as number | null) ?? null;
    const notes     = String(parsed.notes ?? '');
    
    let finalReply = String(parsed.reply ?? '').trim();
    if (!finalReply) {
      finalReply = 'Perfeito! Fico feliz com a sua decisão. Escolha o melhor horário na agenda do Peu por aqui: [ENVIAR_LINK_AGENDAMENTO]';
    }

    return {
      reply:    finalReply,
      newPhase: phase,
      spinData: {},
      score,
      nextStage,
      notes,
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
