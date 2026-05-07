-- =========================================================
-- Buzke Lead Contact - Estrutura de conversa para leads
-- MySQL 8.0.31+
-- =========================================================

-- =========================================================
-- BLOCO 0: ALTERS SEGUROS PARA RODAR NO HEIDI
-- =========================================================
-- Este bloco consulta information_schema e so executa ALTER/INDEX
-- quando o alvo ainda nao existe.
--
-- Recomendado quando a base ja existe e voce quer evitar erro de:
-- 1) coluna ja existente
-- 2) indice ja existente
-- 3) ajuste repetido no campo updated

SET @db_name = DATABASE();

SET @sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'leads'
      AND column_name = 'updated'
      AND is_nullable = 'YES'
  ),
  'ALTER TABLE leads MODIFY COLUMN updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT ''leads.updated ja esta ajustado'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'leads'
      AND index_name = 'idx_leads_status_deleted_created'
  ),
  'SELECT ''idx_leads_status_deleted_created ja existe''',
  'ALTER TABLE leads ADD INDEX idx_leads_status_deleted_created (status, deleted_at, created)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'leads'
      AND index_name = 'idx_leads_status_deleted_ultimo'
  ),
  'SELECT ''idx_leads_status_deleted_ultimo ja existe''',
  'ALTER TABLE leads ADD INDEX idx_leads_status_deleted_ultimo (status, deleted_at, ultimo_contato_em)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'leads'
      AND index_name = 'idx_leads_deleted_at'
  ),
  'SELECT ''idx_leads_deleted_at ja existe''',
  'ALTER TABLE leads ADD INDEX idx_leads_deleted_at (deleted_at)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'leads'
      AND index_name = 'idx_leads_updated'
  ),
  'SELECT ''idx_leads_updated ja existe''',
  'ALTER TABLE leads ADD INDEX idx_leads_updated (updated)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'leads'
      AND index_name = 'idx_leads_prioridade'
  ),
  'SELECT ''idx_leads_prioridade ja existe''',
  'ALTER TABLE leads ADD INDEX idx_leads_prioridade (prioridade)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'lead_interacoes'
      AND index_name = 'idx_lead_interacoes_lead_tipo_id'
  ),
  'SELECT ''idx_lead_interacoes_lead_tipo_id ja existe''',
  'ALTER TABLE lead_interacoes ADD INDEX idx_lead_interacoes_lead_tipo_id (lead_id, tipo, id)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'lead_interacoes'
      AND index_name = 'idx_lead_interacoes_lead_tipo_criado'
  ),
  'SELECT ''idx_lead_interacoes_lead_tipo_criado ja existe''',
  'ALTER TABLE lead_interacoes ADD INDEX idx_lead_interacoes_lead_tipo_criado (lead_id, tipo, criado_em)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'lead_interacoes'
      AND index_name = 'idx_lead_interacoes_status_novo'
  ),
  'SELECT ''idx_lead_interacoes_status_novo ja existe''',
  'ALTER TABLE lead_interacoes ADD INDEX idx_lead_interacoes_status_novo (status_novo)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =========================================================
-- BLOCO 1: ADAPTAR A TABELA leads EXISTENTE, CASO ELA JA EXISTA
-- =========================================================
-- Este bloco assume que a tabela leads ja existe e adiciona
-- apenas as colunas/indices que o projeto atual usa.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS nome VARCHAR(255) NOT NULL DEFAULT '' AFTER id,
  ADD COLUMN IF NOT EXISTS nome_quadra VARCHAR(255) NOT NULL DEFAULT '' AFTER nome,
  ADD COLUMN IF NOT EXISTS telefone VARCHAR(30) NULL AFTER nome_quadra,
  ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL AFTER telefone,
  ADD COLUMN IF NOT EXISTS canal VARCHAR(50) NULL AFTER email,
  ADD COLUMN IF NOT EXISTS primeiro_contato_em DATETIME NULL AFTER canal,
  ADD COLUMN IF NOT EXISTS ultimo_contato_em DATETIME NULL AFTER primeiro_contato_em,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'novo' AFTER ultimo_contato_em,
  ADD COLUMN IF NOT EXISTS score INT NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN IF NOT EXISTS cliente_id BIGINT UNSIGNED NULL AFTER score,
  ADD COLUMN IF NOT EXISTS instagram VARCHAR(255) NULL AFTER cliente_id,
  ADD COLUMN IF NOT EXISTS modalidades VARCHAR(255) NULL AFTER instagram,
  ADD COLUMN IF NOT EXISTS obsercacao TEXT NULL AFTER modalidades,
  ADD COLUMN IF NOT EXISTS fonte_url VARCHAR(500) NULL AFTER obsercacao,
  ADD COLUMN IF NOT EXISTS abordagem TEXT NULL AFTER fonte_url,
  ADD COLUMN IF NOT EXISTS cidade VARCHAR(120) NULL AFTER abordagem,
  ADD COLUMN IF NOT EXISTS estado VARCHAR(10) NULL AFTER cidade,
  ADD COLUMN IF NOT EXISTS prioridade ENUM('alta','media','baixa') NOT NULL DEFAULT 'media' AFTER estado,
  ADD COLUMN IF NOT EXISTS created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER prioridade,
  ADD COLUMN IF NOT EXISTS updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created,
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER updated;

