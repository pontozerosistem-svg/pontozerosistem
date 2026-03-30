
const projectRef = 'zyuldjccrpmvzlgdxmtk';
const accessToken = 'sbp_3e4699c858cc06c35937d67f8adcf65cbe91db35';

async function run() {
  console.log('--- Cleaning up database stages ---');
  
  const query = `
    -- 1. Move leads from extra stages to canonical ones
    UPDATE leads SET stage_id = 5 WHERE stage_id = 9;
    UPDATE leads SET stage_id = 6 WHERE stage_id = 10;
    
    -- 2. Delete extra stages
    DELETE FROM pipeline_stages WHERE id IN (9, 10);
    
    -- 3. Verify
    SELECT id, name FROM pipeline_stages ORDER BY order_index;
  `;

  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    console.log('API Response:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
        console.log('Cleanup successful!');
    } else {
        console.error('Cleanup failed.');
    }
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

run();
