import { useMemo } from 'react'
import { TrendingUp, Users, Trophy, XCircle, MessageCircle } from 'lucide-react'
import type { Lead } from '../lib/supabase'

interface Props { leads: Lead[] }

export default function KpiHeader({ leads }: Props) {
  const stats = useMemo(() => {
    const total = leads.length
    const ganhos = leads.filter(l => l.stage_id === 7).length
    const perdidos = leads.filter(l => l.stage_id === 8).length
    const ativos = leads.filter(l => l.stage_id >= 2 && l.stage_id <= 6).length
    const avgScore = total > 0
      ? Math.round(leads.reduce((acc, l) => acc + (l.score || 0), 0) / total)
      : 0
    return { total, ganhos, perdidos, ativos, avgScore }
  }, [leads])

  const kpis = [
    { label: 'Total de Leads', value: stats.total, icon: Users, color: 'var(--blue)', bg: 'var(--blue-dim)' },
    { label: 'Em Negociação', value: stats.ativos, icon: TrendingUp, color: 'var(--purple)', bg: 'var(--purple-dim)' },
    { label: 'Ganhos 🏆', value: stats.ganhos, icon: Trophy, color: 'var(--green)', bg: 'var(--green-dim)' },
    { label: 'Perdidos', value: stats.perdidos, icon: XCircle, color: 'var(--red)', bg: 'rgba(239,68,68,0.12)' },
    { label: 'Score Médio', value: `${stats.avgScore}`, icon: MessageCircle, color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)' },
  ]

  return (
    <div className="kpi-grid">
      {kpis.map(kpi => (
        <div key={kpi.label} className="kpi-card glass animate-fade">
          <div className="kpi-icon" style={{ background: kpi.bg }}>
            <kpi.icon size={18} color={kpi.color} />
          </div>
          <div>
            <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="kpi-label">{kpi.label}</div>
          </div>
        </div>
      ))}

      <style>{`
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
          padding: 0 20px;
        }
        @media(max-width: 1200px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
        @media(max-width: 700px)  { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
        .kpi-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 20px;
          border-radius: var(--radius-md);
          transition: var(--transition);
        }
        .kpi-card:hover { border-color: var(--border-bright); transform: translateY(-2px); }
        .kpi-icon {
          width: 40px; height: 40px;
          border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .kpi-value { font-size: 22px; font-weight: 800; line-height: 1; }
        .kpi-label { font-size: 11px; color: var(--text-muted); margin-top: 3px; font-weight: 500; }
      `}</style>
    </div>
  )
}
