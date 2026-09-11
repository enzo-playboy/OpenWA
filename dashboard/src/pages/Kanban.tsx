import { useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Plus,
  MoreVertical,
  Phone,
  Building2,
  Inbox,
  Loader2,
  RefreshCw,
  Database,
  AlertCircle,
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PageHeader } from '../components/PageHeader';
import {
  useKanbanLeadsQuery,
  useUpdateLeadStageMutation,
  useCreateKanbanLeadMutation,
  useUpdateKanbanLeadMutation,
  type KanbanStage,
  type SupabaseKanbanLead,
} from '../hooks/queries';
import './Kanban.css';

/* ── Column definitions ── */
interface ColumnDef {
  stage: KanbanStage;
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

/* ── UI Lead type (derived from SupabaseKanbanLead) ── */
interface KanbanCard {
  id: string;
  name: string;
  company: string;
  phone: string;
  stage: KanbanStage;
  tags: string[];
  createdAt: string;
  notes?: string;
}

/* ── Helpers ── */
const formatDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

function supabaseToCard(lead: SupabaseKanbanLead): KanbanCard {
  const meta = (lead.metadata ?? {}) as Record<string, unknown>;
  let stage: KanbanStage = (lead.stage as KanbanStage) ?? (meta.stage as KanbanStage);

  if (!stage) {
    const statusMap: Record<string, KanbanStage> = {
      cold: 'cold',
      pending: 'cold',
      contacted: 'contacted',
      sent: 'contacted',
      engaged: 'engaged',
      replied: 'engaged',
      proposal: 'proposal',
      scheduled: 'proposal',
      closed: 'closed',
      completed: 'closed',
      archived: 'archived',
      paused: 'archived',
    };
    stage = statusMap[lead.status ?? ''] ?? 'cold';
  }

  const tags = lead.tags ?? (meta.tags as string[]) ?? (lead.status ? [lead.status] : []);
  const company = lead.company ?? (meta.company as string) ?? '—';
  const notes = lead.notes ?? (meta.notes as string) ?? undefined;

  return {
    id: lead.id,
    name: lead.name ?? lead.phone ?? '(sem nome)',
    company,
    phone: lead.phone,
    stage,
    tags,
    createdAt: lead.created_at ?? new Date().toISOString(),
    notes,
  };
}

/* ═══════════════════════════════════════════════════════════════
   Kanban Page Component
   ═══════════════════════════════════════════════════════════════ */
export default function Kanban() {
  const { t } = useTranslation();
  useDocumentTitle(t('kanban.title', { defaultValue: 'CRM Kanban' }));

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCard, setEditingCard] = useState<KanbanCard | null>(null);

  /* Drag & Drop state */
  const dragItem = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<KanbanStage | null>(null);
  const [optimisticStages, setOptimisticStages] = useState<Record<string, KanbanStage>>({});

  /* ── Remote data ── */
  const {
    data: rawLeads = [],
    isLoading,
    isRefetching,
    refetch,
    isError,
  } = useKanbanLeadsQuery();

  const updateStageMutation = useUpdateLeadStageMutation();
  const createMutation = useCreateKanbanLeadMutation();
  const updateMutation = useUpdateKanbanLeadMutation();

  const supabaseConnected = rawLeads.length > 0 || !isError;

  /* Build display cards (apply optimistic overrides) */
  const cards: KanbanCard[] = useMemo(() => {
    return rawLeads.map(lead => {
      const card = supabaseToCard(lead);
      if (optimisticStages[card.id]) {
        return { ...card, stage: optimisticStages[card.id] };
      }
      return card;
    });
  }, [rawLeads, optimisticStages]);

