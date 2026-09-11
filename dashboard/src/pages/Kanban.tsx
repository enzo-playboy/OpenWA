import { useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Plus,
  MoreVertical,
  Phone,
  Building2,
  Inbox,
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/PageHeader';
import './Kanban.css';

/* ── Types ── */
export type LeadStage = 'cold' | 'contacted' | 'engaged' | 'proposal' | 'closed' | 'archived';

export interface Lead {
  id: string;
  name: string;
  company: string;
  phone: string;
  stage: LeadStage;
  tags: string[];
  createdAt: string;
  notes?: string;
}

/* ── Column definitions ── */
interface ColumnDef {
  stage: LeadStage;
  emoji: string;
  labelKey: string;
  color: string;
}

const COLUMNS: ColumnDef[] = [
  { stage: 'cold',      emoji: '📥', labelKey: 'kanban.stages.cold',      color: '#94a3b8' },
  { stage: 'contacted', emoji: '💬', labelKey: 'kanban.stages.contacted', color: '#60a5fa' },
  { stage: 'engaged',   emoji: '🔥', labelKey: 'kanban.stages.engaged',   color: '#f59e0b' },
  { stage: 'proposal',  emoji: '📝', labelKey: 'kanban.stages.proposal',  color: '#a855f7' },
  { stage: 'closed',    emoji: '✅', labelKey: 'kanban.stages.closed',    color: '#22c55e' },
  { stage: 'archived',  emoji: '❌', labelKey: 'kanban.stages.archived',  color: '#ef4444' },
];

/* ── Seed data (demo) ── */
const SEED_LEADS: Lead[] = [
  { id: '1', name: 'Maria Oliveira',   company: 'Joalheria Brilhante',     phone: '11987654321', stage: 'cold',      tags: ['site'],             createdAt: '2026-09-10' },
  { id: '2', name: 'Carlos Santos',    company: 'Relojoaria Tempo & Arte', phone: '21976543210', stage: 'cold',      tags: ['catalogo'],         createdAt: '2026-09-10' },
  { id: '3', name: 'Ana Souza',        company: 'Gold & Silver SP',        phone: '11965432109', stage: 'contacted', tags: ['site', 'whatsapp'], createdAt: '2026-09-09' },
  { id: '4', name: 'Ricardo Lima',     company: 'Relojoaria Pontual',      phone: '31954321098', stage: 'contacted', tags: ['catalogo'],         createdAt: '2026-09-09' },
  { id: '5', name: 'Fernanda Costa',   company: 'Vivara Campinas',         phone: '19943210987', stage: 'engaged',   tags: ['site', 'catalogo'], createdAt: '2026-09-08' },
  { id: '6', name: 'Paulo Mendes',     company: 'Joias do Vale',           phone: '12932109876', stage: 'proposal',  tags: ['site'],             createdAt: '2026-09-07' },
  { id: '7', name: 'Juliana Ferreira', company: 'Tic Tac Relógios',       phone: '41921098765', stage: 'closed',    tags: ['site', 'whatsapp'], createdAt: '2026-09-05' },
];

/* ── Helpers ── */
const genId = () => `lead-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

/* ═══════════════════════════════════════════════════════════════
   Kanban Page Component
   ═══════════════════════════════════════════════════════════════ */
export default function Kanban() {
  const { t } = useTranslation();
  useDocumentTitle(t('kanban.title', { defaultValue: 'CRM Kanban' }));

  const [leads, setLeads] = useState<Lead[]>(SEED_LEADS);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  /* Drag & Drop state */
  const dragItem = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<LeadStage | null>(null);

  /* Filter */
  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      l =>
        l.name.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q) ||
        l.phone.includes(q),
    );
  }, [leads, search]);

  /* Group by stage */
  const grouped = useMemo(() => {
    const map = new Map<LeadStage, Lead[]>();
    for (const col of COLUMNS) map.set(col.stage, []);
    for (const lead of filtered) {
      map.get(lead.stage)!.push(lead);
    }
    return map;
  }, [filtered]);

  /* ── Drag handlers ── */
  const handleDragStart = useCallback((id: string) => {
    dragItem.current = id;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stage: LeadStage) => {
    e.preventDefault();
    setDragOverCol(stage);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverCol(null);
  }, []);

  const handleDrop = useCallback(
    (stage: LeadStage) => {
      setDragOverCol(null);
      if (!dragItem.current) return;
      setLeads(prev =>
        prev.map(l => (l.id === dragItem.current ? { ...l, stage } : l)),
      );
      dragItem.current = null;
    },
    [],
  );

  /* ── CRUD ── */
  const handleAddLead = () => {
    setEditingLead(null);
    setShowModal(true);
  };

  const handleEditLead = (lead: Lead) => {
    setEditingLead(lead);
    setShowModal(true);
  };

  const handleSaveLead = (data: Omit<Lead, 'id' | 'createdAt'>) => {
    if (editingLead) {
      setLeads(prev =>
        prev.map(l => (l.id === editingLead.id ? { ...l, ...data } : l)),
      );
    } else {
      setLeads(prev => [
        ...prev,
        { ...data, id: genId(), createdAt: new Date().toISOString().slice(0, 10) },
      ]);
    }
    setShowModal(false);
    setEditingLead(null);
  };

  /* ── Stats ── */
  const totalLeads = leads.length;
  const engagedCount = leads.filter(l => l.stage === 'engaged').length;
  const closedCount = leads.filter(l => l.stage === 'closed').length;

  return (
    <div className="kanban-page">
      <PageHeader
        title={t('kanban.title', { defaultValue: 'CRM Kanban' })}
        subtitle={t('kanban.subtitle', {
          defaultValue: 'Gerencie o funil de prospecção arrastando os cards entre as colunas',
        })}
      />

      {/* Toolbar */}
      <div className="kanban-toolbar">
        <div className="kanban-search">
          <Search size={16} />
          <input
            type="text"
            placeholder={t('kanban.searchPlaceholder', {
              defaultValue: 'Buscar lead, empresa ou telefone...',
            })}
            value={search}
            onChange={e => setSearch(e.target.value)}
            id="kanban-search-input"
          />
        </div>

        <button className="kanban-add-btn" onClick={handleAddLead} id="kanban-add-lead-btn">
          <Plus size={16} />
          {t('kanban.addLead', { defaultValue: 'Novo Lead' })}
        </button>

        <div className="kanban-stats-bar">
          <div className="kanban-stat-chip">
            <span className="chip-dot" style={{ background: '#60a5fa' }} />
            {totalLeads} {t('kanban.total', { defaultValue: 'leads' })}
          </div>
          <div className="kanban-stat-chip">
            <span className="chip-dot" style={{ background: '#f59e0b' }} />
            {engagedCount} {t('kanban.engaged', { defaultValue: 'engajados' })}
          </div>
          <div className="kanban-stat-chip">
            <span className="chip-dot" style={{ background: '#22c55e' }} />
            {closedCount} {t('kanban.closed', { defaultValue: 'fechados' })}
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="kanban-board">
        {COLUMNS.map(col => {
          const cards = grouped.get(col.stage) ?? [];
          return (
            <div
              key={col.stage}
              className={`kanban-column ${dragOverCol === col.stage ? 'drag-over' : ''}`}
              data-stage={col.stage}
              onDragOver={e => handleDragOver(e, col.stage)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(col.stage)}
            >
              <div className="kanban-column-header">
                <div className="kanban-column-title">
                  <span className="column-emoji">{col.emoji}</span>
                  <span>{t(col.labelKey, { defaultValue: col.stage })}</span>
                </div>
                <span className="kanban-column-count">{cards.length}</span>
              </div>

              <div className="kanban-column-body">
                {cards.length === 0 ? (
                  <div className="kanban-empty">
                    <Inbox size={28} />
                    <span>{t('kanban.emptyColumn', { defaultValue: 'Nenhum lead aqui' })}</span>
                  </div>
                ) : (
                  cards.map(lead => (
                    <div
                      key={lead.id}
                      className="kanban-card"
                      draggable
                      onDragStart={() => handleDragStart(lead.id)}
                      onDragEnd={() => { dragItem.current = null; setDragOverCol(null); }}
                    >
                      <div className="kanban-card-header">
                        <span className="kanban-card-name">{lead.name}</span>
                        <button
                          className="kanban-card-menu-btn"
                          onClick={() => handleEditLead(lead)}
                          title={t('common.edit', { defaultValue: 'Editar' })}
                          aria-label={`Edit ${lead.name}`}
                        >
                          <MoreVertical size={14} />
                        </button>
                      </div>

                      <div className="kanban-card-company">
                        <Building2 size={12} />
                        {lead.company}
                      </div>

                      <div className="kanban-card-phone">
                        <Phone size={12} />
                        {lead.phone}
                      </div>

                      <div className="kanban-card-footer">
                        <div className="kanban-card-tags">
                          {lead.tags.map(tag => (
                            <span key={tag} className={`kanban-tag tag-${tag}`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                        <span className="kanban-card-date">{formatDate(lead.createdAt)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <LeadModal
          lead={editingLead}
          onSave={handleSaveLead}
          onClose={() => { setShowModal(false); setEditingLead(null); }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Lead Modal (Add / Edit)
   ═══════════════════════════════════════════════════════════════ */
interface LeadModalProps {
  lead: Lead | null;
  onSave: (data: Omit<Lead, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}

function LeadModal({ lead, onSave, onClose }: LeadModalProps) {
  const { t } = useTranslation();

  const [name, setName] = useState(lead?.name ?? '');
  const [company, setCompany] = useState(lead?.company ?? '');
  const [phone, setPhone] = useState(lead?.phone ?? '');
  const [stage, setStage] = useState<LeadStage>(lead?.stage ?? 'cold');
  const [tagsRaw, setTagsRaw] = useState(lead?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(lead?.notes ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      company: company.trim(),
      phone: phone.trim(),
      stage,
      tags: tagsRaw
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean),
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="kanban-modal-overlay" onClick={onClose}>
      <form
        className="kanban-modal"
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2>
          {lead
            ? t('kanban.editLead', { defaultValue: 'Editar Lead' })
            : t('kanban.addLead', { defaultValue: 'Novo Lead' })}
        </h2>

        <div className="kanban-modal-field">
          <label htmlFor="lead-name">{t('kanban.fields.name', { defaultValue: 'Nome do Contato' })}</label>
          <input id="lead-name" value={name} onChange={e => setName(e.target.value)} required autoFocus />
        </div>

        <div className="kanban-modal-field">
          <label htmlFor="lead-company">{t('kanban.fields.company', { defaultValue: 'Empresa' })}</label>
          <input id="lead-company" value={company} onChange={e => setCompany(e.target.value)} />
        </div>

        <div className="kanban-modal-field">
          <label htmlFor="lead-phone">{t('kanban.fields.phone', { defaultValue: 'Telefone / WhatsApp' })}</label>
          <input id="lead-phone" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>

        <div className="kanban-modal-field">
          <label htmlFor="lead-stage">{t('kanban.fields.stage', { defaultValue: 'Etapa' })}</label>
          <select id="lead-stage" value={stage} onChange={e => setStage(e.target.value as LeadStage)}>
            {COLUMNS.map(col => (
              <option key={col.stage} value={col.stage}>
                {col.emoji} {t(col.labelKey, { defaultValue: col.stage })}
              </option>
            ))}
          </select>
        </div>

        <div className="kanban-modal-field">
          <label htmlFor="lead-tags">{t('kanban.fields.tags', { defaultValue: 'Tags (separadas por vírgula)' })}</label>
          <input id="lead-tags" value={tagsRaw} onChange={e => setTagsRaw(e.target.value)} placeholder="site, catalogo, whatsapp" />
        </div>

        <div className="kanban-modal-field">
          <label htmlFor="lead-notes">{t('kanban.fields.notes', { defaultValue: 'Notas' })}</label>
          <input id="lead-notes" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="kanban-modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancelar' })}
          </button>
          <button type="submit" className="btn-save">
            {t('common.save', { defaultValue: 'Salvar' })}
          </button>
        </div>
      </form>
    </div>
  );
}
