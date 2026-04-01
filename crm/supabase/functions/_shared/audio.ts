import { saveMessage } from './db.ts';

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const EVO_BASE   = Deno.env.get('EVOLUTION_API_URL') || '';
const EVO_KEY    = Deno.env.get('EVOLUTION_API_KEY') || '';
const EVO_INST   = Deno.env.get('EVOLUTION_INSTANCE') || '';
const LUIZA_ID   = '306215b6-2442-4ea2-aaff-d4c94a61639b';

/**
 * Obtém o Base64 do áudio a partir da Evolution API
 */
export async function getAudioBase64(messageId: string, phone: string): Promise<string | null> {
  try {
    const res = await fetch(`${EVO_BASE}/chat/getBase64FromMediaMessage/${EVO_INST}`, {
      method: 'POST',
      headers: {
        'apikey': EVO_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        message: { 
          key: {
            remoteJid: phone.includes('@') ? phone : `${phone}@s.whatsapp.net`,
            fromMe: false,
            id: messageId
          }
        } 
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[audio] Erro ao buscar Base64:', errText);
      await saveMessage(LUIZA_ID, 'assistant', `[ERROR] Evolution GetBase64: ${res.status} - ${errText}`);
      return null;
    }

    const data = await res.json();
    if (!data.base64) {
      await saveMessage(LUIZA_ID, 'assistant', `[ERROR] Evolution Base64 ausente no JSON: ${JSON.stringify(data)}`);
    }
    return data.base64 || null;
  } catch (err) {
    console.error('[audio] Erro na requisição de Base64:', err);
    await saveMessage(LUIZA_ID, 'assistant', `[ERROR] Request GetBase64: ${err.message}`);
    return null;
  }
}

/**
 * Transcreve o áudio usando OpenAI Whisper
 */
export async function transcribeAudio(base64WithHeader: string): Promise<string | null> {
  try {
    // Remove o header "data:audio/ogg;base64,"
    const base64 = base64WithHeader.split(',')[1] || base64WithHeader;
    
    // Converte Base64 para Blob para o FormData (O Whisper espera um arquivo)
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
    const blob = new Blob([array], { type: 'audio/ogg' });

    const formData = new FormData();
    formData.append('file', blob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: formData
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[whisper] Erro na transcrição:', errText);
      await saveMessage(LUIZA_ID, 'assistant', `[ERROR] Whisper: ${res.status} - ${errText}`);
      return null;
    }

    const data = await res.json();
    return data.text || null;
  } catch (err) {
    console.error('[whisper] Erro ao processar transcrição:', err);
    await saveMessage(LUIZA_ID, 'assistant', `[ERROR] Request Whisper: ${err.message}`);
    return null;
  }
}
