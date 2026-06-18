CREATE TABLE IF NOT EXISTS games (
  id VARCHAR(180) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  cover_url TEXT NULL,
  primary_tag VARCHAR(120) NULL,
  category VARCHAR(80) NULL,
  release_year INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS store_matches (
  game_id VARCHAR(180) NOT NULL,
  store VARCHAR(40) NOT NULL,
  store_game_id VARCHAR(120) NULL,
  store_url TEXT NULL,
  match_confidence VARCHAR(30) NOT NULL DEFAULT 'unknown',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, store),
  INDEX idx_store_matches_store_game_id (store, store_game_id),
  CONSTRAINT fk_store_matches_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS current_prices (
  game_id VARCHAR(180) NOT NULL,
  region VARCHAR(8) NOT NULL,
  store VARCHAR(40) NOT NULL,
  available BOOLEAN NOT NULL DEFAULT FALSE,
  original_currency VARCHAR(12) NULL,
  original_final_price DECIMAL(14, 4) NULL,
  original_base_price DECIMAL(14, 4) NULL,
  display_currency VARCHAR(12) NULL,
  converted_final_price DECIMAL(14, 4) NULL,
  converted_base_price DECIMAL(14, 4) NULL,
  tax_included_final_price DECIMAL(14, 4) NULL,
  tax_included_base_price DECIMAL(14, 4) NULL,
  discount_pct INT NULL,
  source VARCHAR(40) NULL,
  store_url TEXT NULL,
  fetched_at DATETIME NULL,
  is_stale BOOLEAN NOT NULL DEFAULT FALSE,
  stale_reason VARCHAR(255) NULL,
  error TEXT NULL,
  raw_json JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, region, store),
  INDEX idx_current_prices_region_store (region, store),
  INDEX idx_current_prices_fetched_at (fetched_at),
  CONSTRAINT fk_current_prices_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS price_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  game_id VARCHAR(180) NOT NULL,
  region VARCHAR(8) NOT NULL,
  store VARCHAR(40) NOT NULL,
  original_currency VARCHAR(12) NULL,
  original_final_price DECIMAL(14, 4) NULL,
  original_base_price DECIMAL(14, 4) NULL,
  tax_included_final_price DECIMAL(14, 4) NULL,
  tax_included_base_price DECIMAL(14, 4) NULL,
  discount_pct INT NULL,
  source VARCHAR(40) NOT NULL,
  store_url TEXT NULL,
  observed_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_price_history_point (game_id, region, store, source, observed_at),
  INDEX idx_price_history_lookup (game_id, region, store, observed_at),
  CONSTRAINT fk_price_history_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS refresh_jobs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_name VARCHAR(80) NOT NULL,
  region VARCHAR(8) NULL,
  store VARCHAR(40) NULL,
  status VARCHAR(30) NOT NULL,
  cursor_offset INT NOT NULL DEFAULT 0,
  batch_size INT NOT NULL DEFAULT 50,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  heartbeat_at DATETIME NULL,
  summary_json JSON NULL,
  error TEXT NULL,
  INDEX idx_refresh_jobs_active (job_name, status, heartbeat_at),
  INDEX idx_refresh_jobs_region_store (region, store)
);

CREATE TABLE IF NOT EXISTS job_locks (
  lock_name VARCHAR(120) PRIMARY KEY,
  owner VARCHAR(160) NOT NULL,
  expires_at DATETIME NOT NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS problem_reports (
  id VARCHAR(80) PRIMARY KEY,
  numeric_id BIGINT NULL,
  category VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  screenshot MEDIUMTEXT NULL,
  page_url TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  viewport VARCHAR(80) NOT NULL,
  user_sub VARCHAR(191) NULL,
  user_email VARCHAR(191) NULL,
  user_name VARCHAR(191) NULL,
  created_at DATETIME NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at DATETIME NULL,
  resolved_by VARCHAR(191) NULL,
  feedback_message TEXT NULL,
  feedback_sent_at DATETIME NULL,
  feedback_by VARCHAR(191) NULL,
  INDEX idx_problem_reports_created (created_at),
  INDEX idx_problem_reports_category (category),
  INDEX idx_problem_reports_resolved (resolved, created_at),
  INDEX idx_problem_reports_numeric (numeric_id),
  INDEX idx_problem_reports_user (user_sub, user_email)
);
