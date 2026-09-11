# 📋 Plano de Operação & Checklist para Segunda-Feira (OpenWA + Sofia AI)

> **Data de Operação:** Segunda-Feira (07/09/2026)  
> **Status:** Sistema Testado, Compilado e Operacional! 🚀  
> **Foco da Campanha:** Prospecção Ativa (Oferta de Sites & Catálogos para Joalherias e Relojoarias)

---

## 🎯 Resumo da Preparação
Tudo foi deixado pronto neste domingo para garantir execução sem atritos no início da semana:
- **Backend OpenWA Engine (NestJS)**: Compilado e pronto para rodar na porta `2785`.
- **Dashboard Front-end**: Operacional em `http://localhost:5173`.
- **Extensão do Chrome**: `chrome-extension-openwa/` instalada para controle visual no WhatsApp Web.
- **Sofia AI Agent**: Configurada com buffer humanizado de 20s (`bufferDelayMs: 20000`) e tempo de digitação ajustado (`typingDelayMs: 4000`).
- **Resolução Anti-Ban & JID**: Validação automática de 9º dígito (DDD 11 vs outros DDDs) via `check-number` da Baileys.

---

## ⏰ Cronograma de Operação (Segunda-Feira)

| Período | Horário | Volume | Ação Principal | Script / Comando |
| :--- | :--- | :--- | :--- | :--- |
| **🌅 Manhã** | 08:30 - 11:30 | Base Anterior (16 leads) | **Follow-ups (Toque 2)** para reengajar quem não respondeu ao Toque 1 | `node scripts/send-followup-toque2.js` |
| **☕ Pausa** | 11:30 - 13:30 | - | Linha em descanso total (Pausa de almoço) | - |
| **☀️ Tarde 1** | 13:30 - 16:30 | 10 a 15 Novos Leads | **Novos Toques 1** (Oferta de Site/Catálogo - Abordagem Campeã) | `node scripts/send-next-site-lead.js` |
| **🌆 Tarde 2** | 16:30 - 19:30 | 10 a 15 Novos Leads | **Novos Toques 1 (Lote 2)** + Fechamento de Propostas | `node scripts/send-scheduled-batch.js` |


---

## 🚀 Passo a Passo de Execução na Segunda-Feira

### 1. ⚙️ Inicialização do Ambiente (08:00)
- [ ] Iniciar o servidor backend: `npm run start:dev` (ou `node dist/main.js`).
- [ ] Conectar/Verificar a sessão do WhatsApp na aba **Sessões** (`http://localhost:5173/sessions`).
- [ ] Abrir o WhatsApp Web e verificar o banner da extensão da **Sofia AI** (Status: 🟢 **Sofia: ATIVA**).

### 2. 📤 Execução dos Disparos e Follow-ups
- [ ] **Novos Leads**: Executar o lote de disparos:
  ```bash
  node scripts/send-scheduled-batch.js
  ```
  *(ou `node scripts/send-next-site-lead.js` para envios individuais sob controle)*
- [ ] **Follow-ups (Toque 2)**: Rodar o script de acompanhamento para contatos anteriores:
  ```bash
  node scripts/send-followup-toque2.js
  ```

### 3. 💬 Atendimento & Transição Humanizada
- [ ] Monitorar as respostas no WhatsApp Web.
- [ ] Quando o lead responder, a **Sofia AI** assume automaticamente com o buffer de 20s.
- [ ] Se o lead pedir orçamento de site personalizado, pausar a Sofia pelo botão da extensão do Chrome e assumir o fechamento.

### 4. 📊 Atualização de Logs & Obsidian (19:30)
- [ ] Executar sincronização de relatórios com o Vault do Obsidian:
  ```bash
  node scripts/sync-obsidian.js
  ```
- [ ] Revisar `LEADS_PROSPECTADOS_OBSIDIAN.md` e gerar o relatório do dia em `RELATORIO_EXECUCAO_DIA.md`.

---
*Documento preparado no Domingo para início imediato na Segunda-Feira.*
