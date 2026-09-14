# 🚀 GUIA RÁPIDO DE INICIALIZAÇÃO DIÁRIA DO OPENWA & REDE PROXY/TOR

Este documento é o manual oficial de inicialização diária do ecossistema **OpenWA**, cobrindo o servidor backend, o dashboard, a rede de rotacionamento de IP (Auto-TOR/ProtonVPN) e o gerenciamento multi-chip.

---

## 📋 PASSO A PASSO DE INICIALIZAÇÃO (ORDEM DE EXECUÇÃO)

### 1️⃣ PASSO 1: Ligar a ProtonVPN (Opcional - Mudar Localização Global)
> Altera o IP de saída principal do seu computador antes de ligar os WhatsApps.

1. Abra o aplicativo da **ProtonVPN** no Windows.
2. Escolha o país desejado (ex: *Brasil*, *Estados Unidos*, *Argentina*) e clique em **Quick Connect**.

---

### 2️⃣ PASSO 2: Iniciar o Servidor OpenWA & Dashboard Web
> O servidor e o dashboard podem ser iniciados juntos com um único comando na raiz do projeto.

Abra o terminal na pasta do projeto (`E:\prosp\OpenWA`) e execute:

```powershell
npm run dev
```

- **Backend NestJS API**: `http://localhost:2785` (ou porta configurada no `.env`)
- **Dashboard Web / CRM Kanban**: `http://localhost:5173` (ou porta exibida pelo Vite)

---

### 3️⃣ PASSO 3: Iniciar o Rotacionador de IP Auto-TOR
> Mantém o IP da porta SOCKS5 do Tor sendo trocado continuamente para proteger seus números secundários.

Em um **novo terminal** na pasta raiz do projeto (`E:\prosp\OpenWA`), execute:

```powershell
python Auto_Tor_IP_changer/autoTOR_win.py
```

- Quando solicitado:
  - **Intervalo de rotação em SEGUNDOS**: Digite `30` (ou apenas pressione **ENTER** para o padrão).
- **O que faz**: Alterna o IP da porta `socks5://127.0.0.1:9050` automaticamente a cada 30 segundos!

---

### 4️⃣ PASSO 4: Aplicar o Roteamento de Proxy por Chip (Multi-Chip)
> Vincula a sessão de cada chip ao seu respetivo canal de rede (IP Direto ou TOR).

Em um **novo terminal** na pasta raiz do projeto (`E:\prosp\OpenWA`), execute:

```powershell
npx ts-node scripts/auto-tor-proxy-router.ts
```

**Mapeamento aplicado automaticamente:**
- 📱 **Chip 1 (Principal - `session-01`)**: IP Direto / ProtonVPN Global
- 📱 **Chip 2 (Apoio - `session-02`)**: Proxy TOR SOCKS5 (`127.0.0.1:9050`)
- 📱 **Chip 3 (Agro Target - `session-03`)**: Proxy TOR SOCKS5 (`127.0.0.1:9052`)

---

## ⚡ COMANDOS ÚTEIS DE SUPORTE E MANUTENÇÃO

### 🔎 Recarregar / Atualizar os 110 Leads no Supabase com OSINT Go Engine:
```powershell
go run cmd/osint-engine/main.go
```

### 🦅 Rodar a Ponte de Validação do EagleOSINT:
```powershell
npx ts-node scripts/eagle-osint-bridge.ts
```

### 📊 Listar os Leads no Supabase via Terminal:
```powershell
node scripts/list-30-leads.js
```

---

## 🛡️ REGRAS DE SEGURANÇA E BLOQUEIO MULTI-CHIP (LEMBRE-SE!)

1. ⛔ **Proibido Enviar em Massa Sem Confirmação**: O envio de mensagens deve ser aprovado **lead por lead** no CRM Kanban.
2. 🔒 **Trava de Atendimento Exclusivo**: Se um lead for ativado pelo **Chip 1**, o sistema **bloqueia automaticamente** os Chips 2 e 3 de enviarem mensagens para o mesmo lead (impedindo duplicação e queimada de chip).
