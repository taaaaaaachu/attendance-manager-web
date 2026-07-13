-- アカウント連携(複数のメールアドレスを1つのカレンダーに束ねる)。
-- データ実体はメールアドレス(user_id)キーのまま変えず、「解決先の付け替え」を
-- 表す2テーブルを足すだけにする(詳細は docs/adr/0002-account-linking.md)。

-- 成立した連携。member_emailをPRIMARY KEYにして「1メール=同時に1つのカレンダーにのみ参加」
-- (多重参加の禁止)をDBレベルで担保する。owner_emailは共有カレンダーの本体側。
CREATE TABLE account_links (
  owner_email TEXT NOT NULL,
  member_email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_account_links_owner ON account_links(owner_email);

-- 未承認の連携申請のみを保持する(承認でaccount_linksへ移して削除、却下/取消でも削除)。
-- requester=本体候補A、target=承認する側B。同じ相手への重複申請をPRIMARY KEYで防ぐ。
CREATE TABLE link_requests (
  requester_email TEXT NOT NULL,
  target_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (requester_email, target_email)
);
CREATE INDEX idx_link_requests_target ON link_requests(target_email);
