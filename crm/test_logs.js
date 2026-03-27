const fs = require('fs');
const txt = fs.readFileSync('src/lib/supabase.ts', 'utf8');
const url = txt.match(/const supabaseUrl = ['\"](https:\/\/[^'\"]+)['\"]/)[1];
const key = txt.match(/const supabaseAnonKey = ['\"](eyJ[^'\"]+)['\"]/)[1];
const headers = { apikey: key, Authorization: 'Bearer ' + key };

async function run() {
  const r1 = await fetch(url + '/rest/v1/leads?select=id,name,phone,source&order=created_at.desc&limit=5', {headers});
  console.log('Leads:', JSON.stringify(await r1.json(), null, 2));
  
  const r2 = await fetch(url + '/rest/v1/conversations?select=role,content,lead_id&order=created_at.desc&limit=4', {headers});
  console.log('Conv:', JSON.stringify(await r2.json(), null, 2));
}
run();
