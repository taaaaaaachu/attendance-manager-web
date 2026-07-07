-- 認証をCloudflare Accessへ一本化する。
-- ユーザーキーは独自認証のuser_idからAccessで認証されたメールアドレスに変わるため、
-- (1) usersテーブルへのFK制約を外すべくデータテーブルを再構築し、
-- (2) 既存ユーザー(legacy-user)のデータをAccessのメールアドレスへ付け替え、
-- (3) 独自認証専用のテーブルを削除する。

-- (1) FK制約なしでテーブルを再構築(SQLiteはALTER TABLEでのFK削除ができない)
CREATE TABLE attendance_records_new (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
INSERT INTO attendance_records_new SELECT user_id, date, status, updated_at FROM attendance_records;
DROP TABLE attendance_records;
ALTER TABLE attendance_records_new RENAME TO attendance_records;

CREATE TABLE company_holidays_new (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
INSERT INTO company_holidays_new SELECT user_id, date FROM company_holidays;
DROP TABLE company_holidays;
ALTER TABLE company_holidays_new RENAME TO company_holidays;

CREATE TABLE company_working_days_new (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
INSERT INTO company_working_days_new SELECT user_id, date FROM company_working_days;
DROP TABLE company_working_days;
ALTER TABLE company_working_days_new RENAME TO company_working_days;

CREATE TABLE user_settings_new (
  user_id TEXT PRIMARY KEY,
  mandatory_office_day_rules TEXT NOT NULL DEFAULT '[]',
  target_office_rate INTEGER NOT NULL DEFAULT 50,
  closing_day INTEGER NOT NULL DEFAULT 15,
  closing_day_shift TEXT NOT NULL DEFAULT 'none',
  auto_fetch_holidays INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
INSERT INTO user_settings_new SELECT user_id, mandatory_office_day_rules, target_office_rate, closing_day, closing_day_shift, auto_fetch_holidays, updated_at FROM user_settings;
DROP TABLE user_settings;
ALTER TABLE user_settings_new RENAME TO user_settings;

-- (2) 既存データをAccessのメールアドレスへ付け替え
UPDATE attendance_records SET user_id = 'owner@example.com' WHERE user_id = 'legacy-user';
UPDATE company_holidays SET user_id = 'owner@example.com' WHERE user_id = 'legacy-user';
UPDATE company_working_days SET user_id = 'owner@example.com' WHERE user_id = 'legacy-user';
UPDATE user_settings SET user_id = 'owner@example.com' WHERE user_id = 'legacy-user';

-- (3) 独自認証専用テーブルを削除
DROP TABLE sessions;
DROP TABLE login_attempts;
DROP TABLE users;
