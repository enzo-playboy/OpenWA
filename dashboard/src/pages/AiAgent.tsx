import { useState, useEffect } from 'react';
import { Bot, Save, Plus, Trash2, Send, Cpu, BookOpen, MessageSquare, History, CheckCircle, AlertCircle } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { API_BASE_URL, getAuthHeaders } from '../services/api';
import './AiAgent.css';

interface AiConfig {
  id?: string;
  name: string;
  provider: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  autoReplyOnLeadMessage: boolean;
  autoReplyOnCadenceReply: boolean;
  typingDelayMs: number;
  customApiKey?: string | null;
}

interface KnowledgeItem {
  id?: string;
  title: string;
  category: string;
  content: string;
  isActive: boolean;
  createdAt?: string;
}

interface AiLog {
  id: string;
  sessionId: string;
  chatId: string;
  userMessage: string;
  aiResponse: string;
  model: string;
  tokensUsed: number;
  durationMs: number;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
}

export default function AiAgent() {
  const [activeTab, setActiveTab] = useState<'config' | 'knowledge' | 'playground' | 'logs'>('config');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Config state
  const [config, setConfig] = useState<AiConfig>({
    name: 'Agente de Vendas IA',
    provider: 'openrouter',
    systemPrompt: 'Você é um assistente de vendas altamente capacitado. Responda em português do Brasil de forma amigável, transparente e perspicaz.',
    model: 'google/gemini-2.5-flash-free',
    temperature: 0.7,
    maxTokens: 500,
    enabled: true,
    autoReplyOnLeadMessage: true,
    autoReplyOnCadenceReply: true,
    typingDelayMs: 2000,
    customApiKey: '',
  });

  // Knowledge base state
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Geral');
  const [newContent, setNewContent] = useState('');

  // Playground state
  const [testPrompt, setTestPrompt] = useState('');
  const [playgroundOutput, setPlaygroundOutput] = useState('');
  const [testing, setTesting] = useState(false);

  // Logs state
  const [logs, setLogs] = useState<AiLog[]>([]);

  useEffect(() => {
    fetchConfig();
    fetchKnowledge();
    fetchLogs();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/ai-agent/config`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error('Failed to fetch AI config:', err);
    }
  };

  const fetchKnowledge = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/ai-agent/knowledge`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setKnowledgeList(data);
      }
    } catch (err) {
      console.error('Failed to fetch knowledge:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/ai-agent/logs`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setLogs(data);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ai-agent/config`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(config),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Configurações da IA salvas com sucesso!' });
      } else {
        throw new Error('Falha ao salvar configurações');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao salvar' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddKnowledge = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/ai-agent/knowledge`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: newTitle,
          category: newCategory,
          content: newContent,
          isActive: true,
        }),
      });
      if (res.ok) {
        setNewTitle('');
        setNewContent('');
        fetchKnowledge();
        setMessage({ type: 'success', text: 'Novo conhecimento adicionado com sucesso!' });
      }
    } catch (err) {
      console.error('Failed to add knowledge:', err);
    }
  };

  const handleDeleteKnowledge = async (id?: string) => {
    if (!id) return;
    try {
      const res = await fetch(`${API_BASE_URL}/ai-agent/knowledge/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        fetchKnowledge();
      }
    } catch (err) {
      console.error('Failed to delete knowledge:', err);
    }
  };

  const handleTestAi = async () => {
    if (!testPrompt.trim()) return;
    setTesting(true);
    setPlaygroundOutput('');
    try {
      const res = await fetch(`${API_BASE_URL}/ai-agent/test`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ message: testPrompt }),
      });
      if (res.ok) {
        const data = await res.json();
        setPlaygroundOutput(data.response);
      } else {
        const errText = await res.text();
        setPlaygroundOutput(`Erro ao testar IA: ${errText}`);
      }
    } catch (err: any) {
      setPlaygroundOutput(`Erro na requisição: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="ai-agent-container">
      <PageHeader
        title="Treinamento & Agente de IA Nativo"
        subtitle="Configure a inteligência da sua conta, adicione regras de produtos e treine o bot para responder seus leads automaticamente."
      />

      {message && (
        <div className={`ai-alert ${message.type}`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Tabs Menu */}
      <div className="ai-tabs">
        <button
          className={`ai-tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          <Cpu size={18} />
          Configurações da IA
        </button>
        <button
          className={`ai-tab-btn ${activeTab === 'knowledge' ? 'active' : ''}`}
          onClick={() => setActiveTab('knowledge')}
        >
          <BookOpen size={18} />
          Base de Conhecimento ({knowledgeList.length})
        </button>
        <button
          className={`ai-tab-btn ${activeTab === 'playground' ? 'active' : ''}`}
          onClick={() => setActiveTab('playground')}
        >
          <MessageSquare size={18} />
          Testador (Playground)
        </button>
        <button
          className={`ai-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('logs');
            fetchLogs();
          }}
        >
          <History size={18} />
          Logs de Respostas
        </button>
      </div>

      {/* TAB 1: CONFIGURAÇÃO */}
      {activeTab === 'config' && (
        <div className="ai-card">
          <h3><Bot className="icon" /> Parâmetros Principais da IA</h3>

          <div className="ai-form-group">
            <label>Status do Agente no WhatsApp</label>
            <div className="ai-checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                />
                Ativar Agente de IA (Geral)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={config.autoReplyOnLeadMessage}
                  onChange={(e) => setConfig({ ...config, autoReplyOnLeadMessage: e.target.checked })}
                />
                Responder mensagens recebidas de Leads automaticamente
              </label>
            </div>
          </div>

          <div className="ai-form-row">
            <div className="ai-form-group">
              <label>Provedor / API</label>
              <select
                value={config.provider}
                onChange={(e) => setConfig({ ...config, provider: e.target.value })}
              >
                <option value="openrouter">OpenRouter (Grátis / Vários Modelos)</option>
                <option value="opencode">Opencode API</option>
                <option value="openai">OpenAI (Oficial)</option>
                <option value="gemini">Google Gemini API</option>
              </select>
            </div>

            <div className="ai-form-group">
              <label>Modelo da IA</label>
              <input
                type="text"
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                placeholder="Ex: google/gemini-2.5-flash-free ou gpt-4o-mini"
              />
            </div>
          </div>

          <div className="ai-form-group">
            <label>Prompt do Sistema (Persona & Instruções Principais)</label>
            <textarea
              rows={5}
              value={config.systemPrompt}
              onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
              placeholder="Descreva como a IA deve se comportar, qual o tom de voz e como ela deve vender seus produtos..."
            />
          </div>

          <div className="ai-form-group">
            <label>Chave de API Personalizada (Opcional - caso não queira usar a do .env)</label>
            <input
              type="password"
              value={config.customApiKey || ''}
              onChange={(e) => setConfig({ ...config, customApiKey: e.target.value })}
              placeholder="Cole sua API Key sk-..."
            />
          </div>

          <button className="ai-btn-primary" onClick={handleSaveConfig} disabled={loading}>
            <Save size={18} /> {loading ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      )}

      {/* TAB 2: BASE DE CONHECIMENTO */}
      {activeTab === 'knowledge' && (
        <div className="ai-card">
          <h3><BookOpen className="icon" /> Treinamento & Base de Conhecimento</h3>
          <p className="ai-subtitle">Cadastre regras de negócio, informações de produtos e FAQs para a IA consultar antes de responder.</p>

          {/* Form para novo conhecimento */}
          <div className="ai-knowledge-add-box">
            <h4>Adicionar Novo Conhecimento</h4>
            <div className="ai-form-row">
              <input
                type="text"
                placeholder="Título (ex: Preço do Produto X)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <input
                type="text"
                placeholder="Categoria (ex: Produtos, FAQ, Preços)"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
            </div>
            <textarea
              rows={3}
              placeholder="Conteúdo detalhado das regras/informações..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
            />
            <button className="ai-btn-secondary" onClick={handleAddKnowledge}>
              <Plus size={18} /> Adicionar Conhecimento
            </button>
          </div>

          {/* Lista de conhecimentos */}
          <div className="ai-knowledge-list">
            {knowledgeList.length === 0 ? (
              <p className="ai-empty">Nenhum conhecimento cadastrado. Adicione o primeiro item acima!</p>
            ) : (
              knowledgeList.map((item) => (
                <div key={item.id} className="ai-knowledge-item">
                  <div className="ai-knowledge-header">
                    <span className="ai-badge">{item.category}</span>
                    <strong>{item.title}</strong>
                    <button className="ai-btn-delete" onClick={() => handleDeleteKnowledge(item.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <p className="ai-knowledge-content">{item.content}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PLAYGROUND */}
      {activeTab === 'playground' && (
        <div className="ai-card">
          <h3><MessageSquare className="icon" /> Testador de Respostas da IA</h3>
          <p className="ai-subtitle">Simule uma mensagem de um cliente para testar como a IA responderá com base nas regras cadastradas.</p>

          <div className="ai-form-group">
            <label>Mensagem de Teste (Como se fosse o Cliente)</label>
            <input
              type="text"
              placeholder="Ex: Quanto custa o plano mensal e como funciona o suporte?"
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTestAi()}
            />
          </div>

          <button className="ai-btn-primary" onClick={handleTestAi} disabled={testing}>
            <Send size={18} /> {testing ? 'Gerando Resposta...' : 'Enviar Teste'}
          </button>

          {playgroundOutput && (
            <div className="ai-playground-result">
              <h4>Resposta da IA:</h4>
              <div className="ai-reply-box">{playgroundOutput}</div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: LOGS */}
      {activeTab === 'logs' && (
        <div className="ai-card">
          <h3><History className="icon" /> Histórico de Atendimentos por IA</h3>

          <div className="ai-table-container">
            <table className="ai-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Chat ID</th>
                  <th>Mensagem do Cliente</th>
                  <th>Resposta Gerada</th>
                  <th>Modelo</th>
                  <th>Duração</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center">Nenhum log de atendimento gravado ainda.</td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.createdAt).toLocaleString('pt-BR')}</td>
                      <td>{log.chatId}</td>
                      <td className="text-truncate">{log.userMessage}</td>
                      <td className="text-truncate">{log.aiResponse || log.errorMessage}</td>
                      <td><span className="ai-badge">{log.model}</span></td>
                      <td>{log.durationMs}ms</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
