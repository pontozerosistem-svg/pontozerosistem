import { useState } from 'react'
import LeadCard from './LeadCard'
import type { Lead, PipelineStage } from '../lib/supabase'

interface Props {
  stages: PipelineStage[]
  leads: Lead[]
  onLeadClick: (lead: Lead) => void
  onStageChange: (leadId: string, stageId: number) => void
}

export default function KanbanBoard({ stages, leads, onLeadClick, onStageChange }: Props) {
  const [dragOver, setDragOver] = useState<number | null>(null)

  function getLeadsByStage(stageId: number) {
    return leads.filter(l => l.stage_id === stageId)
  }

  function handleDrop(e: React.DragEvent, stageId: number) {
    e.preventDefault()
    const leadId = e.dataTransfer.getData('leadId')
    if (leadId) onStageChange(leadId, stageId)
    setDragOver(null)
  }

  return (
    <div className="kanban-board">
      {stages.map(stage => {
        const stageLeads = getLeadsByStage(stage.id)
        const isOver = dragOver === stage.id
        return (
          <div
            key={stage.id}
            className={`kanban-col ${isOver ? 'drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(stage.id) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => handleDrop(e, stage.id)}
          >
            {/* Column header */}
            <div className="kanban-col-header" style={{ borderBottom: `2px solid ${stage.color || '#6366f1'}` }}>
              <div className="col-dot" style={{ background: stage.color || '#6366f1' }} />
              <span className="col-name">{stage.name}</span>
              <span className="col-count" style={{ background: `${stage.color || '#6366f1'}30`, color: stage.color || '#6366f1', border: `1px solid ${stage.color || '#6366f1'}50` }}>
                {stageLeads.length}
              </span>
            </div>

            {/* Cards */}
            <div className="kanban-cards">
              {stageLeads.length === 0 ? (
                <div className="col-empty">
                  <div className="col-empty-dot" style={{ background: stage.color }} />
                  <span>Arraste leads aqui</span>
                </div>
              ) : (
                stageLeads.map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onClick={onLeadClick}
                    onStageChange={onStageChange}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}

      <style>{`
        .kanban-board {
          display: flex;
          gap: 12px;
          padding: 0 20px 20px;
          overflow-x: auto;
          flex: 1;
          align-items: flex-start;
        }
        .kanban-col {
          flex-shrink: 0;
          width: 280px;
          background: #12121c;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: var(--radius-lg);
          padding: 16px;
          transition: var(--transition);
          min-height: 500px;
        }
        .kanban-col.drag-over {
          border-color: var(--accent);
          background: rgba(99,102,241,0.05);
          box-shadow: 0 0 0 2px var(--accent-glow);
        }
        .kanban-col-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-bottom: 10px;
          margin-bottom: 10px;
          border-bottom: 1px solid var(--border);
        }
        .col-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .col-name { font-size: 12px; font-weight: 600; color: var(--text-secondary); flex: 1; }
        .col-count {
          display: flex; align-items: center; justify-content: center;
          min-width: 22px; height: 22px; padding: 0 6px;
          border-radius: 99px; font-size: 11px; font-weight: 700;
        }
        .kanban-cards { display: flex; flex-direction: column; gap: 8px; }
        .col-empty {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 8px;
          padding: 24px 0; color: var(--text-muted); font-size: 11px;
          border: 1px dashed var(--border); border-radius: var(--radius-md);
        }
        .col-empty-dot { width: 6px; height: 6px; border-radius: 50%; opacity: 0.5; }
      `}</style>
    </div>
  )
}
