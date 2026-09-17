# 🚒 Disaster Recovery Runbook & Simulados de DR

Este runbook orienta a execução de testes de desastre, backups diários criptografados e restauração de emergência da infraestrutura **OpenWA / Prospecção**.

---

## 1. Métricas da Política de Recuperação (RTO & RPO)

* **RTO (Recovery Time Objective)**: **< 15 Minutos** (Tempo máximo tolerável para restauração completa dos serviços).
* **RPO (Recovery Point Objective)**: **< 1 Hora** (Perda máxima de dados tolerável em caso de desastre total).

---

## 2. Procedimento de Backup Diário Criptografado

O backup é executado automaticamente pelo script [scripts/backup.sh](file:///e:/prosp/OpenWA/scripts/backup.sh) e criptografado com a chave pública GPG da organização.

### Estrutura do Arquivo de Backup:
```bash
# Execução manual de backup comprimido e criptografado
./scripts/backup.sh

# Estrutura do arquivo gerado em ./backups:
openwa_backup_YYYYMMDD_HHMMSS.tar.gz.enc
  ├── main.sqlite (Auth & Audit logs)
  ├── postgres_dump.sql (Tabelas de leads, cadências e Supabase)
  ├── sessions/ (Credenciais de conexão WhatsApp LocalAuth)
  └── baileys/ (Estado de autenticação Baileys)
```

---

## 3. Guia de Restauração de Emergência em Ambiente Limpo

### Passo 1: Provisionar o ambiente e instalar dependências
```bash
git clone https://github.com/org/openwa.git /opt/openwa
cd /opt/openwa
npm install
```

### Passo 2: Executar a Restauração de Estado
```bash
# Executa a restauração validando a integridade dos arquivos
./scripts/restore.sh ./backups/openwa_backup_latest.tar.gz.enc
```

### Passo 3: Executar o Simulado de Fumaça (DR Drill)
```bash
# Executa a validação automatizada de backup e restauração
./scripts/smoke-test-backup-restore.sh
```

---

## 4. Simulados Periódicos de DR (DR Drills)

* **Frequência**: Mensal.
* **Critério de Sucesso**:
  1. Todos os 14 testes de rotas e cadências em [cadence-routing.spec.ts](file:///e:/prosp/OpenWA/src/modules/cadence/__tests__/cadence-routing.spec.ts) devem passar.
  2. O banco de dados PostgreSQL deve recuperar 100% dos leads sem corrupção de PII.
  3. O tempo total de restauração deve ser medido e registrado abaixo de 15 minutos.
