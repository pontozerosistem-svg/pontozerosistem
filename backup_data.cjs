const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// CONFIGURAÇÃO DO PROJETO ANTIGO (INSALUBRE)
const OLD_URL = 'https://zyuldjccrpmvzlgdxmtk.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5dWxkamNjcnBtdnpsZ2R4bXRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczODE0MzcwMywiZXhwIjoyMDUzNzE5NzAzfQ.A5L6081R_Z04-Tq1i8jY3f7i7i7i7i7i7i7i7i7i7i7'; // Chave truncada por segurança no exemplo, mas usarei a completa

const supabase = createClient(OLD_URL, OLD_KEY);

const TABLES = [
  'pipeline_stages',
  'leads',
  'conversations',
  'activities',
  'agent_state',
  'meetings',
  'scheduling_settings',
  'professional_availability'
];

async function backup() {
  console.log('🚀 Iniciando backup do projeto antigo...');
  const fullBackup = {};

  for (const table of TABLES) {
    console.log(`- Baixando dados da tabela: ${table}...`);
    const { data, error } = await supabase.from(table).select('*');
    
    if (error) {
      console.error(`❌ Erro ao baixar ${table}:`, error.message);
      fullBackup[table] = [];
    } else {
      console.log(`✅ ${data.length} registros encontrados.`);
      fullBackup[table] = data;
    }
  }

  const filename = path.join(__dirname, 'supabase_backup.json');
  fs.writeFileSync(filename, JSON.stringify(fullBackup, null, 2));
  
  console.log('\n=========================================');
  console.log('🎉 BACKUP CONCLUÍDO COM SUCESSO!');
  console.log(`Arquivo salvo: ${filename}`);
  console.log('=========================================');
}

backup();
