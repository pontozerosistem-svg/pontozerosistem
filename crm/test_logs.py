import urllib.request, json, re

with open('src/lib/supabase.ts', 'r', encoding='utf-8') as f:
    txt = f.read()

url = re.search(r"const supabaseUrl = ['\"](https://[^'\"]+)['\"]", txt).group(1)
key = re.search(r"const supabaseAnonKey = ['\"](eyJ[^'\"]+)['\"]", txt).group(1)

req = urllib.request.Request(f"{url}/rest/v1/conversations?select=role,content,lead_id&order=created_at.desc&limit=5", headers={
    'apikey': key,
    'Authorization': f'Bearer {key}'
})

with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode())
    print("--- CONVERSATIONS ---")
    for row in data:
       print(f"Role: {row['role']}, Lead: {row['lead_id']}")
       print(f"[{row['content']}]")
       print("-----")
