# AGENTS.md - Regras do Projeto OpenWA

## 🚨 REGRA CRÍTICA DE PROSPECÇÃO E DISPARO DE MENSAGENS

1. **PROIBIDO ENVIAR MENSAGENS EM LOTE SEM CONFIRMAÇÃO INDIVIDUAL**:
   - O assistente/agente **NUNCA** deve executar scripts de disparo automático de mensagens (WhatsApp, SMS, E-mail) em lote sem pedir permissão e aprovação prévia do usuário.
   - Solicitações como *"prepare mensagens"*, *"vamos fazer um teste A/B"* ou *"vamos ver variações"* significam apenas **planejar, estruturar e apresentar os textos ao usuário**, e NUNCA disparar direto.

2. **FLUXO OBRIGATÓRIO DE ENVIO**:
   - **Passo 1:** Apresentar a lista de leads e os textos das mensagens na tela.
   - **Passo 2:** Aguardar a autorização explícita e confirmação do usuário (lead por lead ou confirmação do lote).
   - **Passo 3:** Somente após o "OK" explícito do usuário, realizar o envio do lead autorizado.

3. **INTERVALO MÍNIMO ENTRE DISPAROS (REGRA OBRIGATÓRIA DE TEMPO)**:
   - Todo final de prospecção deve ter **pelo menos 6 minutos (360 segundos)** de intervalo entre uma mensagem e outra no mesmo chip/sessão.
   - **Operação Simultânea Multichip via Proxy:** O Chip 1 (`suportew`) e o Chip 2 (`chip-2-iphone` com Auto TOR Proxy) podem prospectar em paralelo ao mesmo tempo, pois o Chip 2 utiliza rotador automático de IP/proxy (redes isoladas). Porém, cada chip individualmente deve respeitar a pausa mínima de 6 minutos entre seus próprios disparos.

4. **MAPEAMENTO DE NICHOS E CHIPS**:
   - 📱 **`chip-2-iphone`** (Session ID: `764ba619-c98` | Proxy TOR): Exclusivo para o nicho de **Joalherias, Ouro & Semijoias**.
   - 📱 **`suportew`** (Session ID: `84e58e30-9c9` | Tel: `556596466243`): Exclusivo para novos nichos agrícolas (**Irrigação & Soluções Hídricas Agro** + **Sementes & Nutrição Vegetal/Foliar**).

5. **CONTATOS EM ATENDIMENTO MANUAL (SOB GUARDA DO USUÁRIO)**:
   - `+55 11 98138-1228` (Gold Jóias - Vender Ouro) -> Conversa manual ativa (Usuário).
   - `+55 11 93053-9183` (Lapa Compro Ouro / Portal Jóias) -> Demo enviada / Negociação ativa (Usuário).
   - *Nunca enviar disparos automáticos para estes números.*

6. **CONFIRMAÇÃO E VALIDAÇÃO**:
   - Em caso de dúvida sobre a intenção do usuário quanto a enviar vs. apenas preparar/apresentar, **SEMPRE PERGUNTAR E AGUARDAR CONFIRMAÇÃO**.

