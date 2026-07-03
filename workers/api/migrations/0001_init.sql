CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 15000,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

CREATE TABLE login_attempts (
  user_id TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_login_attempts_user_time ON login_attempts(user_id, attempted_at);

CREATE TABLE attendance_records (
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE company_holidays (
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE company_working_days (
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  mandatory_office_day_rules TEXT NOT NULL DEFAULT '[]',
  target_office_rate INTEGER NOT NULL DEFAULT 50,
  closing_day INTEGER NOT NULL DEFAULT 15,
  closing_day_shift TEXT NOT NULL DEFAULT 'none',
  auto_fetch_holidays INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE japan_holidays (
  date TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL
);
