# 🔄 Fluxo Lógico de Follow-Ups (Cadência Automática)

> **Objetivo:** Documentar o funil de mensagens de prospecção para que tanto o usuário quanto os Agentes de IA entendam exatamente em qual etapa cada lead está e como a automação funciona.

---

## 🧭 Diagrama de Funil (Mermaid)

```mermaid
graph TD
    A[Lead Importado] -->|Status: pending, Step: 0| B(Toque 1: Mensagem de Abertura)
    B -->|Script de Envio Executado| C{O Lead Respondeu?}
    
    C -->|Sim| D[🤖 Sofia assume a conversa]
    D -->|Fase de Descoberta| E[Agendamento / Proposta]
    
    C -->|Não respondeu 24h| F(Toque 2: Follow-up com valor novo)
    F -->|Script Toque 2| G{O Lead Respondeu?}
    
    G -->|Sim| D
    
    G -->|Não respondeu 48h| H(Toque 3: Break-up / Fechamento de Porta)
    H -->|Script Toque 3| I{O Lead Respondeu?}
    
    I -->|Sim| D
    I -->|Não respondeu| J[❌ Lead Marcado como Perdido 'lost']
```

---

## 📊 Como o Banco de Dados (Supabase) rastreia isso?

Cada contato possui dois campos fundamentais no Supabase para gerenciar a cadência: `status` e `current_step`.

### 1️⃣ Etapa Zero (Fila Fria)
- **Status no Banco:** `pending`
- **Step no Banco:** `0`
- **O que acontece:** O lead acabou de vir do Google Maps (Apify). Ele está na fila aguardando o primeiro disparo manual ou em lote.

### 2️⃣ Toque 1 (Abertura Consultiva)
- **Status no Banco:** `contacted`
- **Step no Banco:** `1`
- **Ação:** O script envia a mensagem de abertura (ex: *"Vocês têm site ou usam só o Whats?"*).
- **Espera:** Aguardamos até 24 horas. Se o lead não responder, ele se qualifica para o Toque 2.

### 3️⃣ Toque 2 (Follow-up de 24h)
- **Status no Banco:** `contacted`
- **Step no Banco:** `2`
- **Ação:** O script `send-followup-toque2.js` filtra quem está no Step 1 e envia um follow-up **com valor novo** (ex: *"Essa semana abriu uma vaga na agenda pra montar páginas e catálogos online pra empresas da região e lembrei de vocês. Faz sentido te mostrar um exemplo do resultado?"*).
- **PROIBIDO cobrar resposta:** frases como *"Conseguiu ver a mensagem anterior?"* ou *"Tô aguardando seu retorno"* violam a Regra 5 do treinamento (ver `PROMPT_TREINAMENTO_SDR_AGENTE.md`). Todo follow-up traz informação nova, novidade ou prova social REAL, e termina com UMA pergunta (Regra 7).
- **Espera:** Aguardamos mais 24 a 48 horas. Se o lead seguir sem responder, ele vai para o Toque final.

### 4️⃣ Toque 3 (Break-up)
- **Status no Banco:** `lost` (Se não responder) ou `contacted` com `Step: 3`.
- **Ação:** O script `send-followup-toque3.js` manda a última cartada com escolha para o lead (*"Se não for o momento de criar o site ou catálogo de vocês agora, sem problema. Posso te chamar numa próxima oportunidade ou prefere que eu não te incomode mais?"*). Se ele responder a isso, a Sofia tenta reverter. Se não responder, a cadência é oficialmente encerrada para não levar ban no WhatsApp.

---

## 🤖 Intervenção da Sofia (IA)

O pulo do gato é: **Assim que o lead manda QUALQUER mensagem de volta, a cadência fria é imediatamente CANCELADA para ele.**

---

## 🛡️ Regras de Disparo (obrigatórias em TODOS os toques)

- **Intervalo mínimo de 6 minutos entre envios no mesmo chip** (AGENTS.md, regra 2). Os scripts `send-followup-toque2.js` e `send-followup-toque3.js` já aplicam 6 min + jitter de até 1 min.
- **Leads sob atendimento manual NUNCA recebem disparo automático** (AGENTS.md, regra 4): `+55 11 98138-1228` e `+55 11 93053-9183` estão na lista `PROTECTED_PHONES` dos scripts.
- **Mensagens seguem o treinamento SDR** (`PROMPT_TREINAMENTO_SDR_AGENTE.md`): nome do lead, valor novo em cada follow-up, proibido cobrar resposta (Regra 5), sempre terminar com pergunta (Regra 7).

- A Sofia (nosso agente IA configurado no `ai-agent.service.ts`) entra em ação.
- O campo `status` do lead no banco de dados muda automaticamente para `replied`.
- Ele para de receber os disparos automáticos (Toque 2 e 3) e o atendimento passa a ser 100% humanizado através da IA.
