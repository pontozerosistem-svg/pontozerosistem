import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Send, Bot, User, RefreshCw, MessageSquare, ShieldCheck, TrendingUp } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AgentResult {
  reply: string
  newPhase: string
  score: number
  notes: string
  nextStage: number | null
  schedule?: {
    action: string
    time?: string
  }
}

export default function AgentPlayground() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [state, setState] = useState({
    phase: 'agendamento',
    follow_up_count: 0
  })
  const [lastResult, setLastResult] = useState<AgentResult | null>(null)
  
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMsg: Message = { role: 'user', content: input }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('test-agent', {
        body: {
          history: newMessages,
          state: { ...state, follow_up_count: state.follow_up_count + 1 },
          lead: { id: 'test-lead', name: 'Lead de Teste', phone: '5511999999999' }
        }
      })

      if (error) throw error

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      setLastResult(data)
      setState({
        phase: data.newPhase,
        follow_up_count: state.follow_up_count + 1
      })
    } catch (err: any) {
      alert('Erro ao testar agente: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function resetChat() {
    setMessages([])
    setState({ phase: 'agendamento', follow_up_count: 0 })
    setLastResult(null)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, height: 'calc(100vh - 240px)', minHeight: 500 }}>
      {/* Chat Area */}
      <div className="card glass" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--purple-dim)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
              <Bot size={18} color="var(--purple)" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>Simulador da Luiza</h3>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Teste o tom e fluxo sem enviar WhatsApp</p>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={resetChat} title="Resetar Conversa">
            <RefreshCw size={16} />
          </button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <MessageSquare size={40} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
              <p style={{ fontSize: 14 }}>Inicie uma conversa para treinar o agente.</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>Diga um "Oi" ou responda como se fosse um lead.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ 
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}>
              <div style={{ 
                padding: '12px 16px',
                borderRadius: 16,
                fontSize: 14,
                lineHeight: 1.5,
                background: m.role === 'user' ? 'var(--blue-dim)' : 'var(--bg-elevated)',
                border: `1px solid ${m.role === 'user' ? 'rgba(59,130,246,0.2)' : 'var(--border)'}`,
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap'
              }}>
                {m.content}
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: m.role === 'user' ? 'right' : 'left', padding: '0 4px' }}>
                {m.role === 'user' ? 'Você (Lead)' : 'Luiza (IA)'}
              </span>
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: 'flex-start', background: 'var(--bg-elevated)', padding: '12px 16px', borderRadius: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
              <RefreshCw size={14} className="spinning" />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pensando...</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} style={{ padding: 20, borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
          <input 
            className="input" 
            placeholder="Digite como se fosse o lead..." 
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>
            <Send size={18} />
          </button>
        </form>
      </div>

      {/* Analysis Sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card glass" style={{ padding: 20 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={14} /> ESTADO INTERNO
          </h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fase da Conversa</label>
              <div style={{ background: 'var(--bg-base)', padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, color: 'var(--purple)' }}>
                {state.phase}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Mensagens</label>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{state.follow_up_count}</div>
            </div>
          </div>
        </div>

        {lastResult && (
          <div className="card glass" style={{ padding: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={14} /> ANÁLISE DA RESPOSTA
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Score SPIN (0-100)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                   <div style={{ flex: 1, height: 6, background: 'var(--bg-base)', borderRadius: 3 }}>
                     <div style={{ width: `${lastResult.score}%`, height: '100%', background: 'var(--green)', borderRadius: 3 }} />
                   </div>
                   <span style={{ fontSize: 12, fontWeight: 700 }}>{lastResult.score}</span>
                </div>
              </div>
              
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Ação de Agenda</label>
                <div style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, background: lastResult.schedule?.action !== 'none' ? 'var(--blue-dim)' : 'var(--bg-base)', color: lastResult.schedule?.action !== 'none' ? 'var(--blue)' : 'inherit', display: 'inline-block' }}>
                  {lastResult.schedule?.action || 'none'}
                  {lastResult.schedule?.time && <span style={{ marginLeft: 6, opacity: 0.7 }}>({lastResult.schedule.time})</span>}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas/Resumo</label>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.4 }}>
                  "{lastResult.notes || 'Sem observações.'}"
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
