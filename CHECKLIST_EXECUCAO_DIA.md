# 📋 Checklist de Execução Diária (3 Lotes & Regra de Delay Anti-Ban)

> **Projeto:** OpenWA + Flowra Labs  
> **Objetivo:** Executar disparos em 3 lotes ao longo do dia com delay dinâmico para garantir segurança máxima contra bloqueio de chip.

---

## ⏰ CRONOGRAMA DOS 3 LOTES DE DISPOSIÇÃO (DIA 1)

Para proteger a linha e parecer 100% humano, o dia será dividido em **3 lotes de envio**, com intervalos de descanso para a linha:

### 🌅 Lote 1 (Manhã): 08:00 - 11:30
- **Volume do Lote:** 10 a 15 disparos.
- **Delay entre mensagens:** Intervalo dinâmico/aleatório (ex: 5 a 12 minutos entre cada envio).
- **Acompanhamento:** Tirar dúvidas e observar respostas da manhã.

---

### ☀️ Lote 2 (Tarde 1): 13:30 - 16:30
- **Pausa de Almoço:** Linha totalmente descansada entre 11:30 e 13:30.
- **Volume do Lote:** 10 a 15 disparos.
- **Delay entre mensagens:** Intervalo dinâmico/aleatório (ex: 6 a 15 minutos entre cada envio).

---

### 🌆 Lote 3 (Tarde 2 / Noite): 16:30 - 19:30
- **Volume do Lote:** 10 a 15 disparos (último lote do dia).
- **Delay entre mensagens:** Intervalo dinâmico/aleatório (ex: 8 a 15 minutos entre cada envio).
- **Fechamento:** Atendimento final do dia até às 19:30.

---

## 🎲 REGRA DO DELAY DINÂMICO (ANTI-BAN)

- **Como funciona:** O robô nunca dispara várias mensagens em sequência imediata.
- **Cálculo da Pausa:** Cada envio aguarda um tempo variável (ex: se o delay base for 6, multiplica-se para gerar uma espera humana aleatória entre 5 e 12 minutos antes do próximo envio).
- **Resultado:** O WhatsApp enxerga um comportamento 100% humano (uma pessoa que manda 1 mensagem, conversa com alguém, espera alguns minutos e depois manda outra).

---

## 📋 CHECKLIST DE PASSO A PASSO NO DIA (.md)

- [ ] **08:00 - Configuração Inicial**
  - [ ] Verificar WhatsApp Conectado no `/sessions`.
  - [ ] Confirmar o System Prompt Humanizado em [PROMPT_SISTEMA_HUMANIZADO.md](file:///e:/prosp/OpenWA/PROMPT_SISTEMA_HUMANIZADO.md).
  - [ ] Ativar a Cadência com o Spintax da Opção 3.

- [ ] **08:30 às 11:30 - Rodar LOTE 1 (Manhã)**
  - [ ] Subir 12 a 15 leads no lote da manhã.
  - [ ] Acompanhar a Sofia respondendo quem confirmar ser o dono.

- [ ] **11:30 às 13:30 - Pausa de Almoço / Descanso da Linha**

- [ ] **13:30 às 16:30 - Rodar LOTE 2 (Tarde 1)**
  - [ ] Subir mais 12 a 15 leads no lote da tarde.

- [ ] **16:30 às 19:30 - Rodar LOTE 3 (Tarde 2 / Noite)**
  - [ ] Subir os últimos 12 a 15 leads do dia.
  - [ ] Encerrar os atendimentos e fazer balanço de propostas de sites geradas.
