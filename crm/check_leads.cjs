
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://zyuldjccrpmvzlgdxmtk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5dWxkamNjcnBtdnpsZ2R4bXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTcxMTEsImV4cCI6MjA5MDE5MzExMX0.Zork4rU4pTMAa-2IFXeyzKLEsNP_xdna8VMS4DkDmP8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStages() {
  const { data: stages, error } = await supabase.from('pipeline_stages').select('*').order('id');
  if (error) {
     console.error('Error fetching stages:', error);
     return;
  }
  console.log('--- Pipeline Stages ---');
  console.table(stages);

  const { data: leads, error: leadsError } = await supabase
    .from('crm_leads_view')
    .select('id, name, stage_name, stage_id, last_message_at, follow_up_count')
    .in('stage_id', [1, 2])
    .limit(10);
  
  if (leadsError) {
    console.error('Error fetching leads:', leadsError);
    return;
  }
  console.log('--- Leads in Stages 1 & 2 ---');
  console.table(leads);
}

checkStages();
