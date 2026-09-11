import { useState } from 'react';
import { Filter, TrendingUp, Users, Target, CheckCircle2, MessageCircle, Database, Settings2, RefreshCw } from 'lucide-react';
import { useFunnelStatsQuery } from '../hooks/queries';
import './LeadFunnel.css';

type FunnelPeriod = 'all' | '30d' | '7d' | 'today';

interface LeadStageData {
  id: string;
  stageNumber: number;
  name: string;
  description: string;
  icon: typeof Users;
  count: number;
  conversionRate: string;
  cssClass: string;
}

export function LeadFunnel() {
  const [period, setPeriod] = useState<FunnelPeriod>('all');
  const [lowTicketPrice, setLowTicketPrice] = useState<number>(350);
  const [highTicketPrice, setHighTicketPrice] = useState<number>(2500);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // Real backend DB & Supabase query
  const { data: realStats, isLoading, isRefetching, refetch } = useFunnelStatsQuery();

  // If real data is fetched from DB, calculate real stage counts
  const prospectados = realStats?.prospectados ?? 0;
  const enviados = realStats?.enviados ?? 0;
  const responded = realStats?.responded ?? 0;
  const proposta = realStats?.proposta ?? 0;
  const fechados = realStats?.fechados ?? 0;

  const maxCount = prospectados > 0 ? prospectados : 1;

  // Real pipeline & revenue calculations
  const estimatedRevenue = fechados * highTicketPrice + responded * lowTicketPrice;
  const pipelineValue = proposta * highTicketPrice + (responded - proposta > 0 ? (responded - proposta) * lowTicketPrice : 0);
  const globalConversion = prospectados > 0 ? ((fechados / prospectados) * 100).toFixed(1) : '0.0';

  const stages: LeadStageData[] = [
    {
      id: 'prospectados',
      stageNumber: 1,
      name: '1. Leads Prospectados (Frio)',
      description: 'Leads cadastrados na base de prospecção / Supabase',
      icon: Users,
      count: prospectados,
      conversionRate: '100%',
      cssClass: 'stage-1',
    },
    {
      id: 'enviados',
      stageNumber: 2,
      name: '2. Em Cadência (Outbound)',
      description: 'Disparos / Mensagens iniciadas no WhatsApp',
      icon: MessageCircle,
      count: enviados,
      conversionRate: prospectados > 0 ? `${((enviados / prospectados) * 100).toFixed(1)}%` : '0%',
      cssClass: 'stage-2',
    },
    {
      id: 'responded',
      stageNumber: 3,
      name: '3. "Pequeno Sim" (Microcompromisso)',
      description: 'Respostas / Leads em agendamento ou Low-Ticket',
      icon: Target,
      count: responded,
      conversionRate: enviados > 0 ? `${((responded / enviados) * 100).toFixed(1)}%` : '0%',
      cssClass: 'stage-3',
    },
    {
      id: 'proposta',
      stageNumber: 4,
      name: '4. Diagnóstico & Proposta Site',
      description: 'Leads em proposta do site principal (High-Ticket)',
      icon: TrendingUp,
      count: proposta,
      conversionRate: responded > 0 ? `${((proposta / responded) * 100).toFixed(1)}%` : '0%',
      cssClass: 'stage-4',
    },
    {
      id: 'fechados',
      stageNumber: 5,
      name: '5. Cliente Fechado (Venda)',
      description: 'Contratos fechados e faturados',
      icon: CheckCircle2,
      count: fechados,
      conversionRate: proposta > 0 ? `${((fechados / proposta) * 100).toFixed(1)}%` : '0%',
      cssClass: 'stage-5',
    },
  ];

  return (
    <section className="lead-funnel-section">
      <div className="funnel-header">
        <div className="funnel-title-area">
          <div className="funnel-title-icon">
            <Filter size={20} />
          </div>
          <div>
            <h2>Funil de Vendas & Prospecção (Dados Reais)</h2>
            <span className="funnel-subtitle">
              Métricas reais consolidadas do banco de dados e Supabase
            </span>
          </div>
        </div>

        <div className="funnel-controls">
          <span className="db-status-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, background: realStats?.supabaseConfigured ? 'rgba(37, 211, 102, 0.15)' : 'rgba(59, 130, 246, 0.15)', color: realStats?.supabaseConfigured ? '#25d366' : '#3b82f6', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Database size={14} />
            {realStats?.supabaseConfigured ? 'Supabase Conectado' : 'Banco de Dados Local'}
          </span>

          <button
            className="funnel-period-btn"
            onClick={() => void refetch()}
            title="Atualizar dados em tempo real"
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />
            {isRefetching ? 'Atualizando...' : 'Atualizar'}
          </button>

          <button
            className={`funnel-period-btn ${showConfig ? 'active' : ''}`}
            onClick={() => setShowConfig(!showConfig)}
            title="Configurar valores dos contratos de site"
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Settings2 size={14} />
            Valores
          </button>

          <button
            className={`funnel-period-btn ${period === 'all' ? 'active' : ''}`}
            onClick={() => setPeriod('all')}
          >
            Real
          </button>
        </div>
      </div>

      {/* Contract Value Settings Dropdown */}
      {showConfig && (
        <div style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--border, #334155)', borderRadius: '12px', padding: '1rem', marginBottom: '1.25rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '4px' }}>
              Valor Low-Ticket (Pequeno Sim - Ex: R$ 350)
            </label>
            <input
              type="number"
              value={lowTicketPrice}
              onChange={e => setLowTicketPrice(Number(e.target.value) || 0)}
              style={{ background: 'var(--bg-card, #1e293b)', border: '1px solid var(--border, #334155)', color: '#fff', padding: '6px 12px', borderRadius: '8px', width: '140px', fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', display: 'block', marginBottom: '4px' }}>
              Valor High-Ticket (Site Completo - Ex: R$ 2.500)
            </label>
            <input
              type="number"
              value={highTicketPrice}
              onChange={e => setHighTicketPrice(Number(e.target.value) || 0)}
              style={{ background: 'var(--bg-card, #1e293b)', border: '1px solid var(--border, #334155)', color: '#fff', padding: '6px 12px', borderRadius: '8px', width: '140px', fontSize: '0.85rem' }}
            />
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', flex: 1 }}>
            Estes valores calculam a estimativa do pipeline comercial com base nos contratos reais do seu negócio.
          </span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="funnel-summary-cards">
        <div className="funnel-summary-card">
          <span className="label">Total Prospectados</span>
          <span className="val">{isLoading ? '...' : prospectados.toLocaleString()}</span>
          <span className="subtext">Leads reais no banco</span>
        </div>
        <div className="funnel-summary-card">
          <span className="label">Taxa Global de Conversão</span>
          <span className="val highlight">{isLoading ? '...' : `${globalConversion}%`}</span>
          <span className="subtext">Lead Frio ➔ Cliente Fechado</span>
        </div>
        <div className="funnel-summary-card">
          <span className="label">Pipeline de Oportunidades</span>
          <span className="val">R$ {pipelineValue.toLocaleString('pt-BR')}</span>
          <span className="subtext">Em negociação no funil</span>
        </div>
        <div className="funnel-summary-card">
          <span className="label">Faturamento Fechado</span>
          <span className="val highlight">R$ {estimatedRevenue.toLocaleString('pt-BR')}</span>
          <span className="subtext">Contratos convertidos</span>
        </div>
      </div>

      {/* Visual Funnel Stages */}
      <div className="funnel-visualization">
        {stages.map(st => {
          const Icon = st.icon;
          const percentageWidth = prospectados > 0 ? Math.max(6, Math.round((st.count / maxCount) * 100)) : 0;

          return (
            <div key={st.id} className={`funnel-stage-row ${st.cssClass}`}>
              <div className="stage-info">
                <div className="stage-badge">
                  <Icon size={18} />
                </div>
                <div className="stage-text">
                  <h4>{st.name}</h4>
                  <p>{st.description}</p>
                </div>
              </div>

              <div className="stage-bar-container">
                <div className="stage-bar-fill" style={{ width: `${percentageWidth}%` }} />
                <span className="stage-count-inline">{isLoading ? '...' : `${st.count.toLocaleString()} leads`}</span>
              </div>

              <div className="stage-metrics">
                <span className="stage-conversion">{st.conversionRate}</span>
                <span className="stage-conversion-label">
                  {st.stageNumber === 1 ? 'Base Total' : 'Taxa da Etapa'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
