const fs = require('fs');

async function run() {
  const txt = fs.readFileSync('src/lib/supabase.ts', 'utf8');
  const url = txt.match(/const supabaseUrl = ['"](https:\/\/[^'"]+)['"]/)[1];
  const key = txt.match(/const supabaseAnonKey = ['"](eyJ[^'"]+)['"]/)[1];
    
  const headers = { apikey: key, Authorization: 'Bearer ' + key };
  
  const [stagesRes, leadsRes] = await Promise.all([
    fetch(url + '/rest/v1/pipeline_stages?select=*', {headers}),
    fetch(url + '/rest/v1/leads?select=*&order=created_at.desc&limit=1', {headers})
  ]);
  
  const stages = await stagesRes.json();
  const leads = await leadsRes.json();
  
  console.log('STAGES:');
  console.table(stages);
  console.log('LATEST LEAD:');
  console.log(JSON.stringify(leads, null, 2));
}

run().catch(console.error);