  /* Filter */
  const filtered = useMemo(() => {
    if (!search.trim()) return cards;
    const q = search.toLowerCase();
    return cards.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.phone.includes(q),
    );
  }, [cards, search]);

  /* Group by stage */
  const grouped = useMemo(() => {
    const map = new Map<KanbanStage, KanbanCard[]>();
    for (const col of COLUMNS) map.set(col.stage, []);
    for (const card of filtered) {
      map.get(card.stage)!.push(card);
    }
    return map;
  }, [filtered]);

  /* ── Drag handlers ── */
  const handleDragStart = useCallback((id: string) => {
    dragItem.current = id;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stage: KanbanStage) => {
    e.preventDefault();
    setDragOverCol(stage);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverCol(null);
  }, []);

  const handleDrop = useCallback(
    (stage: KanbanStage) => {
      setDragOverCol(null);
      const id = dragItem.current;
      if (!id) return;
      dragItem.current = null;

      // Optimistic update immediately
      setOptimisticStages(prev => ({ ...prev, [id]: stage }));

      // Persist to Supabase
      updateStageMutation.mutate(
        { identifier: { id }, stage },
        {
          onSuccess: (ok) => {
            if (!ok) {
              // Rollback optimistic on failure
              setOptimisticStages(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
              });
            } else {
              // Clear optimistic once real data is fetched
              setOptimisticStages(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
              });
            }
          },
          onError: () => {
            setOptimisticStages(prev => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          },
        },
      );
    },
    [updateStageMutation],
  );

  /* ── CRUD ── */
  const handleAddLead = () => {
    setEditingCard(null);
    setShowModal(true);
  };

  const handleEditLead = (card: KanbanCard) => {
    setEditingCard(card);
    setShowModal(true);
  };

  const handleSaveLead = async (data: Omit<KanbanCard, 'id' | 'createdAt'>) => {
    if (editingCard) {
      // Update existing
      updateMutation.mutate({
        id: editingCard.id,
        data: {
          name: data.name,
          company: data.company,
          phone: data.phone,
          stage: data.stage,
          tags: data.tags,
          notes: data.notes,
        },
      });
    } else {
      // Create new
      createMutation.mutate({
        name: data.name,
        company: data.company,
        phone: data.phone,
        stage: data.stage,
        tags: data.tags,
        notes: data.notes,
        status: 'pending',
      });
    }
    setShowModal(false);
    setEditingCard(null);
  };

  /* ── Stats ── */
  const totalLeads = cards.length;
  const engagedCount = cards.filter(c => c.stage === 'engaged').length;
  const closedCount = cards.filter(c => c.stage === 'closed').length;

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

        <button
          className="kanban-refresh-btn"
          onClick={() => void refetch()}
          title="Atualizar dados do Supabase"
          id="kanban-refresh-btn"
          disabled={isRefetching}
        >
          <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />
          {isRefetching ? 'Atualizando...' : 'Atualizar'}
        </button>

        {/* Connection indicator */}
        <span
          className="kanban-db-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            borderRadius: '8px',
            fontSize: '0.73rem',
            fontWeight: 600,
            background: supabaseConnected
              ? 'rgba(37, 211, 102, 0.12)'
              : 'rgba(239, 68, 68, 0.12)',
            color: supabaseConnected ? '#25d366' : '#ef4444',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Database size={12} />
          {supabaseConnected ? 'Supabase' : 'Offline'}
        </span>

        <div className="kanban-stats-bar">
          <div className="kanban-stat-chip">
            <span className="chip-dot" style={{ background: '#60a5fa' }} />
            {isLoading ? '...' : totalLeads} {t('kanban.total', { defaultValue: 'leads' })}
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

      {/* Error banner */}
      {isError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            color: '#ef4444',
            fontSize: '0.85rem',
          }}
        >
          <AlertCircle size={16} />
          Não foi possível conectar ao Supabase. Verifique as configurações de SUPABASE_URL e SUPABASE_KEY no servidor.
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '200px',
            gap: '10px',
            color: 'var(--text-muted)',
          }}
        >
          <Loader2 size={24} className="animate-spin" />
          <span>Carregando leads do Supabase...</span>
        </div>
      )}

      {/* Board */}
      {!isLoading && (
        <div className="kanban-board">
          {COLUMNS.map(col => {
            const colCards = grouped.get(col.stage) ?? [];
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
                  <span className="kanban-column-count">{colCards.length}</span>
                </div>

                <div className="kanban-column-body">
                  {colCards.length === 0 ? (
                    <div className="kanban-empty">
                      <Inbox size={28} />
                      <span>{t('kanban.emptyColumn', { defaultValue: 'Nenhum lead aqui' })}</span>
                    </div>
                  ) : (
                    colCards.map(card => (
                      <div
                        key={card.id}
                        className="kanban-card"
                        draggable
                        onDragStart={() => handleDragStart(card.id)}
                        onDragEnd={() => { dragItem.current = null; setDragOverCol(null); }}
                      >
                        <div className="kanban-card-header">
                          <span className="kanban-card-name">{card.name}</span>
                          <button
                            className="kanban-card-menu-btn"
                            onClick={() => handleEditLead(card)}
                            title={t('common.edit', { defaultValue: 'Editar' })}
                            aria-label={`Edit ${card.name}`}
                          >
                            <MoreVertical size={14} />
                          </button>
                        </div>

                        <div className="kanban-card-company">
                          <Building2 size={12} />
                          {card.company}
                        </div>

                        <div className="kanban-card-phone">
                          <Phone size={12} />
                          {card.phone}
                        </div>

                        <div className="kanban-card-footer">
                          <div className="kanban-card-tags">
                            {card.tags.map(tag => (
                              <span key={tag} className={`kanban-tag tag-${tag}`}>
                                {tag}
                              </span>
                            ))}
                          </div>
                          <span className="kanban-card-date">{formatDate(card.createdAt)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <LeadModal
          card={editingCard}
          onSave={handleSaveLead}
          onClose={() => { setShowModal(false); setEditingCard(null); }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Lead Modal (Add / Edit)
   ═══════════════════════════════════════════════════════════════ */
interface LeadModalProps {
  card: KanbanCard | null;
  onSave: (data: Omit<KanbanCard, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}

function LeadModal({ card, onSave, onClose }: LeadModalProps) {
  const { t } = useTranslation();

  const [name, setName] = useState(card?.name ?? '');
  const [company, setCompany] = useState(card?.company ?? '');
  const [phone, setPhone] = useState(card?.phone ?? '');
  const [stage, setStage] = useState<KanbanStage>(card?.stage ?? 'cold');
  const [tagsRaw, setTagsRaw] = useState(card?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(card?.notes ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() && !phone.trim()) return;
    onSave({
      name: name.trim() || phone.trim(),
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
          {card
            ? t('kanban.editLead', { defaultValue: 'Editar Lead' })
            : t('kanban.addLead', { defaultValue: 'Novo Lead' })}
        </h2>

        <div className="kanban-modal-field">
          <label htmlFor="lead-name">{t('kanban.fields.name', { defaultValue: 'Nome do Contato' })}</label>
          <input id="lead-name" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>

        <div className="kanban-modal-field">
          <label htmlFor="lead-company">{t('kanban.fields.company', { defaultValue: 'Empresa' })}</label>
          <input id="lead-company" value={company} onChange={e => setCompany(e.target.value)} />
        </div>

        <div className="kanban-modal-field">
          <label htmlFor="lead-phone">{t('kanban.fields.phone', { defaultValue: 'Telefone / WhatsApp' })} *</label>
          <input id="lead-phone" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="5511999999999" />
        </div>

        <div className="kanban-modal-field">
          <label htmlFor="lead-stage">{t('kanban.fields.stage', { defaultValue: 'Etapa' })}</label>
          <select id="lead-stage" value={stage} onChange={e => setStage(e.target.value as KanbanStage)}>
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
