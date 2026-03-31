import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Save, RefreshCw } from 'lucide-react'

const DAYS = [
  { id: 0, label: 'Domingo' },
  { id: 1, label: 'Segunda-feira' },
  { id: 2, label: 'Terça-feira' },
  { id: 3, label: 'Quarta-feira' },
  { id: 4, label: 'Quinta-feira' },
  { id: 5, label: 'Sexta-feira' },
  { id: 6, label: 'Sábado' },
]

interface Slot {
  id?: string
  day_of_week?: number | null
  specific_date?: string | null
  start_time: string
  end_time: string
}

export default function SettingsView() {
  const [agentEnabled, setAgentEnabled] = useState(true)
  const [consultantPhone, setConsultantPhone] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    const [{ data: settings }, { data: avail }] = await Promise.all([
      supabase.from('scheduling_settings').select('*').single(),
      supabase.from('professional_availability').select('*').order('day_of_week').order('start_time'),
    ])

    if (settings) {
      setAgentEnabled(settings.agent_enabled ?? true)
      setConsultantPhone(settings.consultant_phone || '')
    }

    setSlots(avail ?? [])
    setLoading(false)
  }

  function addSlot(dayId?: number, isSpecificDate = false) {
    if (isSpecificDate) {
      setSlots(prev => [...prev, { specific_date: new Date().toISOString().split('T')[0], start_time: '09:00', end_time: '18:00' }])
    } else {
      setSlots(prev => [...prev, { day_of_week: dayId, start_time: '09:00', end_time: '18:00' }])
    }
  }

  function removeSlot(index: number) {
    setSlots(prev => prev.filter((_, i) => i !== index))
  }

  function updateSlot(index: number, field: keyof Slot, value: any) {
    setSlots(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Salva configurações globais
      await supabase
        .from('scheduling_settings')
        .update({ agent_enabled: agentEnabled, consultant_phone: consultantPhone })
        .eq('id', 1)

      // Deleta todos os slots (semanais e datas específicas) e insere os novos
      await supabase.from('professional_availability').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      if (slots.length > 0) {
        const toInsert = slots.map(s => ({
          day_of_week: s.day_of_week ?? null,
          specific_date: s.specific_date ?? null,
          start_time: s.start_time,
          end_time: s.end_time,
        }))
        await supabase.from('professional_availability').insert(toInsert)
      }

      alert('Configurações salvas!')
      await loadSettings()
    } catch (e: any) {
      alert('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--text-muted)' }}>
        <RefreshCw size={20} className="spinning" style={{ marginRight: 8 }} />
        Carregando configurações...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Configurações do Sistema</h2>

      {/* Agent Settings */}
      <div className="card glass" style={{ padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>🤖 Agente de IA</h3>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16 }}>
          <div
            onClick={() => setAgentEnabled(v => !v)}
            style={{
              width: 44, height: 24, borderRadius: 12, background: agentEnabled ? 'var(--accent)' : 'var(--border)',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer',
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: '50%', background: 'white',
              position: 'absolute', top: 3,
              left: agentEnabled ? 23 : 3,
              transition: 'left 0.2s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }} />
          </div>
          <span style={{ fontSize: 15 }}>
            {agentEnabled ? 'Respostas automáticas ativadas' : 'Respostas automáticas desativadas'}
          </span>
        </label>

        <div>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            📱 WhatsApp do Consultor (para lembretes)
          </label>
          <input
            type="text"
            className="input"
            value={consultantPhone}
            onChange={e => setConsultantPhone(e.target.value)}
            placeholder="Ex: 5511999999999"
            style={{ maxWidth: 340 }}
          />
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Receberá notificação 30 min antes de cada reunião e o link da videochamada.
          </p>
        </div>
      </div>

      {/* Availability */}
      <div className="card glass" style={{ padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>📅 Horários de Atendimento</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          Adicione um ou mais horários por dia. O agente sugerirá vagas dentro desses intervalos.
        </p>

        {DAYS.map(day => {
          const daySlots = slots.map((s, idx) => ({ ...s, _idx: idx })).filter(s => s.day_of_week === day.id)
          return (
            <div key={day.id} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14, minWidth: 130 }}>{day.label}</span>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => addSlot(day.id)}
                >
                  <Plus size={13} /> Adicionar horário
                </button>
              </div>

              {daySlots.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 4 }}>Nenhum horário cadastrado.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {daySlots.map(slot => (
                    <div
                      key={slot._idx}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px',
                      }}
                    >
                      <input
                        type="time"
                        className="input"
                        value={slot.start_time.substring(0, 5)}
                        onChange={e => updateSlot(slot._idx, 'start_time', e.target.value)}
                        style={{ width: 120 }}
                      />
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>até</span>
                      <input
                        type="time"
                        className="input"
                        value={slot.end_time.substring(0, 5)}
                        onChange={e => updateSlot(slot._idx, 'end_time', e.target.value)}
                        style={{ width: 120 }}
                      />
                      <button
                        className="btn btn-ghost"
                        style={{ color: '#ef4444', padding: '4px 8px' }}
                        onClick={() => removeSlot(slot._idx)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Specific Dates */}
      <div className="card glass" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ fontSize: 17, fontWeight: 600 }}>🌟 Datas Específicas / Exceções</h3>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => addSlot(undefined, true)}
          >
            <Plus size={13} /> Adicionar data
          </button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          Defina horários para uma data específica (exibe prioritariamente sobre a regra semanal).
        </p>

        {slots.map((s, idx) => ({ ...s, _idx: idx })).filter(s => s.specific_date).length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 4 }}>Nenhuma data específica cadastrada.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {slots.map((slot, idx) => {
              if (!slot.specific_date) return null
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px',
                  }}
                >
                  <input
                    type="date"
                    className="input"
                    value={slot.specific_date}
                    onChange={e => updateSlot(idx, 'specific_date', e.target.value)}
                    style={{ width: 140 }}
                  />
                  <input
                    type="time"
                    className="input"
                    value={slot.start_time.substring(0, 5)}
                    onChange={e => updateSlot(idx, 'start_time', e.target.value)}
                    style={{ width: 120 }}
                  />
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>até</span>
                  <input
                    type="time"
                    className="input"
                    value={slot.end_time.substring(0, 5)}
                    onChange={e => updateSlot(idx, 'end_time', e.target.value)}
                    style={{ width: 120 }}
                  />
                  <button
                    className="btn btn-ghost"
                    style={{ color: '#ef4444', padding: '4px 8px' }}
                    onClick={() => removeSlot(idx)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px' }}
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={16} />
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  )
}
