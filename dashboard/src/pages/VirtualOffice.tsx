import { useState, useEffect } from 'react';
import {
  Users,
  Play,
  Pause,
  RefreshCw,
  Sparkles,
  X,
  CheckCircle2,
  Clock,
  Briefcase,
  Layers,
  MessageSquare,
  FileText,
} from 'lucide-react';
import { API_BASE_URL } from '../services/api';
import './VirtualOffice.css';

interface AgentDesk {
  id: string;
  name: string;
  role: string;
  avatar: string;
  color: string;
  status: 'working' | 'done' | 'idle' | 'thinking';
  currentTask: string;
  speechBubble?: string;
  tasksCompleted: number;
  templateSlug: string;
  category: string;
  logs: string[];
}

interface AgencyTemplate {
  slug: string;
  category: string;
  name: string;
  description: string;
  color?: string;
  emoji?: string;
  systemPrompt: string;
}

const initialDesks: AgentDesk[] = [
  {
    id: 'sofia-sdr',
    name: 'Sofia AI',
    role: 'WhatsApp SDR & Pequeno Sim',
    avatar: '👩‍💼',
    color: '#2563eb',
    status: 'working',
    currentTask: 'Atendendo lead de Clínica Estética via WhatsApp...',
    speechBubble: 'Avaliando o Pequeno Sim! 💬',
    tasksCompleted: 42,
    templateSlug: 'sales-outbound-strategist',
    category: 'sales',
    logs: [
      'Disparada mensagem humanizada com Spintax para lead qualificado.',
      'Lead aceitou a oferta da Página de Links (Pequeno Sim).',
      'Registrada oportunidade no CRM Kanban.',
    ],
  },
  {
    id: 'carlos-hunter',
    name: 'Carlos Hunter',
    role: 'Lead Gen & Filtro ICP',
    avatar: '👨‍💻',
    color: '#e8590c',
    status: 'working',
    currentTask: 'Filtrando empresas no Google Maps com ICP Score > 80...',
    speechBubble: 'Encontradas 15 Joalherias no Itaim! 🔍',
    tasksCompleted: 89,
    templateSlug: 'sales-offer-lead-gen-strategist',
    category: 'sales',
    logs: [
      'Importada lista Apify com 50 empresas locais.',
      'Calculado ICP Score automático.',
      'Aguardando aprovação humana para inclusão no Kanban.',
    ],
  },
  {
    id: 'diana-design',
    name: 'Diana Design',
    role: 'Landing Pages & Bio Links',
    avatar: '🎨',
    color: '#ec4899',
    status: 'idle',
    currentTask: 'Aguardando novas aprovações de design...',
    speechBubble: 'Layout do site otimizado! ✨',
    tasksCompleted: 27,
    templateSlug: 'marketing-carousel-growth-engine',
    category: 'marketing',
    logs: [
      'Finalizado modelo de bio link para Marcenaria Fina.',
      'Testada velocidade de carregamento (LCP 0.8s).',
    ],
  },
  {
    id: 'renata-revisao',
    name: 'Renata Revisão',
    role: 'Diagnóstico & Propostas High-Ticket',
    avatar: '📑',
    color: '#8b5cf6',
    status: 'done',
    currentTask: 'Diagnóstico de site lento concluído para Odonto Estética.',
    speechBubble: 'Proposta de R$ 2.500 gerada! 📊',
    tasksCompleted: 35,
    templateSlug: 'sales-proposal-strategist',
    category: 'sales',
    logs: [
      'Analisada falta de responsividade no site antigo do cliente.',
      'Estruturado documento de proposta consultiva.',
      'Enviado vídeo explicativo de 3 min.',
    ],
  },
  {
    id: 'lucas-insta',
    name: 'Lucas Insta',
    role: 'Instagram Directs & Comentários',
    avatar: '📸',
    color: '#d97706',
    status: 'thinking',
    currentTask: 'Processando DMs recebidas na API Meta Oficial...',
    speechBubble: 'Respondendo Direct no Instagram 📩',
    tasksCompleted: 61,
    templateSlug: 'marketing-instagram-curator',
    category: 'marketing',
    logs: [
      'Webhook do Instagram acionado.',
      'Mensagem recebida sobre orçamento de automação.',
      'Encaminhado WhatsApp do lead para Sofia SDR.',
    ],
  },
  {
    id: 'bruno-vendas',
    name: 'Bruno Vendas',
    role: 'Fechamento & Negociação',
    avatar: '💼',
    color: '#16a34a',
    status: 'idle',
    currentTask: 'Monitorando objeções no Kanban...',
    speechBubble: 'Pronto para negociação 🚀',
    tasksCompleted: 19,
    templateSlug: 'sales-deal-strategist',
    category: 'sales',
    logs: [
      'Identificada oportunidade parada há 24h.',
      'Gerada mensagem de acompanhamento sem pressão.',
    ],
  },
];

