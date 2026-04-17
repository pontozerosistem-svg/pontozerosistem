const { Client } = require('pg');

// Dados do seu banco de dados (Projeto Original)
const connectionString = 'postgresql://postgres:Peubotelho2026*@db.zyuldjccrpmvzlgdxmtk.supabase.co:5432/postgres';

const client = new Client({
  connectionString: connectionString,
});

async function testConnection() {
  console.log('🔌 Tentando conexão direta com o Postgres (Porta 5432)...');
  try {
    await client.connect();
    console.log('✅ SUCESSO! O seu banco de dados está online e respondendo.');
    
    const res = await client.query('SELECT count(*) FROM leads');
    console.log(`📊 Total de Leads no banco: ${res.rows[0].count}`);
    
    await client.end();
  } catch (err) {
    console.error('❌ FALHA na conexão direta:', err.message);
    console.log('\n--- DIAGNÓSTICO ---');
    console.log('1. Se o erro for "ENOTFOUND", seu computador não acha o endereço "db.zyuldjccrpmvzlgdxmtk.supabase.co".');
    console.log('2. Se o erro for "ETIMEDOUT", um firewall ou sua operadora está bloqueando a porta 5432.');
  }
}

testConnection();