-- Para MySQL/Heidi, prefira o BLOCO 0 acima.
-- Os indices abaixo foram removidos daqui porque CREATE INDEX IF NOT EXISTS
-- nao e suportado pelo MySQL.


-- =========================================================
-- BLOCO 2: ESTRUTURA MINIMA DO PROJETO ATUAL
-- =========================================================
-- Esta e a tabela que o codigo atual usa para registrar:
-- mensagem enviada, resposta recebida, classificacao da IA,
-- notas, erros e mudancas de status.

CREATE TABLE IF NOT EXISTS lead_interacoes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM(
    'lead_criado',
    'status_alterado',
    'mensagem_sugerida',
    'mensagem_enviada',
    'resposta_recebida',
    'nota',
    'erro',
    'ia_classificacao'
  ) NOT NULL,
  mensagem TEXT NULL,
  status_anterior VARCHAR(50) NULL,
  status_novo VARCHAR(50) NULL,
  metadados JSON NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lead_interacoes_lead_id (lead_id),
  KEY idx_lead_interacoes_lead_tipo_id (lead_id, tipo, id),
  KEY idx_lead_interacoes_lead_tipo_criado (lead_id, tipo, criado_em),
  KEY idx_lead_interacoes_status_novo (status_novo),
  CONSTRAINT fk_lead_interacoes_lead
    FOREIGN KEY (lead_id) REFERENCES leads (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =========================================================
-- BLOCO 3: MODELO MAIS AVANCADO
-- =========================================================
-- Use este modelo se quiser separar:
-- 1) cabecalho da conversa
-- 2) mensagens da conversa
-- 3) trilha operacional do bot
--
-- A tabela lead_interacoes continua sendo util para auditoria do bot,
-- enquanto lead_conversas e lead_mensagens guardam a conversa em formato
-- mais proprio para CRM/historico.

