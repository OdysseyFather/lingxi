-- Lingxi Web 多租户 MySQL Schema v1
-- MySQL 8.0+ / utf8mb4 / InnoDB
-- 生成自多用户化改造计划附录 A

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- schema_version：沿用桌面端版本化迁移机制
CREATE TABLE IF NOT EXISTS schema_version (
  version    INT UNSIGNED NOT NULL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL DEFAULT '',
  applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- system_config：全局键值配置（开放注册、默认配额等）
CREATE TABLE IF NOT EXISTS system_config (
  config_key   VARCHAR(64)  NOT NULL PRIMARY KEY,
  config_value TEXT         NOT NULL DEFAULT (''),
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_config (config_key, config_value) VALUES
  ('open_registration', 'false'),
  ('default_storage_limit_bytes', '1073741824'),   -- 1GB
  ('default_token_input_limit', '1000000'),
  ('default_token_output_limit', '200000'),
  ('default_agent_limit', '20'),
  ('default_session_limit', '500'),
  ('default_knowledge_limit', '200'),
  ('default_concurrent_chats', '3'),
  ('audit_log_retention_days', '90');

CREATE TABLE IF NOT EXISTS users (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username        VARCHAR(64)  NOT NULL,
  email           VARCHAR(128) DEFAULT NULL,
  password_hash   VARCHAR(128) NOT NULL,
  role            ENUM('admin','user') NOT NULL DEFAULT 'user',
  status          ENUM('active','suspended','deleted') NOT NULL DEFAULT 'active',
  display_name    VARCHAR(64)  NOT NULL DEFAULT '',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at   DATETIME     DEFAULT NULL,
  deleted_at      DATETIME     DEFAULT NULL,
  UNIQUE KEY uk_users_username (username),
  UNIQUE KEY uk_users_email (email),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  token_hash    CHAR(64)        NOT NULL COMMENT 'SHA256(refresh_token)',
  device_info   VARCHAR(256)    DEFAULT NULL,
  ip_address    VARCHAR(45)     DEFAULT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATETIME        NOT NULL,
  last_used_at  DATETIME        DEFAULT NULL,
  revoked_at    DATETIME        DEFAULT NULL,
  KEY idx_tokens_user (user_id),
  KEY idx_tokens_hash (token_hash),
  KEY idx_tokens_expires (expires_at),
  CONSTRAINT fk_tokens_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username     VARCHAR(64) NOT NULL,
  ip_address   VARCHAR(45) NOT NULL,
  failed_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_login_attempts_user_time (username, failed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invitations (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(32)  NOT NULL,
  role            ENUM('admin','user') NOT NULL DEFAULT 'user',
  quota_template  JSON         DEFAULT NULL COMMENT '初始配额模板 JSON',
  max_uses        INT          NOT NULL DEFAULT 1,
  used_count      INT          NOT NULL DEFAULT 0,
  expires_at      DATETIME     DEFAULT NULL,
  created_by      BIGINT UNSIGNED NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_invitations_code (code),
  KEY idx_invitations_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_quota_limits (
  user_id              BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  storage_limit_bytes  BIGINT UNSIGNED NOT NULL DEFAULT 1073741824,
  token_input_limit    BIGINT UNSIGNED NOT NULL DEFAULT 1000000,
  token_output_limit   BIGINT UNSIGNED NOT NULL DEFAULT 200000,
  agent_limit          INT UNSIGNED    NOT NULL DEFAULT 20,
  session_limit        INT UNSIGNED    NOT NULL DEFAULT 500,
  knowledge_limit      INT UNSIGNED    NOT NULL DEFAULT 200,
  concurrent_chats     TINYINT UNSIGNED NOT NULL DEFAULT 3,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_quota_limits_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usage_quotas (
  user_id         BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  storage_bytes   BIGINT UNSIGNED NOT NULL DEFAULT 0,
  token_input     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  token_output    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  agent_count     INT UNSIGNED    NOT NULL DEFAULT 0,
  session_count   INT UNSIGNED    NOT NULL DEFAULT 0,
  knowledge_count INT UNSIGNED    NOT NULL DEFAULT 0,
  active_chats    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  reset_at        DATETIME        DEFAULT NULL COMMENT 'Token 月度重置时间',
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_usage_quotas_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_rate_limits (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0=按 IP 限流',
  ip_address  VARCHAR(45)     DEFAULT NULL,
  limit_key   VARCHAR(64)     NOT NULL COMMENT 'api/chat/login',
  window_start DATETIME       NOT NULL,
  hit_count   INT UNSIGNED    NOT NULL DEFAULT 0,
  KEY idx_rate_user_key (user_id, limit_key, window_start),
  KEY idx_rate_ip_key (ip_address, limit_key, window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  action      VARCHAR(64)     NOT NULL,
  resource    VARCHAR(128)    DEFAULT NULL,
  detail      JSON            DEFAULT NULL,
  ip_address  VARCHAR(45)     DEFAULT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_user_time (user_id, created_at),
  KEY idx_audit_action_time (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS providers (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(64)  NOT NULL,
  name             VARCHAR(128) NOT NULL,
  protocol         VARCHAR(32)  NOT NULL DEFAULT 'anthropic',
  default_base_url VARCHAR(512) NOT NULL DEFAULT '',
  default_model    VARCHAR(128) NOT NULL DEFAULT '',
  usage_api_meta   JSON         NOT NULL DEFAULT (JSON_ARRAY()),
  doc_url          VARCHAR(512) NOT NULL DEFAULT '',
  builtin          TINYINT(1)   NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_providers_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT UNSIGNED NOT NULL,
  title             VARCHAR(512)    NOT NULL DEFAULT '新对话',
  claude_session_id VARCHAR(128)    NOT NULL DEFAULT '' COMMENT 'Claude CLI resume ID，必须配合 user_id 查询',
  message_count     INT UNSIGNED    NOT NULL DEFAULT 0,
  agent_id          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  pinned            TINYINT(1)      NOT NULL DEFAULT 0,
  summary           MEDIUMTEXT      NOT NULL DEFAULT (''),
  folder            VARCHAR(128)    NOT NULL DEFAULT '',
  is_a2a            TINYINT(1)      NOT NULL DEFAULT 0,
  permission_mode   VARCHAR(32)     NOT NULL DEFAULT 'trust',
  mode              VARCHAR(32)     NOT NULL DEFAULT '',
  project_path      VARCHAR(1024)   NOT NULL DEFAULT '',
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sessions_user_updated (user_id, updated_at DESC),
  KEY idx_sessions_user_pinned (user_id, pinned DESC, updated_at DESC),
  KEY idx_sessions_user_agent (user_id, agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  session_id  BIGINT UNSIGNED NOT NULL,
  role        VARCHAR(32)     NOT NULL,
  content     MEDIUMTEXT      NOT NULL DEFAULT (''),
  `usage`     JSON            DEFAULT NULL,
  feedback    VARCHAR(16)     NOT NULL DEFAULT '',
  pinned      TINYINT(1)      NOT NULL DEFAULT 0,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_messages_user_session (user_id, session_id, id),
  KEY idx_messages_session (session_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pending_tasks (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        BIGINT UNSIGNED NOT NULL,
  session_id     BIGINT UNSIGNED NOT NULL,
  task_desc      TEXT            NOT NULL DEFAULT (''),
  missing_fields JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pending_user_session (user_id, session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tasks (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  session_id  BIGINT UNSIGNED NOT NULL,
  title       VARCHAR(512)    NOT NULL DEFAULT '',
  status      VARCHAR(32)     NOT NULL DEFAULT 'running',
  progress    TEXT            NOT NULL DEFAULT (''),
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tasks_user_session (user_id, session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checkpoints (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  session_id      BIGINT UNSIGNED NOT NULL,
  message_id      BIGINT UNSIGNED NOT NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  files_snapshot  LONGTEXT        NOT NULL DEFAULT (''),
  todo_snapshot   LONGTEXT        NOT NULL DEFAULT (''),
  messages_count  INT UNSIGNED    NOT NULL DEFAULT 0,
  files_count     INT UNSIGNED    NOT NULL DEFAULT 0,
  KEY idx_checkpoints_user_session (user_id, session_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agents (
  id                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id              BIGINT UNSIGNED NOT NULL,
  name                 VARCHAR(128)    NOT NULL,
  avatar               VARCHAR(512)    NOT NULL DEFAULT '✦',
  description          TEXT            NOT NULL DEFAULT (''),
  system_prompt        MEDIUMTEXT      NOT NULL DEFAULT (''),
  profile_id           BIGINT UNSIGNED NOT NULL DEFAULT 0,
  skill_ids            JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  mcp_server_ids       JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  knowledge_ids        JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  allow_all            TINYINT(1)      NOT NULL DEFAULT 1,
  builtin              TINYINT(1)      NOT NULL DEFAULT 0,
  temperature          DECIMAL(4,2)    NOT NULL DEFAULT 0,
  max_tokens           INT UNSIGNED    NOT NULL DEFAULT 0,
  post_actions         JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  evolution_enabled    TINYINT(1)      NOT NULL DEFAULT 0,
  env_vars             JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_agents_user (user_id, updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS skills (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0=系统模板',
  name                VARCHAR(128)    NOT NULL,
  description         TEXT            NOT NULL DEFAULT (''),
  file_path           VARCHAR(1024)   NOT NULL DEFAULT '',
  installed           TINYINT(1)      NOT NULL DEFAULT 0,
  source              VARCHAR(32)     NOT NULL DEFAULT 'local',
  marketplace_id      VARCHAR(128)    NOT NULL DEFAULT '',
  marketplace_version VARCHAR(64)     NOT NULL DEFAULT '',
  author              VARCHAR(128)    NOT NULL DEFAULT '',
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_skills_user_name (user_id, name),
  KEY idx_skills_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS api_profiles (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id               BIGINT UNSIGNED NOT NULL,
  name                  VARCHAR(128)    NOT NULL,
  provider_id           BIGINT UNSIGNED NOT NULL,
  provider_code         VARCHAR(64)     NOT NULL DEFAULT '',
  provider_name         VARCHAR(128)    NOT NULL DEFAULT '',
  provider_protocol     VARCHAR(32)     NOT NULL DEFAULT 'anthropic',
  base_url              VARCHAR(512)    NOT NULL DEFAULT '',
  model                 VARCHAR(128)    NOT NULL DEFAULT '',
  auth_token_encrypted  VARBINARY(1024) DEFAULT NULL,
  auth_token_iv         VARBINARY(16)   DEFAULT NULL,
  auth_token_mask       VARCHAR(64)     NOT NULL DEFAULT '',
  extra                 JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  transformer           VARCHAR(64)     NOT NULL DEFAULT '',
  is_active             TINYINT(1)      NOT NULL DEFAULT 0,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_profiles_user (user_id),
  KEY idx_profiles_user_active (user_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agent_personalities (
  user_id             BIGINT UNSIGNED NOT NULL,
  agent_id            BIGINT UNSIGNED NOT NULL,
  tags                JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  interests           JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  speak_probability   TINYINT UNSIGNED NOT NULL DEFAULT 35,
  min_delay_ms        INT UNSIGNED    NOT NULL DEFAULT 1500,
  max_delay_ms        INT UNSIGNED    NOT NULL DEFAULT 5000,
  emoji_freq          VARCHAR(16)     NOT NULL DEFAULT 'medium',
  quiet_start         VARCHAR(8)      NOT NULL DEFAULT '',
  quiet_end           VARCHAR(8)      NOT NULL DEFAULT '',
  typo_rate           TINYINT UNSIGNED NOT NULL DEFAULT 1,
  echo_rate           TINYINT UNSIGNED NOT NULL DEFAULT 2,
  ghost_minutes       INT UNSIGNED    NOT NULL DEFAULT 0,
  cold_start_eligible TINYINT(1)      NOT NULL DEFAULT 1,
  style_hint          TEXT            NOT NULL DEFAULT (''),
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agent_nexus_config (
  user_id              BIGINT UNSIGNED NOT NULL,
  agent_id             BIGINT UNSIGNED NOT NULL,
  public               TINYINT(1)      NOT NULL DEFAULT 0,
  public_name          VARCHAR(128)    NOT NULL DEFAULT '',
  capability_tags      JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  auth_level           VARCHAR(32)     NOT NULL DEFAULT 'readonly',
  forbidden_info       TEXT            NOT NULL DEFAULT (''),
  public_knowledge_ids JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  PRIMARY KEY (user_id, agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agent_distill_records (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT UNSIGNED NOT NULL,
  family            VARCHAR(64)     NOT NULL DEFAULT 'colleague',
  alias             VARCHAR(128)    NOT NULL DEFAULT '',
  slug              VARCHAR(128)    NOT NULL DEFAULT '',
  profile           TEXT            NOT NULL DEFAULT (''),
  personality_hint  TEXT            NOT NULL DEFAULT (''),
  name              VARCHAR(128)    NOT NULL DEFAULT '',
  description       TEXT            NOT NULL DEFAULT (''),
  system_prompt     MEDIUMTEXT      NOT NULL DEFAULT (''),
  personality_json  JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  source_files_json JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  output_files_json JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  storage_dir       VARCHAR(1024)   NOT NULL DEFAULT '',
  version           INT UNSIGNED    NOT NULL DEFAULT 1,
  status              VARCHAR(32)     NOT NULL DEFAULT 'completed',
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_distill_user (user_id, updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS knowledge (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  title       VARCHAR(512)    NOT NULL DEFAULT '',
  file_path   VARCHAR(1024)   NOT NULL,
  category    VARCHAR(64)     NOT NULL DEFAULT 'docs',
  tags        JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  summary     TEXT            NOT NULL DEFAULT (''),
  size        BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_knowledge_user_path (user_id, file_path(700)),
  KEY idx_knowledge_user (user_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS knowledge_categories (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(128)    NOT NULL,
  icon        VARCHAR(16)     NOT NULL DEFAULT '📁',
  sort_order  INT             NOT NULL DEFAULT 0,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_kcat_user_name (user_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 替代独立 vectors.db + kb_chunks（768 维 float32 = 3072 bytes）
CREATE TABLE IF NOT EXISTS vector_chunks (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  knowledge_id  BIGINT UNSIGNED NOT NULL,
  file_path     VARCHAR(1024)   NOT NULL DEFAULT '',
  chunk_index   INT UNSIGNED    NOT NULL DEFAULT 0,
  chunk_text    MEDIUMTEXT      NOT NULL DEFAULT (''),
  token_count   INT UNSIGNED    NOT NULL DEFAULT 0,
  embedding     VARBINARY(3072) DEFAULT NULL COMMENT '768 x float32 LE',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vchunks_user_knowledge (user_id, knowledge_id),
  KEY idx_vchunks_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vector_index_status (
  user_id       BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  total_docs    INT UNSIGNED    NOT NULL DEFAULT 0,
  total_chunks  INT UNSIGNED    NOT NULL DEFAULT 0,
  last_updated  DATETIME        DEFAULT NULL,
  is_indexing   TINYINT(1)      NOT NULL DEFAULT 0,
  progress      DECIMAL(5,2)    NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS embedding_config (
  user_id   BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  mode      VARCHAR(16)     NOT NULL DEFAULT 'api',
  api_url   VARCHAR(512)    NOT NULL DEFAULT '',
  model     VARCHAR(128)    NOT NULL DEFAULT 'text-embedding-3-small'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS watched_dirs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  dir_path    VARCHAR(1024)   NOT NULL,
  enabled     TINYINT(1)      NOT NULL DEFAULT 1,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_watched_user_path (user_id, dir_path(700))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mcp_servers (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0=系统内置',
  name         VARCHAR(128)    NOT NULL,
  transport    VARCHAR(16)     NOT NULL DEFAULT 'stdio',
  command      VARCHAR(512)    NOT NULL DEFAULT '',
  args         JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  env          JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  url          VARCHAR(512)    NOT NULL DEFAULT '',
  headers      JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  enabled      TINYINT(1)      NOT NULL DEFAULT 1,
  builtin      TINYINT(1)      NOT NULL DEFAULT 0,
  description  TEXT            NOT NULL DEFAULT (''),
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_mcp_user_name (user_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usage_records (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             BIGINT UNSIGNED NOT NULL,
  session_id          BIGINT UNSIGNED NOT NULL,
  message_id          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  profile_id          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  model               VARCHAR(128)    NOT NULL DEFAULT '',
  input_tokens        INT UNSIGNED    NOT NULL DEFAULT 0,
  output_tokens       INT UNSIGNED    NOT NULL DEFAULT 0,
  cache_read_tokens   INT UNSIGNED    NOT NULL DEFAULT 0,
  cache_write_tokens  INT UNSIGNED    NOT NULL DEFAULT 0,
  cost_usd            DECIMAL(12,6)   NOT NULL DEFAULT 0,
  duration_ms         INT UNSIGNED    NOT NULL DEFAULT 0,
  estimated           TINYINT(1)      NOT NULL DEFAULT 0,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_usage_user_time (user_id, created_at DESC),
  KEY idx_usage_user_session (user_id, session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usage_quota_cache (
  user_id     BIGINT UNSIGNED NOT NULL,
  profile_id  BIGINT UNSIGNED NOT NULL,
  snapshot    JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  fetched_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS memories (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  agent_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  content     TEXT            NOT NULL DEFAULT (''),
  category    VARCHAR(64)     NOT NULL DEFAULT 'general',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_memories_user_agent (user_id, agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  name            VARCHAR(256)    NOT NULL,
  prompt          MEDIUMTEXT      NOT NULL DEFAULT (''),
  agent_id        BIGINT UNSIGNED NOT NULL DEFAULT 0,
  cron_expr       VARCHAR(128)    NOT NULL DEFAULT '',
  stateful        TINYINT(1)      NOT NULL DEFAULT 0,
  session_id      BIGINT UNSIGNED DEFAULT NULL,
  notify_desktop  TINYINT(1)      NOT NULL DEFAULT 0,
  enabled         TINYINT(1)      NOT NULL DEFAULT 1,
  last_run_at     DATETIME        DEFAULT NULL,
  next_run_at     DATETIME        DEFAULT NULL,
  run_count       INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sched_user (user_id, enabled, next_run_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scheduled_task_runs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  task_id     BIGINT UNSIGNED NOT NULL,
  session_id  BIGINT UNSIGNED NOT NULL,
  status      VARCHAR(32)     NOT NULL DEFAULT 'running',
  summary     TEXT            NOT NULL DEFAULT (''),
  started_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME        DEFAULT NULL,
  KEY idx_sched_runs_user_task (user_id, task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS evolution_logs (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT UNSIGNED NOT NULL,
  agent_id         BIGINT UNSIGNED NOT NULL DEFAULT 0,
  session_id       BIGINT UNSIGNED NOT NULL DEFAULT 0,
  trigger_source   VARCHAR(64)     NOT NULL DEFAULT '',
  action           VARCHAR(64)     NOT NULL DEFAULT '',
  target_type      VARCHAR(64)     NOT NULL DEFAULT '',
  target_id        BIGINT UNSIGNED NOT NULL DEFAULT 0,
  summary          TEXT            NOT NULL DEFAULT (''),
  detail           JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  status           VARCHAR(32)     NOT NULL DEFAULT 'active',
  raw_llm_response MEDIUMTEXT      NOT NULL DEFAULT (''),
  steps_json       JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_evo_user_agent (user_id, agent_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS im_connectors (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(128)    NOT NULL DEFAULT '',
  platform    VARCHAR(32)     NOT NULL,
  agent_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  enabled     TINYINT(1)      NOT NULL DEFAULT 0,
  config      VARBINARY(4096) DEFAULT NULL COMMENT 'AES-GCM 加密 JSON',
  config_iv   VARBINARY(16)   DEFAULT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_im_conn_user (user_id, platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS im_sessions (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  platform    VARCHAR(32)     NOT NULL,
  scope_key   VARCHAR(256)    NOT NULL,
  session_id  BIGINT UNSIGNED NOT NULL,
  last_active DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_im_sess_user_scope (user_id, platform, scope_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS im_reply_sessions (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  platform_msg_id VARCHAR(128)    NOT NULL,
  session_id      BIGINT UNSIGNED NOT NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_im_reply_user_msg (user_id, platform_msg_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS feishu_monitor_rules (
  id                     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                BIGINT UNSIGNED NOT NULL,
  connector_id           BIGINT UNSIGNED NOT NULL,
  name                   VARCHAR(256)    NOT NULL DEFAULT '',
  enabled                TINYINT(1)      NOT NULL DEFAULT 1,
  chat_ids               JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  sender_ids             JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  exclude_bot_msg        TINYINT(1)      NOT NULL DEFAULT 1,
  msg_types              JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  keywords               JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  keyword_mode           VARCHAR(16)     NOT NULL DEFAULT 'any',
  action_type            VARCHAR(32)     NOT NULL DEFAULT 'reply_original',
  action_target          VARCHAR(256)    NOT NULL DEFAULT '',
  custom_prompt          TEXT            NOT NULL DEFAULT (''),
  reply_prefix           TEXT            NOT NULL DEFAULT (''),
  priority               INT             NOT NULL DEFAULT 0,
  target_chat_id         VARCHAR(128)    NOT NULL DEFAULT '',
  dispatch_targets       JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  completion_strategy    VARCHAR(32)     NOT NULL DEFAULT 'debounce',
  max_rounds             INT UNSIGNED    NOT NULL DEFAULT 10,
  reply_timeout_minutes  INT UNSIGNED    NOT NULL DEFAULT 10,
  reply_debounce_seconds INT UNSIGNED    NOT NULL DEFAULT 30,
  created_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_feishu_rules_user (user_id, connector_id, priority DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS feishu_monitor_logs (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  connector_id  BIGINT UNSIGNED NOT NULL,
  rule_id       BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rule_name     VARCHAR(256)    NOT NULL DEFAULT '',
  chat_id       VARCHAR(128)    NOT NULL DEFAULT '',
  sender_id     VARCHAR(128)    NOT NULL DEFAULT '',
  sender_name   VARCHAR(128)    NOT NULL DEFAULT '',
  message_text  TEXT            NOT NULL DEFAULT (''),
  action_type   VARCHAR(32)     NOT NULL DEFAULT '',
  action_target VARCHAR(256)    NOT NULL DEFAULT '',
  result        TEXT            NOT NULL DEFAULT (''),
  error_msg     TEXT            NOT NULL DEFAULT (''),
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_feishu_logs_user_time (user_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS feishu_task_instances (
  id                     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                BIGINT UNSIGNED NOT NULL,
  rule_id                BIGINT UNSIGNED NOT NULL DEFAULT 0,
  connector_id           BIGINT UNSIGNED NOT NULL DEFAULT 0,
  source_chat_id         VARCHAR(128)    NOT NULL DEFAULT '',
  target_chat_id         VARCHAR(128)    NOT NULL DEFAULT '',
  trigger_msg_id         VARCHAR(128)    NOT NULL DEFAULT '',
  trigger_content        TEXT            NOT NULL DEFAULT (''),
  trigger_sender_id      VARCHAR(128)    NOT NULL DEFAULT '',
  trigger_sender_name    VARCHAR(128)    NOT NULL DEFAULT '',
  root_message_id        VARCHAR(128)    NOT NULL DEFAULT '',
  thread_id              VARCHAR(128)    NOT NULL DEFAULT '',
  streaming_card_id      VARCHAR(128)    NOT NULL DEFAULT '',
  streaming_element_id   VARCHAR(64)     NOT NULL DEFAULT 'stream_md_01',
  streaming_sequence     INT UNSIGNED    NOT NULL DEFAULT 0,
  progress_msg_id        VARCHAR(128)    NOT NULL DEFAULT '',
  status                 VARCHAR(32)     NOT NULL DEFAULT 'CREATED',
  dispatch_targets       JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  dispatch_history       JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  accumulated_context    MEDIUMTEXT      NOT NULL DEFAULT (''),
  current_round          INT UNSIGNED    NOT NULL DEFAULT 0,
  max_rounds             INT UNSIGNED    NOT NULL DEFAULT 10,
  reply_timeout_minutes  INT UNSIGNED    NOT NULL DEFAULT 10,
  reply_debounce_seconds INT UNSIGNED    NOT NULL DEFAULT 30,
  error_msg              TEXT            NOT NULL DEFAULT (''),
  created_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_feishu_task_user_root (user_id, root_message_id),
  KEY idx_feishu_task_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS p2p_watch_targets (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT UNSIGNED NOT NULL,
  connector_id      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  chat_id           VARCHAR(128)    NOT NULL DEFAULT '',
  chat_name         VARCHAR(256)    NOT NULL DEFAULT '',
  enabled           TINYINT(1)      NOT NULL DEFAULT 1,
  poll_interval_sec INT UNSIGNED    NOT NULL DEFAULT 20,
  last_seen_msg_id  VARCHAR(128)    NOT NULL DEFAULT '',
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_p2p_watch_user (user_id, connector_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nexus_settings (
  user_id          BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  visible          TINYINT(1)      NOT NULL DEFAULT 1,
  nickname         VARCHAR(128)    NOT NULL DEFAULT '',
  listen_port      INT UNSIGNED    NOT NULL DEFAULT 0,
  signaling_url    VARCHAR(512)    NOT NULL DEFAULT '',
  wan_enabled      TINYINT(1)      NOT NULL DEFAULT 0,
  signaling_secret VARBINARY(512)  DEFAULT NULL COMMENT '加密存储'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nexus_peers (
  id           VARCHAR(64)     NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  nickname     VARCHAR(128)    NOT NULL DEFAULT '',
  host         VARCHAR(256)    NOT NULL,
  port         INT UNSIGNED    NOT NULL,
  agents_json  JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  last_seen_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, id),
  KEY idx_nexus_peers_user_seen (user_id, last_seen_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS group_chats (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id            BIGINT UNSIGNED NOT NULL,
  room_uuid          VARCHAR(64)     NOT NULL,
  topic              VARCHAR(512)    NOT NULL DEFAULT '',
  goal               TEXT            NOT NULL DEFAULT (''),
  max_rounds         INT UNSIGNED    NOT NULL DEFAULT 20,
  current_round      INT UNSIGNED    NOT NULL DEFAULT 0,
  status             VARCHAR(32)     NOT NULL DEFAULT 'pending',
  moderator_agent_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  moderator_peer_id  VARCHAR(64)     NOT NULL DEFAULT '',
  schedule_mode      VARCHAR(32)     NOT NULL DEFAULT 'hybrid',
  chat_mode          VARCHAR(32)     NOT NULL DEFAULT 'casual',
  created_by_local   TINYINT(1)      NOT NULL DEFAULT 1,
  host_peer_id       VARCHAR(64)     NOT NULL DEFAULT '',
  local_session_id   BIGINT UNSIGNED NOT NULL DEFAULT 0,
  deadline           DATETIME        DEFAULT NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_group_user_uuid (user_id, room_uuid),
  KEY idx_group_user_status (user_id, status, updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS group_members (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  room_id       BIGINT UNSIGNED NOT NULL,
  peer_id       VARCHAR(64)     NOT NULL,
  peer_nickname VARCHAR(128)    NOT NULL DEFAULT '',
  agent_id      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  agent_name    VARCHAR(128)    NOT NULL DEFAULT '',
  agent_caps    JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  is_local      TINYINT(1)      NOT NULL DEFAULT 0,
  status        VARCHAR(32)     NOT NULL DEFAULT 'invited',
  joined_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_gmembers_user_room (user_id, room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS group_messages (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT UNSIGNED NOT NULL,
  room_id           BIGINT UNSIGNED NOT NULL,
  sender_peer_id    VARCHAR(64)     NOT NULL,
  sender_agent_id   BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sender_agent_name VARCHAR(128)    NOT NULL DEFAULT '',
  msg_type          VARCHAR(32)     NOT NULL DEFAULT 'message',
  content           MEDIUMTEXT      NOT NULL DEFAULT (''),
  mentioned_agents  JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  round             INT UNSIGNED    NOT NULL DEFAULT 0,
  reply_to_id       BIGINT UNSIGNED NOT NULL DEFAULT 0,
  is_recalled       TINYINT(1)      NOT NULL DEFAULT 0,
  recalled_at       DATETIME        DEFAULT NULL,
  images            JSON            NOT NULL DEFAULT (JSON_ARRAY()),
  client_msg_id     VARCHAR(64)     NOT NULL DEFAULT '',
  edited_at         DATETIME        DEFAULT NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_gmsg_user_room_time (user_id, room_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kv_store (
  user_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  config_key VARCHAR(128)    NOT NULL,
  value      MEDIUMTEXT      NOT NULL DEFAULT (''),
  PRIMARY KEY (user_id, config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
