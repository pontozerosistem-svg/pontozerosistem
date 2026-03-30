const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://zyuldjccrpmvzlgdxmtk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5dWxkamNjcnBtdnpsZ2R4bXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTcxMTEsImV4cCI6MjA5MDE5MzExMX0.Zork4rU4pTMAa-2IFXeyzKLEsNP_xdna8VMS4DkDmP8'
);

async function main() {
  const { data, error } = await s.from('pipeline_stages').select('*').order('order_index');
  if (error) { console.error('ERROR:', error); return; }
  console.log('=== PIPELINE STAGES ===');
  data.forEach(st => {
    console.log(`ID: ${st.id} | order: ${st.order_index} | name: "${st.name}" | color: ${st.color}`);
  });
  console.log(`\nTotal: ${data.length} stages`);
}
main();
