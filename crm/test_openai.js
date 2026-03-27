const systemPrompt = `
## QUEM VOCÊ É
Você é o assistente digital de Peu Botelho, fundador da Ponto Zero...
(Mock)
## FORMATO DE RESPOSTA — RETORNE APENAS JSON:
{
  "reply": "mensagem para o lead",
  "phase": "agendamento|confirmado",
  "next_stage": 2,
  "score": 0,
  "notes": "Resumo objetivo sobre as dúvidas."
}`;

async function run() {
  const OPENAI_API_KEY = process.env.OPENAPI_KEY || 'sk-proj-mock'; // Will be replaced by real
  
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ` + process.env.OPENAI_KEY
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'assistant', content: 'Podemos agendar a sua?' },
        { role: 'user', content: 'podemos sim' }
      ],
      temperature: 0.7,
      max_tokens: 600,
      response_format: { type: "json_object" }
    }),
  });
  
  console.log(await res.json());
}
run();
