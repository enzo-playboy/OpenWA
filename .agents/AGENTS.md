# AGENTS.md - Regras do Projeto OpenWA

## 🚨 REGRA CRÍTICA DE PROSPECÇÃO E DISPARO DE MENSAGENS

1. **PROIBIDO ENVIAR MENSAGENS EM LOTE SEM CONFIRMAÇÃO INDIVIDUAL**:
   - O assistente/agente **NUNCA** deve executar scripts de disparo automático de mensagens (WhatsApp, SMS, E-mail) em lote sem pedir permissão e aprovação prévia do usuário.
   - Solicitações como *"prepare mensagens"*, *"vamos fazer um teste A/B"* ou *"vamos ver variações"* significam apenas **planejar, estruturar e apresentar os textos ao usuário**, e NUNCA disparar direto.

2. **FLUXO OBRIGATÓRIO DE ENVIO**:
   - **Passo 1:** Apresentar a lista de leads e os textos das mensagens na tela.
   - **Passo 2:** Aguardar a autorização explícita e confirmação do usuário (lead por lead ou confirmação do lote).
   - **Passo 3:** Somente após o "OK" explícito do usuário, realizar o envio do lead autorizado.

3. **CONFIRMAÇÃO E VALIDAÇÃO**:
   - Em caso de dúvida sobre a intenção do usuário quanto a enviar vs. apenas preparar/apresentar, **SEMPRE PERGUNTAR E AGUARDAR CONFIRMAÇÃO**.