export function VirtualOffice() {
  const [desks, setDesks] = useState<AgentDesk[]>(initialDesks);
  const [isSimulating, setIsSimulating] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentDesk | null>(null);
  const [templates, setTemplates] = useState<AgencyTemplate[]>([]);
  const [selectedTemplateSlug, setSelectedTemplateSlug] = useState<string>('');
  const [activePrompt, setActivePrompt] = useState<string>('');
  const [timeString, setTimeString] = useState('');

  // Clock timer
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch available templates from backend API
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const apiKey = sessionStorage.getItem('openwa_api_key') || '';
        const res = await fetch(`${API_BASE_URL}/ai-agent/templates`, {
          headers: { 'X-API-Key': apiKey },
        });
        if (res.ok) {
          const data = await res.json();
          setTemplates(data);
        }
      } catch (err) {
        console.error('Error fetching templates:', err);
      }
    };

    fetchTemplates();
  }, []);

  // Real-time task status simulation
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setDesks(prev =>
        prev.map(desk => {
          // Random slight status rotation to mimic active office workflow
          const roll = Math.random();
          if (roll > 0.7) {
            const nextStatus: AgentDesk['status'] =
              desk.status === 'working' ? 'done' : desk.status === 'done' ? 'idle' : 'working';

            const newTaskCount = nextStatus === 'done' ? desk.tasksCompleted + 1 : desk.tasksCompleted;

            return {
              ...desk,
              status: nextStatus,
              tasksCompleted: newTaskCount,
            };
          }
          return desk;
        })
      );
    }, 4000);

    return () => clearInterval(interval);
  }, [isSimulating]);

  // Open inspection modal for an agent desk
  const handleInspectDesk = async (desk: AgentDesk) => {
    setSelectedAgent(desk);
    setSelectedTemplateSlug(desk.templateSlug);

    // Fetch full template prompt details if available
    try {
      const apiKey = sessionStorage.getItem('openwa_api_key') || '';
      const res = await fetch(`${API_BASE_URL}/ai-agent/templates/${desk.templateSlug}`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        setActivePrompt(data.systemPrompt);
      } else {
        setActivePrompt('Prompt de agente configurado no sistema.');
      }
    } catch {
      setActivePrompt('Prompt ativo no agente de IA da agência.');
    }
  };

  // Apply new agency template to agent
  const handleApplyTemplate = async () => {
    if (!selectedAgent || !selectedTemplateSlug) return;

    try {
      const apiKey = sessionStorage.getItem('openwa_api_key') || '';
      const res = await fetch(`${API_BASE_URL}/ai-agent/templates/apply/${selectedTemplateSlug}`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
      });

      if (res.ok) {
        const appliedTemplate = templates.find(t => t.slug === selectedTemplateSlug);
        setDesks(prev =>
          prev.map(d =>
            d.id === selectedAgent.id
              ? {
                  ...d,
                  templateSlug: selectedTemplateSlug,
                  role: appliedTemplate?.description.slice(0, 40) || d.role,
                  status: 'working',
                  logs: [
                    `Template '${appliedTemplate?.name || selectedTemplateSlug}' aplicado com sucesso.`,
                    ...d.logs,
                  ],
                }
              : d
          )
        );
        setSelectedAgent(null);
      }
    } catch (err) {
      console.error('Error applying template:', err);
    }
  };

  const workingCount = desks.filter(d => d.status === 'working').length;
  const doneCount = desks.filter(d => d.status === 'done').length;
  const idleCount = desks.filter(d => d.status === 'idle').length;

  return (
    <div className="vo-container">
      {/* Header Bar */}
      <div className="vo-header">
        <div className="vo-title-group">
          <div className="vo-title-icon">
            <Users size={24} />
          </div>
          <div>
            <h1 className="vo-title">Escritório Virtual da Agência</h1>
            <p className="vo-subtitle">
              Acompanhe a equipe de Agentes de IA em tempo real trabalhando nas baias da agência.
            </p>
          </div>
        </div>

        <div className="vo-stats-summary">
          <div className="vo-stat-badge working">
            <Sparkles size={14} /> {workingCount} Trabalhando
          </div>
          <div className="vo-stat-badge done">
            <CheckCircle2 size={14} /> {doneCount} Concluídos
          </div>
          <div className="vo-stat-badge idle">
            <Clock size={14} /> {idleCount} Em Espera
          </div>

          <button
            className={`vo-btn ${isSimulating ? 'vo-btn-secondary' : 'vo-btn-primary'}`}
            onClick={() => setIsSimulating(!isSimulating)}
          >
            {isSimulating ? <Pause size={16} /> : <Play size={16} />}
            {isSimulating ? 'Pausar Simulação' : 'Retomar Atividade'}
          </button>
        </div>
      </div>

      {/* Main Pixel Art Office Stage */}
      <div className="vo-stage-wrapper">
        <div className="vo-stage">
          {/* Wall Decor Header (Whiteboard, Bookshelf, Clock) */}
          <div className="vo-wall-decor">
            {/* Bookshelf */}
            <div className="vo-bookshelf">
              <div className="vo-bookshelf-shelf">
                <div className="vo-book" style={{ background: '#ef4444', height: '24px' }}></div>
                <div className="vo-book" style={{ background: '#3b82f6', height: '28px' }}></div>
                <div className="vo-book" style={{ background: '#10b981', height: '22px' }}></div>
              </div>
              <div className="vo-bookshelf-shelf">
                <div className="vo-book" style={{ background: '#f59e0b', height: '26px' }}></div>
                <div className="vo-book" style={{ background: '#8b5cf6', height: '20px' }}></div>
                <div className="vo-book" style={{ background: '#ec4899', height: '25px' }}></div>
              </div>
            </div>

            {/* Whiteboard */}
            <div className="vo-whiteboard">
              <div className="vo-whiteboard-title">
                <span>METAS DA AGÊNCIA</span>
                <Sparkles size={12} color="#6366f1" />
              </div>
              <div className="vo-whiteboard-chart">
                <div className="vo-chart-bar" style={{ height: '70%', background: '#3b82f6' }} title="Leads ICP"></div>
                <div className="vo-chart-bar" style={{ height: '85%', background: '#22c55e' }} title="Pequeno Sim"></div>
                <div className="vo-chart-bar" style={{ height: '55%', background: '#8b5cf6' }} title="High Ticket"></div>
                <div className="vo-chart-bar" style={{ height: '90%', background: '#ec4899' }} title="Instagram"></div>
              </div>
            </div>

            {/* Clock */}
            <div className="vo-clock" title="Horário Atual">
              <span>{timeString || '12:00'}</span>
            </div>

            {/* Bookshelf Right */}
            <div className="vo-bookshelf">
              <div className="vo-bookshelf-shelf">
                <div className="vo-book" style={{ background: '#6366f1', height: '25px' }}></div>
                <div className="vo-book" style={{ background: '#14b8a6', height: '22px' }}></div>
              </div>
              <div className="vo-bookshelf-shelf">
                <div className="vo-book" style={{ background: '#ef4444', height: '28px' }}></div>
                <div className="vo-book" style={{ background: '#f59e0b', height: '24px' }}></div>
              </div>
            </div>
          </div>

          {/* Plant Pots at Corners */}
          <div className="vo-plant" style={{ left: '20px' }}>
            <div className="vo-plant-leaves"></div>
            <div className="vo-plant-pot"></div>
          </div>
          <div className="vo-plant" style={{ right: '20px' }}>
            <div className="vo-plant-leaves"></div>
            <div className="vo-plant-pot"></div>
          </div>

          {/* Wood Floor texture */}
          <div className="vo-floor-texture"></div>

          {/* Agent Desks Grid */}
          <div className="vo-desks-grid">
            {desks.map(desk => (
              <div
                key={desk.id}
                className="vo-desk-card"
                onClick={() => handleInspectDesk(desk)}
                title="Clique para inspecionar ou alterar o prompt do agente"
              >
                {/* Header (Name & Status) */}
                <div className="vo-desk-header">
                  <div>
                    <h3 className="vo-agent-name">{desk.name}</h3>
                    <span className="vo-agent-role">{desk.role}</span>
                  </div>
                  <span className={`vo-status-tag ${desk.status}`}>
                    {desk.status}
                  </span>
                </div>

                {/* Speech Bubble */}
                {desk.speechBubble && (
                  <div className="vo-speech-bubble">
                    {desk.speechBubble}
                  </div>
                )}

                {/* Computer Workspace (Monitor Screen) */}
                <div className="vo-computer-workspace">
                  <div className={`vo-monitor-screen ${desk.status}`}>
                    {desk.status === 'working' && (
                      <div className="vo-screen-code">
                        <div className="vo-code-line"></div>
                        <div className="vo-code-line"></div>
                        <div className="vo-code-line"></div>
                      </div>
                    )}
                    {desk.status === 'done' && (
                      <CheckCircle2 size={24} color="#4ade80" />
                    )}
                    {desk.status === 'idle' && (
                      <Clock size={20} color="#64748b" />
                    )}
                    {desk.status === 'thinking' && (
                      <Sparkles size={20} color="#facc15" className="animate-spin" />
                    )}
                  </div>
                  <div className="vo-desk-accessories">
                    <div className="vo-keyboard"></div>
                    <div className="vo-mouse"></div>
                  </div>
                </div>

                {/* Pixel Avatar Circle */}
                <div className="vo-agent-avatar-circle" style={{ borderColor: desk.color }}>
                  <span>{desk.avatar}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL DE INSPEÇÃO DO AGENTE */}
      {selectedAgent && (
        <div className="vo-modal-overlay" onClick={() => setSelectedAgent(null)}>
          <div className="vo-modal-card" onClick={e => e.stopPropagation()}>
            <div className="vo-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.75rem' }}>{selectedAgent.avatar}</span>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{selectedAgent.name}</h2>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{selectedAgent.role}</span>
                </div>
              </div>
              <button
                className="vo-btn vo-btn-secondary"
                style={{ padding: '0.4rem 0.6rem' }}
                onClick={() => setSelectedAgent(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="vo-modal-body">
              {/* Status and Metrics */}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="vo-stat-badge working">
                  <Briefcase size={14} /> Status: <strong>{selectedAgent.status.toUpperCase()}</strong>
                </div>
                <div className="vo-stat-badge done">
                  <CheckCircle2 size={14} /> Concluídas: <strong>{selectedAgent.tasksCompleted} tarefas</strong>
                </div>
              </div>

              {/* Current Task */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>
                  Tarefa Atual em Execução
                </label>
                <div style={{ padding: '0.75rem', background: 'var(--bg-muted, #f1f5f9)', borderRadius: '8px', marginTop: '0.35rem', fontWeight: 500 }}>
                  {selectedAgent.currentTask}
                </div>
              </div>

              {/* Template Selector from Agency-Agents */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Layers size={16} /> Carregar Modelo de Agente da Agência (274 disponíveis)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <select
                    className="form-select"
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                    value={selectedTemplateSlug}
                    onChange={e => setSelectedTemplateSlug(e.target.value)}
                  >
                    <option value="">Selecione um agente especialista...</option>
                    {templates.map(t => (
                      <option key={t.slug} value={t.slug}>
                        {t.emoji || '🤖'} {t.name} [{t.category.toUpperCase()}]
                      </option>
                    ))}
                  </select>
                  <button className="vo-btn vo-btn-primary" onClick={handleApplyTemplate}>
                    <RefreshCw size={16} /> Aplicar
                  </button>
                </div>
              </div>

              {/* System Prompt View */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <FileText size={16} /> Prompt de Sistema Ativo
                </label>
                <div className="vo-prompt-box">
                  {activePrompt}
                </div>
              </div>

              {/* Activity Logs */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MessageSquare size={16} /> Histórico Recente de Ações
                </label>
                <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#475569' }}>
                  {selectedAgent.logs.map((log, idx) => (
                    <li key={idx} style={{ marginBottom: '0.35rem' }}>{log}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VirtualOffice;
