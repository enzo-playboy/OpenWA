import { useState } from 'react';
import { Filter, TrendingUp, Users, Target, CheckCircle2, MessageCircle } from 'lucide-react';
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
  const [period, setPeriod] = useState<FunnelPeriod>('30d');

  // Simulated metrics reflecting OpenWA prospecção & "Pequeno Sim" methodology data
  const getStageCounts = (selectedPeriod: FunnelPeriod) => {
    switch (selectedPeriod) {
      case 'today':
        return { prospectados: 35, enviados: 28, responded: 9, proposta: 4, fechados: 2 };
      case '7d':
        return { prospectados: 180, enviados: 155, responded: 54, proposta: 22, fechados: 9 };
      case '30d':
        return { prospectados: 650, enviados: 580, responded: 210, proposta: 85, fechados: 34 };
      case 'all':
      default:
        return { prospectados: 1420, enviados: 1290, responded: 485, proposta: 195, fechados: 78 };
    }
  };

  const counts = getStageCounts(period);
  const maxCount = counts.prospectados || 1;

  // Ticket values for methodology forecasting (Low ticket ~ R$350, High ticket ~ R$2.500)
  const estimatedRevenue = counts.fechados * 2500;
  const pipelineValue = counts.proposta * 2500 + counts.responded * 350;
  const globalConversion = ((counts.fechados / (counts.prospectados || 1)) * 100).toFixed(1);

  const stages: LeadStageData[] = [
    {
      id: 'prospectados',
      stageNumber: 1,
      name: '1. Leads Prospectados (Frio)',
      description: 'Leads capturados via Apify / Google Maps',
      icon: Users,
      count: counts.prospectados,
      conversionRate: '100%',
      cssClass: 'stage-1',
    },
    {
      id: 'enviados',
      stageNumber: 2,
      name: '2. Em Cadência (Outbound)',
      description: 'Mensagens / Toque 1 disparados via WhatsApp',
      icon: MessageCircle,
      count: counts.enviados,
      conversionRate: `${((counts.enviados / counts.prospectados) * 100).toFixed(1)}%`,
      cssClass: 'stage-2',
    },
    {
      id: 'responded',
      stageNumber: 3,
      name: '3. "Pequeno Sim" (Microcompromisso)',
      description: 'Lead respondeu / Aceitou análise ou serviço Low-Ticket',
      icon: Target,
      count: counts.responded,
      conversionRate: `${((counts.responded / counts.enviados) * 100).toFixed(1)}%`,
      cssClass: 'stage-3',
    },
    {
      id: 'proposta',
      stageNumber: 4,
      name: '4. Diagnóstico & Proposta Site',
      description: 'Transição para oferta do site completo (High-Ticket)',
      icon: TrendingUp,
      count: counts.proposta,
      conversionRate: `${((counts.proposta / counts.responded) * 100).toFixed(1)}%`,
      cssClass: 'stage-4',
    },
    {
      id: 'fechados',
      stageNumber: 5,
      name: '5. Cliente Fechado (Venda)',
      description: 'Contrato assinado & projeto iniciado',
      icon: CheckCircle2,
      count: counts.fechados,
      conversionRate: `${((counts.fechados / counts.proposta) * 100).toFixed(1)}%`,
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
            <h2>Funil de Vendas & Prospecção (Pequeno Sim)</h2>
            <span className="funnel-subtitle">
              Acompanhamento de conversão da régua de disparos e evolução dos leads
            </span>
          </div>
        </div>

        <div className="funnel-controls">
          <button
            className={`funnel-period-btn ${period === 'today' ? 'active' : ''}`}
            onClick={() => setPeriod('today')}
          >
            Hoje
          </button>
          <button
            className={`funnel-period-btn ${period === '7d' ? 'active' : ''}`}
            onClick={() => setPeriod('7d')}
          >
            Últimos 7 dias
          </button>
          <button
            className={`funnel-period-btn ${period === '30d' ? 'active' : ''}`}
            onClick={() => setPeriod('30d')}
          >
            Últimos 30 dias
          </button>
          <button
            className={`funnel-period-btn ${period === 'all' ? 'active' : ''}`}
            onClick={() => setPeriod('all')}
          >
            Geral
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="funnel-summary-cards">
        <div className="funnel-summary-card">
          <span className="label">Total Prospectados</span>
          <span className="val">{counts.prospectados.toLocaleString()}</span>
          <span className="subtext">Leads na base comercial</span>
        </div>
        <div className="funnel-summary-card">
          <span className="label">Taxa Global de Conversão</span>
          <span className="val highlight">{globalConversion}%</span>
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
          <span className="subtext">Projetos convertidos</span>
        </div>
      </div>

      {/* Visual Funnel Stages */}
      <div className="funnel-visualization">
        {stages.map(st => {
          const Icon = st.icon;
          const percentageWidth = Math.max(8, Math.round((st.count / maxCount) * 100));

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
                <span className="stage-count-inline">{st.count.toLocaleString()} leads</span>
              </div>

              <div className="stage-metrics">
                <span className="stage-conversion">{st.conversionRate}</span>
                <span className="stage-conversion-label">
                  {st.stageNumber === 1 ? 'Alcance Total' : 'Taxa da Etapa'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
