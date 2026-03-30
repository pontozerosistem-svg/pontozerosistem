import urllib.request, json, re

with open('src/lib/supabase.ts', 'r', encoding='utf-8') as f:
    txt = f.read()

# Usa regex mais flexível para o VITE_SUPABASE_URL se existir
match_url = re.search(r"const supabaseUrl = [^']*(['\"])(https://[^'\"]+)\1", txt)
match_key = re.search(r"const supabaseAnonKey = [^']*(['\"])(eyJ[^'\"]+)\1", txt)

url = match_url.group(2) if match_url else None
key = match_key.group(2) if match_key else None

if not url or not key:
    print("Could not parse supabase URL or key.")
    exit(1)

headers = {
    'apikey': key,
    'Authorization': f'Bearer {key}'
}

# Busca os ultimos 2 leads pra ver a fase
req_leads = urllib.request.Request(f"{url}/rest/v1/leads?select=id,name,email,stage_id&order=created_at.desc&limit=2", headers=headers)
with urllib.request.urlopen(req_leads) as response:
    leads = json.loads(response.read().decode())
    print("--- ULTIMOS LEADS ---")
    for l in leads:
       print(f"Nome: {l.get('name')}, Email: {l.get('email')}, Stage: {l.get('stage_id')}, ID: {l['id']}")

# Busca as ultimas 5 conversas
req_conv = urllib.request.Request(f"{url}/rest/v1/conversations?select=role,content,created_at&order=created_at.desc&limit=5", headers=headers)
with urllib.request.urlopen(req_conv) as response:
    convs = json.loads(response.read().decode())
    print("--- ULTIMAS CONVERSAS ---")
    for c in convs:
       print(f"[{c['role']}] {c['content'][:100]}")
