# ☁️ Guia de Configuração VPS Oracle Cloud - OpenWA 24/7

> **Objetivo:** Subir o OpenWA + Sofia AI + Bot do Telegram para rodar 24 horas por dia na nuvem (Oracle Cloud Always Free), 100% independente do computador estar ligado.

---

## 📋 Passo 1: Criar a Instância VPS na Oracle Cloud

1. Acesse **[cloud.oracle.com](https://cloud.oracle.com)**.
2. Vá em **Compute** ➔ **Instances** (Instâncias).
3. Se houver alguma instância antiga com erro, clique nos 3 pontinhos `...` ➔ **Terminate** (marcando para deletar o boot volume).
4. Clique no botão azul **Create Instance**:
   - **Name:** `openwa-server`
   - **Image and Shape:** 
     - Clique em **Edit** ➔ **Change Shape** ➔ Selecione **Ampere (ARM)**.
     - Escolha a forma **`VM.Standard.A1.Flex`** (Selo Always Free).
     - Configure para **2 OCPUs** e **12 GB de RAM**.
   - **Add SSH Keys (Muito Importante!):**
     - Selecione **Generate a key pair for me**.
     - Clique em **Save private key** (Salvar chave privada `.key`).
     - Clique em **Save public key** (Salvar chave pública `.key.pub`).
   - Clique em **Create** no final da página.

---

## 🛡️ Passo 2: Liberar as Portas da Rede (Ingress Rules)

1. No menu principal da Oracle, vá em **Networking** ➔ **Virtual Cloud Networks**.
2. Clique na sua VCN (`vcn-...`) ➔ Clique na Subnet (`subnet-...`).
3. Clique em **Default Security List**.
4. Clique no botão **Add Ingress Rules**:
   - **Source Type:** `CIDR`
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** `TCP`
   - **Source Port Range:** *(deixe totalmente em branco)*
   - **Destination Port Range:** `2785-5173`
   - Clique em **Add Ingress Rules**.

---

## 💻 Passo 3: Conectar via Terminal SSH (Windows)

Abra o **PowerShell** no seu computador e rode o comando (ajustando para o IP público que a Oracle gerou):

```powershell
ssh -i "C:\Users\USER\Downloads\ssh-key-*.key" ubuntu@IP_PUBLICO_DA_ORACLE
```

---

## 🚀 Passo 4: Instalar e Subir o OpenWA na Nuvem

Dentro do terminal do Ubuntu na nuvem, rodaremos os comandos:

```bash
# 1. Atualizar sistema e instalar Node.js 20 + Git + PM2
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential
sudo npm install -g pm2

# 2. Clonar o projeto e instalar dependências
git clone <URL_DO_SEU_REPOSITORIO> OpenWA
cd OpenWA
npm install
npm run build

# 3. Iniciar o OpenWA 24/7 com PM2
pm2 start dist/main.js --name "openwa"
pm2 start scripts/telegram-bot.js --name "telegram-bot"
pm2 save
pm2 startup
```

---

📌 **Tudo pronto!** Amanhã quando acordar, é só me chamar aqui no chat que faremos essa etapa juntos em poucos minutos! Bom descanso! 😴💤