CREATE TABLE IF NOT EXISTS lead_conversas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id BIGINT UNSIGNED NOT NULL,
  canal VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
  origem VARCHAR(30) NOT NULL DEFAULT 'evolution',
  identificador_externo VARCHAR(120) NULL,
  remote_jid VARCHAR(120) NULL,
  phone_e164 VARCHAR(30) NULL,
  status_conversa ENUM('aberta','encerrada','arquivada') NOT NULL DEFAULT 'aberta',
  primeira_mensagem_em DATETIME NULL,
  ultima_mensagem_em DATETIME NULL,
  ultima_mensagem_preview VARCHAR(500) NULL,
  criada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lead_conversas_remote_jid (remote_jid),
  KEY idx_lead_conversas_lead_id (lead_id),
  KEY idx_lead_conversas_status (status_conversa),
  KEY idx_lead_conversas_ultima_mensagem (ultima_mensagem_em),
  CONSTRAINT fk_lead_conversas_lead
    FOREIGN KEY (lead_id) REFERENCES leads (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_mensagens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversa_id BIGINT UNSIGNED NOT NULL,
  lead_id BIGINT UNSIGNED NOT NULL,
  whatsapp_message_id VARCHAR(120) NULL,
  context_message_id VARCHAR(120) NULL,
  direction ENUM('inbound','outbound','internal') NOT NULL,
  actor ENUM('lead','bot','humano','sistema') NOT NULL,
  tipo_mensagem VARCHAR(50) NOT NULL DEFAULT 'text',
  texto LONGTEXT NULL,
  legenda TEXT NULL,
  mime_type VARCHAR(120) NULL,
  media_url VARCHAR(500) NULL,
  file_name VARCHAR(255) NULL,
  enviado_por_sistema TINYINT(1) NOT NULL DEFAULT 0,
  lida TINYINT(1) NOT NULL DEFAULT 0,
  entregue TINYINT(1) NOT NULL DEFAULT 0,
  message_datetime DATETIME NULL,
  raw_payload JSON NULL,
  criada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lead_mensagens_whatsapp_message_id (whatsapp_message_id),
  KEY idx_lead_mensagens_conversa_id (conversa_id),
  KEY idx_lead_mensagens_lead_id (lead_id),
  KEY idx_lead_mensagens_direction (direction),
  KEY idx_lead_mensagens_actor (actor),
  KEY idx_lead_mensagens_datetime (message_datetime),
  CONSTRAINT fk_lead_mensagens_conversa
    FOREIGN KEY (conversa_id) REFERENCES lead_conversas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_lead_mensagens_lead
    FOREIGN KEY (lead_id) REFERENCES leads (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =========================================================
-- BLOCO 4: INSERTS DE EXEMPLO PARA TESTE RAPIDO NO HEIDI
-- =========================================================

INSERT INTO leads (
  nome,
  nome_quadra,
  telefone,
  email,
  canal,
  status,
  score,
  instagram,
  modalidades,
  cidade,
  estado,
  prioridade,
  abordagem
) VALUES (
  'Carlos Henrique',
  'Arena Buzke Centro',
  '5511999999999',
  'carlos@arenabuzke.com.br',
  'whatsapp',
  'saudacao_enviada',
  75,
  '@arenabuzke',
  'futebol, volei',
  'Sao Paulo',
  'SP',
  'alta',
  'Lead captado para oferta do Buzke via WhatsApp.'
);

SET @lead_id = LAST_INSERT_ID();

INSERT INTO lead_interacoes (
  lead_id,
  tipo,
  mensagem,
  status_anterior,
  status_novo,
  metadados
) VALUES
(
  @lead_id,
  'status_alterado',
  'Lead entrou na fila de abordagem.',
  'novo',
  'contato_iniciado',
  JSON_OBJECT('source', 'teste_heidi')
),
(
  @lead_id,
  'mensagem_enviada',
  'Boa tarde, tudo bem?',
  NULL,
  NULL,
  JSON_OBJECT('kind', 'greeting', 'channel', 'whatsapp')
),
(
  @lead_id,
  'status_alterado',
  'Saudacao inicial enviada.',
  'contato_iniciado',
  'saudacao_enviada',
  JSON_OBJECT('source', 'automation')
),
(
  @lead_id,
  'resposta_recebida',
  'Boa tarde, tudo bem sim.',
  NULL,
  NULL,
  JSON_OBJECT(
    'remoteJid', '5511999999999@s.whatsapp.net',
    'messageId', 'MSG-TESTE-0001',
    'messageIds', JSON_ARRAY('MSG-TESTE-0001'),
    'pushName', 'Carlos Henrique'
  )
),
(
  @lead_id,
  'ia_classificacao',
  'Resposta cordial; pode seguir com o pitch.',
  NULL,
  NULL,
  JSON_OBJECT(
    'intent', 'OTHER',
    'confidence', 0.92,
    'shouldReply', TRUE,
    'conversationSummary', 'Lead respondeu de forma cordial apos a saudacao.'
  )
),
(
  @lead_id,
  'mensagem_enviada',
  'Vi a quadra de voces e achei bem legal o espaco.\n\nSou do Buzke, uma plataforma para quadras e espacos esportivos gerenciarem agenda, reservas, pagamentos e clientes em um so lugar.\n\nPosso te mandar um video rapido mostrando como funciona?',
  NULL,
  NULL,
  JSON_OBJECT('kind', 'pitch', 'channel', 'whatsapp')
),
(
  @lead_id,
  'status_alterado',
  'Pitch enviado apos resposta do lead.',
  'saudacao_enviada',
  'mensagem_enviada',
  JSON_OBJECT('source', 'automation')
),
(
  @lead_id,
  'nota',
  'Lead respondeu bem ao primeiro contato e recebeu o pitch.',
  NULL,
  NULL,
  JSON_OBJECT('kind', 'conversation_summary')
);


-- Exemplo do modelo avancado.
INSERT INTO lead_conversas (
  lead_id,
  canal,
  origem,
  identificador_externo,
  remote_jid,
  phone_e164,
  status_conversa,
  primeira_mensagem_em,
  ultima_mensagem_em,
  ultima_mensagem_preview
) VALUES (
  @lead_id,
  'whatsapp',
  'evolution',
  'CONV-TESTE-0001',
  '5511999999999@s.whatsapp.net',
  '5511999999999',
  'aberta',
  NOW(),
  NOW(),
  'Boa tarde, tudo bem sim.'
);

SET @conversa_id = LAST_INSERT_ID();

INSERT INTO lead_mensagens (
  conversa_id,
  lead_id,
  whatsapp_message_id,
  direction,
  actor,
  tipo_mensagem,
  texto,
  enviado_por_sistema,
  lida,
  entregue,
  message_datetime,
  raw_payload
) VALUES
(
  @conversa_id,
  @lead_id,
  'OUT-TESTE-0001',
  'outbound',
  'bot',
  'text',
  'Boa tarde, tudo bem?',
  1,
  1,
  1,
  NOW(),
  JSON_OBJECT('kind', 'greeting')
),
(
  @conversa_id,
  @lead_id,
  'IN-TESTE-0001',
  'inbound',
  'lead',
  'text',
  'Boa tarde, tudo bem sim.',
  0,
  1,
  1,
  NOW(),
  JSON_OBJECT('kind', 'reply')
);


-- =========================================================
-- BLOCO 5: CONSULTAS UTEIS DE TESTE
-- =========================================================

SELECT *
FROM leads
WHERE id = @lead_id;

SELECT *
FROM lead_interacoes
WHERE lead_id = @lead_id
ORDER BY id;

SELECT *
FROM lead_conversas
WHERE lead_id = @lead_id;

SELECT *
FROM lead_mensagens
WHERE lead_id = @lead_id
ORDER BY id;