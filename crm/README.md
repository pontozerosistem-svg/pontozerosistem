# CRM — Seu Dinheiro na Mesa

Stack: **Supabase Edge Functions** + **OpenAI GPT-4o** + **Evolution API (WhatsApp)** + **React + Vite (Frontend)**

---

## Arquitetura

```
Landing Page ──POST──▶ webhook-lead (Edge Function)
                              │
                              ▼
                        Supabase DB ◀──▶ webhook-whatsapp (Edge Function)
                                                ▲
Evolution API ─────────────────────────────────┘
(mensagens recebidas do WhatsApp)

Frontend React ──▶ Supabase DB (leitura direta via anon key)
```

---

## Projeto Supabase

- **Project Ref**: `zyuldjccrpmvzlgdxmtk`
- **Região**: São Paulo (`sa-east-1`)
- **Dashboard**: https://supabase.com/dashboard/project/zyuldjccrpmvzlgdxmtk

### URLs das Edge Functions
| Função | URL |
|--------|-----|
| `webhook-lead` | `https://zyuldjccrpmvzlgdxmtk.supabase.co/functions/v1/webhook-lead` |
| `webhook-whatsapp` | `https://zyuldjccrpmvzlgdxmtk.supabase.co/functions/v1/webhook-whatsapp` |

---

## Configuração

### 1. Secrets no Supabase
https://supabase.com/dashboard/project/zyuldjccrpmvzlgdxmtk/settings/functions

```
OPENAI_API_KEY=sk-proj-...
EVOLUTION_API_URL=https://sua-evolution.com
EVOLUTION_API_KEY=sua-api-key
EVOLUTION_INSTANCE=nome-da-instancia
```

### 2. Evolution API — Webhook
- **URL**: `https://zyuldjccrpmvzlgdxmtk.supabase.co/functions/v1/webhook-whatsapp`
- **Evento**: `messages.upsert`

### 3. Landing Page — Endpoint
```
POST https://zyuldjccrpmvzlgdxmtk.supabase.co/functions/v1/webhook-lead
Content-Type: application/json

{ "nome_completo": "...", "telefone_whatsapp": "5511999999999", "canal_origem": "landing_page" }
```

---

## CRM Dashboard (Frontend)

```bash
cd frontend
npm install
npm run dev
# Acesse: http://localhost:5173/crm
```

---

## Pipeline de Vendas

| ID | Fase | Quando o agente move |
|----|------|----------------------|
| 1 | Novo Lead | Ao chegar da landing page |
| 2 | Primeiro Contato | Lead respondeu |
| 3 | Qualificação | Problema identificado |
| 4 | Apresentação | Urgência criada |
| 5 | Proposta Enviada | Preço apresentado |
| 6 | Negociação | Objeção levantada |
| 7 | Ganho 🏆 | Compra confirmada |
| 8 | Perdido ❌ | Recusou definitivamente |
