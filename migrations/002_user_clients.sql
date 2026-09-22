-- 每位使用者可檢視的客戶（廣告帳號）授權表。
-- ADMIN 角色不受此表限制，一律可檢視全部；STAFF 只能看到這裡指派的項目。

CREATE TABLE IF NOT EXISTS user_clients (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS user_clients_client_idx ON user_clients (client_id);
