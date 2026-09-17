# 📜 Acordo de Tratamento de Dados Pessoais (Data Processing Agreement - DPA)

**Em conformidade com o Artigo 39 da Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 - LGPD)**

---

## 1. As Partes

* **CONTROLADOR DE DADOS**: A pessoa natural ou jurídica de direito público ou privado a quem competem as decisões referentes ao tratamento de dados pessoais (Cliente contratante da plataforma OpenWA).
* **OPERADOR DE DADOS**: A pessoa natural ou jurídica de direito privado que realiza o tratamento de dados pessoais em nome do Controlador (Plataforma OpenWA / Infraestrutura de Prospecção).

---

## 2. Objeto e Natureza do Tratamento

O Operador efetuará o tratamento automatizado de dados pessoais exclusivamente para viabilizar os serviços de prospecção B2B, automação de cadências no WhatsApp, roteamento por chip e atendimento humanizado via Inteligência Artificial.

### Categorias de Dados Pessoais Trativas:
* Nome comercial/fantasia dos contatos.
* Número de telefone comercial / WhatsApp.
* Histórico de interações e mensagens de atendimento.

---

## 3. Obrigações do Operador (OpenWA)

1. **Tratamento Instruído**: Tratar os dados pessoais apenas de acordo com as instruções lícitas do Controlador.
2. **Confidencialidade e Segurança**: Garantir a criptografia em repouso dos dados através do algoritmo **AES-256-GCM** e em trânsito via **TLS/HTTPS**.
3. **Atendimento a Direitos dos Titulares (Art. 18)**: Disponibilizar ferramentas automatizadas para anonimização e exclusão de dados (Right to be forgotten) no prazo de 15 dias.
4. **Notificação de Incidentes (Art. 48)**: Notificar o Controlador em até 24 horas após a confirmação de qualquer incidente de segurança relevante.
5. **Auditoria**: Manter registros de logs de acesso por no mínimo 90 dias através do módulo `AuditService`.

---

## 4. Transferência e Sub-processadores

O Controlador autoriza o uso dos seguintes sub-processadores necessários para a operação dos serviços:
* **Infraestrutura Cloud & Banco de Dados**: PostgreSQL / Supabase / Redis.
* **Rede de Proxies**: TOR SOCKS5 Proxy (roteamento de IP sem armazenamento de logs de payload).

---

## 5. Foro e Legislação Aplicável

Este acordo é regido pelas leis da República Federativa do Brasil, especialmente pela Lei nº 13.709/2018 (LGPD), sendo eleito o foro da comarca da sede do Operador para dirimir quaisquer dúvidas decorrentes deste instrumento.
