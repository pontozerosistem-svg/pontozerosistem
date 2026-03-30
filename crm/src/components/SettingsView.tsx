import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DAYS = [
  { id: 0, label: 'Domingo' },
  { id: 1, label: 'Segunda-feira' },
  { id: 2, label: 'Terça-feira' },
  { id: 3, label: 'Quarta-feira' },
  { id: 4, label: 'Quinta-feira' },
  { id: 5, label: 'Sexta-feira' },
  { id: 6, label: 'Sábado' }
]

export default function SettingsView() {
  const [agentEnabled, setAgentEnabled] = useState(true)
  const [consultantPhone, setConsultantPhone] = useState('')
  const [availability, setAvailability] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    const [{ data: settings }, { data: avail }] = await Promise.all([
      supabase.from('scheduling_settings').select('*').single(),
      supabase.from('professional_availability').select('*').order('day_of_week')
    ])

    if (settings) {
      setAgentEnabled(settings.agent_enabled ?? true)
      setConsultantPhone(settings.consultant_phone || '')
    }
    
    if (avail) {
      // Cria um mapa, se não existir cria vazio
      const availMap = DAYS.map(d => {
        const existing = avail.find(a => a.day_of_week === d.id)
        return existing || { day_of_week: d.id, start_time: '09:00', end_time: '18:00', active: false }
      })
      // Marca como ativo se existe no banco (tem id)
      setAvailability(availMap.map(a => ({ ...a, active: !!a.id })))
    }
    
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Salva Configurações Globais
      const { error: err1 } = await supabase
        .from('scheduling_settings')
        .update({ agent_enabled: agentEnabled, consultant_phone: consultantPhone })
        .eq('id', 1)

      if (err1) throw err1

      // Salva Disponibilidade (Deleta tudo e recria os ativos)
      await supabase.from('professional_availability').delete().neq('id', '00000000-0000-0000-0000-000000000000') // Deleta todos

      const activeAvails = availability.filter(a => a.active).map(a => ({
        day_of_week: a.day_of_week,
        start_time: a.start_time,
        end_time: a.end_time
      }))

      if (activeAvails.length > 0) {
        const { error: err2 } = await supabase.from('professional_availability').insert(activeAvails)
        if (err2) throw err2
      }

      alert('Configurações salvas com sucesso!')
      await loadSettings()
    } catch (e: any) {
      alert('Erro ao salvar configurações: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleAvailChange(dayId: number, field: string, value: any) {
    setAvailability(prev => prev.map(a => a.day_of_week === dayId ? { ...a, [field]: value } : a))
  }

  if (loading) return <div style={{ padding: 20 }}>Carregando configurações...</div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Configurações do Sistema</h2>

      <div className="card glass" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, marginBottom: 16 }}>Agente de IA</h3>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <input 
            type="checkbox" 
            id="agentToggle" 
            checked={agentEnabled}
            onChange={(e) => setAgentEnabled(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <label htmlFor="agentToggle" style={{ fontSize: 16, cursor: 'pointer' }}>
            Habilitar respostas automáticas e agendamento via WhatsApp
          </label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            WhatsApp do Consultor (Para Lembretes)
          </label>
          <input 
            type="text" 
            className="input" 
            value={consultantPhone}
            onChange={(e) => setConsultantPhone(e.target.value)}
            placeholder="Ex: 5511999999999"
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Usado para notificar 30 min antes da reunião e pedir feedback.</span>
        </div>
      </div>

      <div className="card glass" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, marginBottom: 8 }}>Horários de Atendimento</h3>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
          Defina os horários em que o agente poderá agendar reuniões com os leads.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {availability.map(avail => {
            const dayLabel = DAYS.find(d => d.id === avail.day_of_week)?.label
            return (
              <div key={avail.day_of_week} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 150 }}>
                  <input 
                    type="checkbox" 
                    checked={avail.active}
                    onChange={(e) => handleAvailChange(avail.day_of_week, 'active', e.target.checked)}
                  />
                  <span>{dayLabel}</span>
                </div>
                
                <input 
                  type="time" 
                  className="input" 
                  value={avail.start_time.substring(0, 5)} 
                  onChange={(e) => handleAvailChange(avail.day_of_week, 'start_time', e.target.value)}
                  disabled={!avail.active}
                />
                
                <span>até</span>
                
                <input 
                  type="time" 
                  className="input" 
                  value={avail.end_time.substring(0, 5)} 
                  onChange={(e) => handleAvailChange(avail.day_of_week, 'end_time', e.target.value)}
                  disabled={!avail.active}
                />
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          className="btn btn-primary" 
          onClick={handleSave}
          disabled={saving}
          style={{ width: 150, padding: 12 }}
        >
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  )
}
