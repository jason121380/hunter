# Hunter — Ads Report System

GitHub + Railway 正式化遷移專案。

## V1 原則
- 舊 Google Apps Script 正式環境暫不切換。
- Meta Marketing API 邏輯搬到 Node.js。
- Google Ads V1 維持手動回報，不串 Google Ads API。
- Google Sheets 廣告帳號設定逐步搬到 PostgreSQL。
- localStorage「已回報」狀態逐步搬到 report_logs。
- Secret 只放 Railway Variables，不進 GitHub。

## Railway Variables

必填：

| 變數 | 說明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 連線字串（建議用 Railway 私有網址 `*.railway.internal`） |
| `SESSION_SECRET` | 登入 Session 簽章金鑰，建議 32 字元以上隨機字串 |
| `DEFAULT_ADMIN_PASSWORD` | 首次部署建立管理員用，**至少 12 字元**；未設定則不會建立任何帳號 |
| `META_ACCESS_TOKEN` | Meta Marketing API 權杖 |
| `META_APP_ID` / `META_APP_SECRET` | Token 檢查與長效交換用 |

選填：

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `META_API_VERSION` | `v26.0` | Graph API 版本 |
| `DEFAULT_ADMIN_USERNAME` | `admin` | 預設管理員帳號名稱 |
| `BOOTSTRAP_META_ON_START` | `false` | 啟動時是否自動匯入 Meta 廣告帳號 |
| `DATABASE_SSL_INSECURE` | `false` | 設為 `true` 會停用資料庫 TLS 憑證驗證，僅在自簽憑證時使用 |
| `NODE_ENV` | — | 設為 `production` 會啟用 HSTS |
| `ADMIN_KEY` | — | 舊版金鑰，僅在 `SESSION_SECRET` 未設定時作為簽章備援 |

產生 `SESSION_SECRET`：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Database

`migrations/001_init.sql` 是 schema 的唯一來源，由 `src/migrate.js` 在每次啟動時執行（內容必須可重複執行）。

資料表：`users`、`clients`、`ad_accounts`、`report_logs`。

## 安全機制

- 登入採 HttpOnly + SameSite=Lax + Secure Cookie，內容為 HMAC-SHA256 簽章的 session token（12 小時有效）。
- 密碼以 scrypt 雜湊儲存；驗證使用 timing-safe 比對。
- 登入端點有節流保護（同 IP + 帳號 15 分鐘內 10 次）。
- 管理功能（`/api/admin/*`）以使用者角色 `ADMIN` 控管，不再使用 `x-admin-key` header。
- 所有寫入型請求會檢查 `Origin` 同源（CSRF 第二道防線）。
- 回應帶 CSP、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy` 等安全標頭。
- 所有外部輸入（客戶 ID、日期、Meta 物件 ID）在進入 SQL 或 Graph API 路徑前皆經白名單驗證。
- 僅明確標記的錯誤會回傳原始訊息，其餘一律回傳通用訊息並記錄於伺服器 log。

## Migration status
- Node/Express server scaffold: done
- PostgreSQL schema: done
- Meta API client / token status: done
- Campaign / Ad Set / Insights routes: done
- Frontend REST migration: done
- Auth / roles: done
- 使用者管理介面（新增帳號、改密碼）: next
- Google Ads 串接: 不在 V1 範圍
