import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, Zap, LayoutDashboard, Columns, Plus, Settings, CalendarDays } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Lead, PipelineStage } from '../lib/supabase'
import KpiHeader from '../components/KpiHeader'
import KanbanBoard from '../components/KanbanBoard'
import LeadModal from '../components/LeadModal'
import MetricsView from '../components/MetricsView'
import SettingsView from '../components/SettingsView'
import MeetingsView from '../components/MeetingsView'

const STAGES_COLORS: Record<number, string> = {
  1: '#94a3b8', // Novo Lead
  2: '#3b82f6', // Primeiro Contato
  3: '#f59e0b', // Qualificação
  4: '#8b5cf6', // Apresentação
  5: '#ec4899', // Proposta Enviada
  6: '#f97316', // Negociação
  7: '#22c55e', // Ganho
  8: '#ef4444'  // Perdido
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'metrics' | 'pipeline' | 'meetings' | 'settings'>('metrics')
  const [leads, setLeads] = useState<Lead[]>([])
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(new Date())

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    const [{ data: stagesData }, { data: leadsData }] = await Promise.all([
      supabase.from('pipeline_stages').select('*').order('order_index'),
      supabase.from('crm_leads_view').select('*').order('created_at', { ascending: false }),
    ])

    if (stagesData) setStages(stagesData as PipelineStage[])
    if (leadsData) {
      const enriched = (leadsData as Lead[]).map(l => ({
        ...l,
        stage_color: STAGES_COLORS[l.stage_id] || '#6366f1',
      }))
      setLeads(enriched)
    }

    setLoading(false)
    setRefreshing(false)
    setLastUpdated(new Date())
  }, [])

  useEffect(() => {
    loadData()

    // Auto-refresh every 30s
    const interval = setInterval(() => loadData(true), 30000)
    return () => clearInterval(interval)
  }, [loadData])

  async function handleStageChange(leadId: string, stageId: number) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: stageId, stage_color: STAGES_COLORS[stageId] } : l))
    await supabase.from('leads').update({ stage_id: stageId }).eq('id', leadId)
  }

  function handleLeadUpdate(updated: Lead) {
    const enriched = { ...updated, stage_color: STAGES_COLORS[updated.stage_id] || '#6366f1' }
    setLeads(prev => {
      const exists = prev.some(l => l.id === updated.id)
      if (exists) {
        return prev.map(l => l.id === updated.id ? enriched : l)
      } else {
        return [enriched, ...prev]
      }
    })
    if (selectedLead?.id === updated.id) setSelectedLead(enriched)
  }

  function handleLeadDelete(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id))
    setSelectedLead(null)
  }

  const filteredLeads = leads.filter(l =>
    !search ||
    l.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.phone?.includes(search)
  )

  const lastUpdatedStr = lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="dashboard">
      {/* Top Bar */}
      <header className="topbar glass">
        <div className="topbar-left">
          <div className="topbar-logo" style={{ marginRight: '24px' }}>
            <Zap size={22} color="var(--accent)" fill="var(--accent)" />
            <span style={{ fontSize: '16px' }}><strong>Ponto Zero</strong> CRM</span>
          </div>
          
          <nav className="tabs-nav">
            <button 
              className={`tab-item ${activeTab === 'metrics' ? 'active' : ''}`}
              onClick={() => setActiveTab('metrics')}
            >
              <LayoutDashboard size={16} />
              Dashboard
            </button>
            <button 
              className={`tab-item ${activeTab === 'pipeline' ? 'active' : ''}`}
              onClick={() => setActiveTab('pipeline')}
            >
              <Columns size={16} />
              Pipeline
            </button>
            <button 
              className={`tab-item ${activeTab === 'meetings' ? 'active' : ''}`}
              onClick={() => setActiveTab('meetings')}
            >
              <CalendarDays size={16} />
              Reuniões
            </button>
            <button 
              className={`tab-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={16} />
              Configurações
            </button>
          </nav>
        </div>

        <div className="topbar-right">
          {activeTab !== 'settings' && activeTab !== 'meetings' && (
            <div className="search-wrap" style={{ marginRight: '16px' }}>
              <Search size={14} className="search-icon" />
              <input
                className="search-input"
                placeholder="Buscar lead..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '200px' }}
              />
            </div>
          )}
          <button 
            className="btn btn-primary" 
            style={{ marginRight: '12px', display: activeTab === 'settings' || activeTab === 'meetings' ? 'none' : 'flex' }}
            onClick={() => setSelectedLead({ id: '', phone: '', stage_id: 1, score: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Lead)}
          >
            <Plus size={16} />
            Novo Lead
          </button>
          <span className="last-updated">sincronizado às {lastUpdatedStr}</span>
          <button className={`btn btn-ghost refresh-btn ${refreshing ? 'spinning' : ''}`} onClick={() => loadData(true)}>
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="dashboard-content" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>Consultando dados da Ponto Zero...</span>
          </div>
        ) : (
          <>
            {activeTab === 'metrics' && (
              <div className="metrics-page animate-fade">
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: 700 }}>Performance Comercial</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Métricas calculadas em tempo real com base no histórico da Ponto Zero.</p>
                </div>
                <MetricsView leads={leads} />
              </div>
            )}
            {activeTab === 'pipeline' && (
              <div className="pipeline-page animate-fade" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '16px' }}>
                  <KpiHeader leads={filteredLeads} />
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <KanbanBoard
                    stages={stages}
                    leads={filteredLeads}
                    onLeadClick={setSelectedLead}
                    onStageChange={handleStageChange}
                  />
                </div>
              </div>
            )}
            {activeTab === 'meetings' && (
              <div className="animate-fade">
                <MeetingsView />
              </div>
            )}
            {activeTab === 'settings' && (
              <div className="animate-fade">
                <SettingsView />
              </div>
            )}
          </>
        )}
      </main>

      {/* Lead Modal */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          stages={stages}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleLeadUpdate}
          onDelete={handleLeadDelete}
        />
      )}

      <style>{`
        .dashboard {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
          background: var(--bg-base);
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          border-bottom: 1px solid var(--border);
          gap: 16px;
          flex-shrink: 0;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .topbar-left { display: flex; align-items: center; gap: 20px; flex: 1; }
        .topbar-logo { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text-secondary); white-space: nowrap; }
        .topbar-logo strong { color: var(--text-primary); }
        .search-wrap { position: relative; flex: 1; max-width: 400px; }
        .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
        .search-input { padding-left: 32px !important; }
        .topbar-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .last-updated { font-size: 11px; color: var(--text-muted); }
        .refresh-btn { transition: var(--transition); }
        .refresh-btn.spinning svg { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .dashboard-kpis { padding: 16px 0 12px; flex-shrink: 0; }
        .dashboard-board { flex: 1; overflow-y: hidden; overflow-x: auto; }
        .loading-state {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 12px; height: 100%;
          color: var(--text-muted); font-size: 13px;
        }
        .spinner {
          width: 32px; height: 32px; border-radius: 50%;
          border: 3px solid var(--border);
          border-top-color: var(--accent);
          animation: spin 0.8s linear infinite;
        }
      `}</style>
    </div>
  )
}
