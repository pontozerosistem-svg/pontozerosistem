// ============================================================
// AGENTE PONTO ZERO v2 — Gemini 2.0 Flash
// Fluxo: Recepção → Entender Momento → Propor Reunião
// ============================================================

export interface AgentState {
  phase: string; // 'recepcao' | 'entender' | 'propor_reuniao' | 'confirmado'
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

### FASE 1 — RECEPÇÃO (recepcao)
Seja caloroso. Confirme o interesse, apresente brevemente a Ponto Zero e faça uma primeira pergunta para entender o momento do lead.
Exemplo: "Que bom que chegou até a Ponto Zero! Me conta um pouco — o que te trouxe até aqui?"

### FASE 2 — ENTENDER O MOMENTO (entender)
Faça 1 ou 2 perguntas simples e empáticas para entender:
- Em que momento profissional o lead está
- O que sente que falta ou não está funcionando no posicionamento atual
NÃO apresente soluções ainda. Apenas ouça e valide.

### FASE 3 — PROPOR A REUNIÃO (propor_reuniao)
Quando você entender o momento do lead, apresente a **Reunião de Descoberta Gratuita**.

Diga algo como:
"O que eu percebo é que você já tem muito a oferecer — só falta alinhamento e clareza. Para te ajudar de forma personalizada, o Peu oferece uma Reunião de Descoberta gratuita, online, onde ele vai entender seu momento com profundidade e mostrar qual caminho faz mais sentido pro seu posicionamento. [ENVIAR_LINK_AGENDAMENTO]"

> [!IMPORTANT]
> Quando estiver nesta fase, coloque a tag literal **[ENVIAR_LINK_AGENDAMENTO]** ao final da mensagem.
> O sistema vai substituir essa tag pelo link real do Google Calendar automaticamente.

### FASE 4 — CONFIRMADO (confirmado)
Após o lead demonstrar interesse em agendar, confirme com entusiasmo e reforce o valor da reunião.
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
| 3  | Qualificação       | Você entendeu o momento do lead        |
| 4  | Reunião Proposta   | Você propôs a Reunião de Descoberta    |
| 5  | Reunião Agendada   | Lead confirmou interesse em agendar    |
| 7  | Ganho 🏆           | Lead confirmou contratação             |
| 8  | Perdido ❌         | Lead pediu para parar                  |

## FORMATO DE RESPOSTA — RETORNE APENAS JSON:
{
  "reply": "mensagem para o lead",
  "phase": "recepcao|entender|propor_reuniao|confirmado",
  "next_stage": 2,
  "score": 0,
  "notes": "Resumo objetivo do momento do lead. Atualize a cada mensagem."
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

  // Formata histórico para o Gemini (user/model alternados)
  const contents: {role: string; parts: {text: string}[]}[] = [];

  // Injeta o system prompt como primeira mensagem do usuário (workaround para Gemini)
  contents.push({
    role: 'user',
    parts: [{ text: `INSTRUÇÕES DO SISTEMA:\n${systemPrompt}` }]
  });
  contents.push({
    role: 'model',
    parts: [{ text: 'Entendido. Vou seguir as instruções e responder em JSON.' }]
  });

  // Adiciona o histórico de conversa
  for (const msg of history) {
    const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
    contents.push({
      role: geminiRole,
      parts: [{ text: msg.content }]
    });
  }

  // Garante que a última mensagem seja do usuário
  if (contents[contents.length - 1].role === 'model') {
    contents.push({
      role: 'user',
      parts: [{ text: 'Continue a conversa seguindo as instruções e retorne apenas JSON.' }]
    });
  }

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 600,
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = await res.json();

    if (!data.candidates || data.candidates.length === 0) {
      console.error('[Gemini Error]', JSON.stringify(data));
      throw new Error(`Gemini Error: ${JSON.stringify(data)}`);
    }

    const rawText = data.candidates[0].content.parts[0].text ?? '{}';

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

    return {
      reply:    String(parsed.reply ?? ''),
      newPhase: phase,
      spinData: {},
      score,
      nextStage,
      notes,
    };
  } catch (error: any) {
    console.error('[generateAgentReply] Erro fatal:', error);
    return {
      reply:    `[Erro de IA: ${error.message.substring(0, 100)}...]`,
      newPhase: state.phase,
      spinData: {},
      score:    0,
      nextStage: null,
      notes:    lead.notes || '',
    };
  }
}
