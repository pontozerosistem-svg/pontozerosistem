const BASE     = Deno.env.get('EVOLUTION_API_URL') || '';
const API_KEY  = Deno.env.get('EVOLUTION_API_KEY') || '';
const INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') || '';

export async function sendWhatsApp(phone: string, text: string, overrideInstance?: string) {
  const targetInstance = overrideInstance || INSTANCE;
  const res = await fetch(`${BASE}/message/sendText/${targetInstance}`, {
    method: 'POST',
    headers: {
      'apikey': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      number: phone.includes('@') ? phone.split('@')[0] : phone, 
      text,
      delay: 1200,
      linkPreview: true
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[evolution] falha ao enviar:', JSON.stringify(data));
  }
  
  return data?.key?.remoteJid || null;
}
