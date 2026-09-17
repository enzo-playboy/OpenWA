# AGENTS.md

## Test commands
npm test
npm run lint

## Loop conventions
- Report-only week one (L1) before enabling auto-fix (L2)
- See LOOP.md for cadence and human gates

## 🚨 REGRAS CRÍTICAS DE PROSPECÇÃO E DISPARO DE MENSAGENS

1. **PROIBIDO ENVIAR MENSAGENS EM LOTE SEM CONFIRMAÇÃO INDIVIDUAL**:
   - NUNCA executar disparos automáticos sem aprovação prévia do usuário.

2. **INTERVALO MÍNIMO OBRIGATÓRIO DE 6 MINUTOS**:
   - Todo final de prospecção DEVE ter **pelo menos 6 minutos (360 segundos)** de intervalo entre mensagens no mesmo chip/sessão.
   - Os disparos em chips separados (`chip-2-iphone` com TOR Proxy vs `suportew` direto) podem rodar em paralelo pois utilizam IPs/redes diferentes.

3. **DIVISÃO DE NICHOS POR CHIP**:
   - 📱 **`chip-2-iphone`** (Session ID: `764ba619-c98` | Proxy TOR): Exclusivo para **Joalherias, Ouro & Semijoias**.
   - 📱 **`suportew`** (Session ID: `84e58e30-9c9` | Tel: `556596466243`): Exclusivo para **Irrigação & Soluções Hídricas Agro** + **Sementes & Nutrição Vegetal/Foliar**.

4. **LEADS EM ATENDIMENTO MANUAL (EXCLUÍDOS DE DISPAROS AUTOMÁTICOS)**:
   - `+55 11 98138-1228` (Gold Jóias - Vender Ouro) -> Sob guarda do usuário.
   - `+55 11 93053-9183` (Lapa Compro Ouro / Portal Jóias) -> Sob guarda do usuário.

