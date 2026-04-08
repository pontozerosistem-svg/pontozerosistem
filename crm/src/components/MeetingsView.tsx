import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Video, Calendar, Clock, User, RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

interface Meeting {
  id: string
  lead_id: string
  scheduled_at: string | null
  status: string
  meet_link: string | null
  reminder_sent: boolean
  feedback_sent: boolean
  proposal_reminder_sent: boolean
  created_at: string
  leads?: {
    name: string | null
    phone: string | null
  }
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  scheduled: { label: 'Agendado', color: '#3b82f6', icon: <Calendar size={13} /> },
  completed: { label: 'Concluído', color: '#22c55e', icon: <CheckCircle size={13} /> },
  cancelled: { label: 'Cancelado', color: '#ef4444', icon: <XCircle size={13} /> },
  proposed:  { label: 'Link Enviado', color: '#f59e0b', icon: <AlertCircle size={13} /> },
}

export default function MeetingsView() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming')

  useEffect(() => {
    loadMeetings()
  }, [])

  async function loadMeetings() {
    setLoading(true)
    const { data, error } = await supabase
      .from('meetings')
      .select('*, leads(name, phone)')
      .order('scheduled_at', { ascending: false })

    if (!error && data) setMeetings(data as Meeting[])
    setLoading(false)
  }

  async function handleCancel(id: string) {
    if (!confirm('Cancelar esta reunião?')) return
    await supabase.from('meetings').update({ status: 'cancelled' }).eq('id', id)
    setMeetings(prev => prev.map(m => m.id === id ? { ...m, status: 'cancelled' } : m))
  }

  async function handleMarkComplete(id: string) {
    await supabase.from('meetings').update({ status: 'completed' }).eq('id', id)
    setMeetings(prev => prev.map(m => m.id === id ? { ...m, status: 'completed' } : m))
  }

  const now = new Date()

  const filtered = meetings.filter(m => {
    if (filter === 'all') return true
    if (!m.scheduled_at) return false
    const t = new Date(m.scheduled_at)
    return filter === 'upcoming' ? t >= now : t < now
  })

  function formatDateTime(iso: string | null) {
    if (!iso) return '—'
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(iso))
  }

  function isUpcoming(iso: string | null) {
    if (!iso) return false
    return new Date(iso) > now
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--text-muted)' }}>
        <RefreshCw size={20} className="spinning" style={{ marginRight: 8 }} />
        Carregando reuniões...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Reuniões Agendadas</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{filtered.length} reunião(ões) encontrada(s)</p>
        </div>
        <button className="btn btn-ghost" onClick={loadMeetings}>
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {([['upcoming', 'Próximas'], ['past', 'Passadas'], ['all', 'Todas']] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`btn ${filter === val ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 13, padding: '6px 14px' }}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Calendar size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p>Nenhuma reunião encontrada para este filtro.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(meeting => {
            const statusCfg = STATUS_CONFIG[meeting.status] || STATUS_CONFIG.proposed
            const upcoming = isUpcoming(meeting.scheduled_at)
            return (
              <div
                key={meeting.id}
                className="card glass"
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  borderLeft: `3px solid ${statusCfg.color}`,
                }}
              >
                {/* Lead Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <User size={15} color="var(--text-muted)" />
                    <span style={{ fontWeight: 600, fontSize: 15 }}>
                      {meeting.leads?.name || 'Lead sem nome'}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        background: statusCfg.color + '22',
                        color: statusCfg.color,
                        border: `1px solid ${statusCfg.color}44`,
                        borderRadius: 20,
                        padding: '2px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {statusCfg.icon}{statusCfg.label}
                    </span>
                    {upcoming && meeting.status === 'scheduled' && (
                      <span style={{ fontSize: 11, background: '#3b82f611', color: '#3b82f6', border: '1px solid #3b82f622', borderRadius: 20, padding: '2px 8px' }}>
                        Em breve
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={13} />
                      {formatDateTime(meeting.scheduled_at)}
                    </span>
                    {meeting.leads?.phone && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        📱 {meeting.leads.phone.replace('@s.whatsapp.net', '')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Notification flags */}
                <div style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                  {meeting.reminder_sent && (
                    <span title="Lembrete 30min enviado" style={{ background: '#22c55e22', color: '#22c55e', padding: '2px 6px', borderRadius: 4 }}>⏰ Lembrete</span>
                  )}
                  {meeting.feedback_sent && (
                    <span title="Feedback 15min pós-reunião enviado" style={{ background: '#8b5cf622', color: '#8b5cf6', padding: '2px 6px', borderRadius: 4 }}>📋 Feedback</span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {meeting.meet_link && (
                    <a
                      href={meeting.meet_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                      style={{ fontSize: 13, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Video size={14} />
                      Entrar
                    </a>
                  )}
                  {meeting.status === 'scheduled' && upcoming && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 13, padding: '6px 12px' }}
                      onClick={() => handleMarkComplete(meeting.id)}
                    >
                      ✓ Concluir
                    </button>
                  )}
                  {meeting.status === 'scheduled' && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 13, padding: '6px 12px', color: '#ef4444' }}
                      onClick={() => handleCancel(meeting.id)}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
