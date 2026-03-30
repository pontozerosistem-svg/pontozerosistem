const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zyuldjccrpmvzlgdxmtk.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5dWxkamNjcnBtdnpsZ2R4bXRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MTcwODc1MCwiZXhwIjoyMDU3Mjg0NzUwfQ.R0JneMqVgOn-OJQkF6FJm__CiCv76xBOOdVRIWMbhVc';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function run() {
  console.log('--- Database Cleanup ---');
  
  // 1. Move leads from extra stages
  console.log('Moving leads from stage 9 to 5...');
  const { error: e1 } = await supabase.from('leads').update({ stage_id: 5 }).eq('stage_id', 9);
  if (e1) console.error('Error moving leads 9->5:', e1);

  console.log('Moving leads from stage 10 to 6...');
  const { error: e2 } = await supabase.from('leads').update({ stage_id: 6 }).eq('stage_id', 10);
  if (e2) console.error('Error moving leads 10->6:', e2);

  // 2. Delete extra stages
  console.log('Deleting stages 9 and 10...');
  const { error: e3 } = await supabase.from('pipeline_stages').delete().in('id', [9, 10]);
  if (e3) {
    console.error('Error deleting stages:', e3);
  } else {
    console.log('Stages deleted successfully.');
  }

  // 3. Verify final state
  const { data: stages } = await supabase.from('pipeline_stages').select('id, name').order('order_index');
  console.log('Final Stages:', stages);
}

run();
