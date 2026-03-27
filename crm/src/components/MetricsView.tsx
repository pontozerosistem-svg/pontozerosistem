import { useMemo } from 'react'
import { Users, CheckCircle, Clock, TrendingUp, Zap } from 'lucide-react'
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  BarChart, Bar, Cell 
} from 'recharts'
import type { Lead } from '../lib/supabase'

interface MetricsViewProps {
  leads: Lead[]
}

const STAGES_NAMES: Record<number, string> = {
  1: 'Novo', 2: 'Contato', 3: 'Qualif.', 4: 'Apres.',
  5: 'Prop.', 6: 'Negoc.', 7: 'Ganho', 8: 'Perdido',
}

const STAGES_COLORS: Record<number, string> = {
  1: '#94a3b8', 2: '#3b82f6', 3: '#f59e0b', 4: '#8758ff',
  5: '#ec4899', 6: '#f97316', 7: '#22c55e', 8: '#ef4444',
}

export default function MetricsView({ leads }: MetricsViewProps) {
  const { stats, funnelData, timeData } = useMemo(() => {
    // 1. Basic Stats
    const total = leads.length
    const qualified = leads.filter(l => l.stage_id >= 3).length
    const sales = leads.filter(l => l.stage_id === 7).length
    const hotLeads = leads.filter(l => (l.score || 0) >= 80).length
    
    // Fora do horário comercial (Seg-Sex 08:00 - 18:00) + Finais de Semana
    const offHours = leads.filter(l => {
      const date = new Date(l.created_at)
      const hour = date.getUTCHours() - 3 // Brasília
      const localHour = hour < 0 ? hour + 24 : hour
      const day = date.getDay() // 0 = Domingo, 6 = Sábado
      
      const isWeekend = day === 0 || day === 6
      const isOutsideHours = localHour < 8 || localHour >= 18
      
      return isWeekend || isOutsideHours
    }).length

    const conversionRate = total > 0 ? ((sales / total) * 100).toFixed(1) : '0'

    // 2. Funnel Data (Leads by Stage)
    const funnel = [1, 2, 3, 4, 5, 6, 7].map(stageId => ({
      name: STAGES_NAMES[stageId],
      value: leads.filter(l => l.stage_id === stageId).length,
      color: STAGES_COLORS[stageId],
      stageId
    }))

    // 3. Time Data (Last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - i)
      return d.toISOString().split('T')[0]
    }).reverse()

    const timeSeries = last7Days.map(date => ({
      date: new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      count: leads.filter(l => l.created_at.startsWith(date)).length
    }))

    return {
      stats: [
        { label: 'Total de Leads', value: total, icon: Users, color: 'var(--blue)', bg: 'var(--blue-dim)', trend: '+12% este mês' },
        { label: 'Atendimentos Feitos', value: qualified, icon: CheckCircle, color: 'var(--green)', bg: 'var(--green-dim)', trend: 'Taxa de qualificação' },
        { label: 'Fora do Horário', value: offHours, icon: Clock, color: 'var(--orange)', bg: 'var(--orange-dim)', trend: 'Conversão pós-horário' },
        { label: 'Leads Quentes', value: hotLeads, icon: Zap, color: 'var(--purple)', bg: 'var(--purple-dim)', trend: 'Score > 80' },
        { label: 'Taxa de Conversão', value: `${conversionRate}%`, icon: TrendingUp, color: 'var(--pink)', bg: 'var(--pink-dim)', trend: 'Meta: 5%' }
      ],
      funnelData: funnel,
      timeData: timeSeries
    }
  }, [leads])

  return (
    <div className="metrics-page animate-fade">
      <div className="metrics-grid">
        {stats.map((s, i) => (
          <div key={i} className="metric-card shadow-lg">
            <div className="metric-card-header">
              <div className="metric-icon-wrap" style={{ backgroundColor: s.bg }}>
                <s.icon size={20} color={s.color} />
              </div>
              <div className="trend-up" style={{ fontSize: '11px', fontWeight: 600 }}>{s.trend}</div>
            </div>
            <div className="metric-value">{s.value}</div>
            <div className="metric-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="charts-row">
        {/* Lead Evolution Chart */}
        <div className="chart-card shadow-lg animate-fade" style={{ animationDelay: '0.1s' }}>
          <h3 className="chart-title">Evolução de Novos Leads</h3>
          <div style={{ flex: 1, width: '100%', minHeight: '280px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="var(--accent)" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorCount)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Funnel Distribution Chart */}
        <div className="chart-card shadow-lg animate-fade" style={{ animationDelay: '0.2s' }}>
          <h3 className="chart-title">Distribuição por Estágio</h3>
          <div style={{ flex: 1, width: '100%', minHeight: '280px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={32}>
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p className="tooltip-label">{label}</p>
        <p className="tooltip-value">{payload[0].value} leads</p>
      </div>
    )
  }
  return null
}
