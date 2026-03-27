import { useState } from 'react'
import { MessageCircle, Phone, Clock, ChevronRight } from 'lucide-react'
import type { Lead } from '../lib/supabase'

interface Props {
  lead: Lead
  onClick: (lead: Lead) => void
  onStageChange: (leadId: string, stageId: number) => void
}

const SPIN_LABELS: Record<string, { label: string; color: string }> = {
  situacao:   { label: 'Situação',  color: 'var(--blue)' },
  problema:   { label: 'Problema',  color: 'var(--amber)' },
  implicacao: { label: 'Implicação',color: 'var(--orange)' },
  necessidade:{ label: 'Necessidade',color:'var(--purple)' },
  fechamento: { label: 'Fechamento',color: 'var(--green)' },
}

function scoreColor(score: number) {
  if (score >= 86) return 'var(--green)'
  if (score >= 61) return 'var(--orange)'
  if (score >= 31) return 'var(--amber)'
  return 'var(--text-muted)'
}

function timeAgo(iso?: string) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m atrás`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h atrás`
  return `${Math.floor(hrs / 24)}d atrás`
}

export default function LeadCard({ lead, onClick }: Props) {
  const [dragging, setDragging] = useState(false)
  const spin = lead.spin_phase ? SPIN_LABELS[lead.spin_phase] : null

  return (
    <div
      className={`lead-card glass ${dragging ? 'dragging' : ''}`}
      onClick={() => onClick(lead)}
      draggable
      onDragStart={(e) => {
        setDragging(true)
        e.dataTransfer.setData('leadId', lead.id)
      }}
      onDragEnd={() => setDragging(false)}
    >
      {/* Header */}
      <div className="lc-header">
        <div className="lc-avatar" style={{ background: `${lead.stage_color || '#6366f1'}20`, border: `1px solid ${lead.stage_color || '#6366f1'}40` }}>
          {(lead.name || lead.phone)?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="lc-info">
          <div className="lc-name">{lead.name || 'Sem nome'}</div>
          <div className="lc-phone">
            <Phone size={10} />
            {lead.phone}
          </div>
        </div>
        <ChevronRight size={14} color="var(--text-muted)" />
      </div>

      {/* Score bar */}
      <div className="lc-score-row">
        <span className="lc-score-label">Score</span>
        <div className="lc-score-bar">
          <div
            className="lc-score-fill"
            style={{ width: `${lead.score || 0}%`, background: scoreColor(lead.score || 0) }}
          />
        </div>
        <span className="lc-score-number" style={{ color: scoreColor(lead.score || 0) }}>
          {lead.score || 0}
        </span>
      </div>

      {/* Footer */}
      <div className="lc-footer">
        <div className="lc-meta">
          {lead.message_count != null && (
            <span className="lc-chip">
              <MessageCircle size={10} />
              {lead.message_count}
            </span>
          )}
          {lead.last_message_at && (
            <span className="lc-chip">
              <Clock size={10} />
              {timeAgo(lead.last_message_at)}
            </span>
          )}
        </div>
        {spin && (
          <span className="badge" style={{ background: `${spin.color}20`, color: spin.color }}>
            {spin.label}
          </span>
        )}
      </div>

      <style>{`
        .lead-card {
          padding: 14px;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: var(--transition);
          user-select: none;
        }
        .lead-card:hover { border-color: var(--border-bright); transform: translateY(-2px); box-shadow: var(--shadow); }
        .lead-card.dragging { opacity: 0.5; transform: rotate(2deg); }
        .lc-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .lc-avatar {
          width: 34px; height: 34px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 700; flex-shrink: 0;
          color: var(--text-primary);
        }
        .lc-info { flex: 1; min-width: 0; }
        .lc-name { font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lc-phone { font-size: 10px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; margin-top: 2px; }
        .lc-score-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .lc-score-label { font-size: 10px; color: var(--text-muted); width: 32px; }
        .lc-score-bar { flex: 1; height: 4px; background: var(--bg-hover); border-radius: 99px; overflow: hidden; }
        .lc-score-fill { height: 100%; border-radius: 99px; transition: width 0.4s ease; }
        .lc-score-number { font-size: 11px; font-weight: 700; width: 24px; text-align: right; }
        .lc-footer { display: flex; align-items: center; justify-content: space-between; }
        .lc-meta { display: flex; gap: 6px; }
        .lc-chip { display: flex; align-items: center; gap: 3px; font-size: 10px; color: var(--text-muted); }
      `}</style>
    </div>
  )
}
