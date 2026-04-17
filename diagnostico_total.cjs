const URL = 'https://zyuldjccrpmvzlgdxmtk.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5dWxkamNjcnBtdnpsZ2R4bXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTcxMTEsImV4cCI6MjA5MDE5MzExMX0.Zork4rU4pTMAa-2IFXeyzKLEsNP_xdna8VMS4DkDmP8';

async function diagnose() {
  console.log('🔍 Iniciando Diagnóstico de API...');
  
  const tables = ['pipeline_stages', 'leads', 'crm_leads_view'];
  
  for (const table of tables) {
    try {
      const response = await fetch(`${URL}/rest/v1/${table}?select=*`, {
        headers: {
          'apikey': KEY,
          'Authorization': `Bearer ${KEY}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        console.log(`✅ Tabela [${table}]: ${data.length} registros encontrados.`);
        if (data.length > 0) {
          console.log(`   Exemplo de ID: ${data[0].id || 'N/A'}`);
        }
      } else {
        console.error(`❌ Tabela [${table}]: Erro ${response.status} - ${JSON.stringify(data)}`);
      }
    } catch (e) {
      console.error(`❌ Erro ao conectar na tabela [${table}]:`, e.message);
    }
  }
}

diagnose();
