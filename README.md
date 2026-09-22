# Hunter — Ads Report System

內部用的 Meta 廣告成效回報系統。從 Google Apps Script 遷移到 Node.js，部署於 Railway。

- 給 AI 協作工具的專案指引：`CLAUDE.md`
- UI 樣式規範：`STYLE.md`
- 決策紀錄與待辦：`MEMORY.md`

## 功能

- 選客戶 → 統一回報（所有進行中廣告）或個別回報（指定廣告與廣告組合）→ 選日期 → 讀取 Meta 成效
- 私訊型／流量型廣告自動分類（依廣告名稱含「私訊」「流量」）
- 後台（`/admin`）：管理使用者、指派每個人可看的廣告帳號
- Meta Token 交換頁（`/token.html`）：短效 → 長效 Token
- PWA：可加到手機主畫面，以獨立視窗開啟

## 技術

Node ≥ 20 · Express 5 · PostgreSQL（`pg`）· 原生 JS 前端（無框架、無建置步驟）· Railway

只有兩個依賴：`express`、`pg`。

## 本機啟動

```bash
npm ci
cp .env.example .env   # 填入 DATABASE_URL、SESSION_SECRET、DEFAULT_ADMIN_PASSWORD
npm run dev
```

打開 `http://localhost:3000`，用 `admin` + 你設的 `DEFAULT_ADMIN_PASSWORD` 登入。

## Railway Variables

必填：

| 變數 | 說明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 連線字串（建議用 Railway 私有網址 `*.railway.internal`） |
| `SESSION_SECRET` | 登入 Session 簽章金鑰，建議 32 字元以上隨機字串 |
| `DEFAULT_ADMIN_PASSWORD` | 首次部署建立管理員用，**至少 6 字元**；未設定則不會建立任何帳號 |
| `META_ACCESS_TOKEN` | Meta Marketing API 權杖 |
| `META_APP_ID` / `META_APP_SECRET` | Token 檢查與長效交換用 |

選填：

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `META_API_VERSION` | `v26.0` | Graph API 版本 |
| `DEFAULT_ADMIN_USERNAME` | `admin` | 預設管理員帳號名稱 |
| `DEFAULT_ADMIN_PASSWORD_ROTATE` | `false` | 設為 `true` 時啟動會把 `DEFAULT_ADMIN_PASSWORD` 強制寫回既有管理員帳號 |
| `BOOTSTRAP_META_ON_START` | `false` | 啟動時是否自動從 Meta 匯入廣告帳號（也可用 `POST /api/admin/bootstrap-meta` 手動觸發） |
| `DATABASE_SSL_INSECURE` | `false` | 設為 `true` 會停用資料庫 TLS 憑證驗證，僅在自簽憑證時使用 |
| `NODE_ENV` | — | 設為 `production` 會啟用 HSTS |
| `ADMIN_KEY` | — | 舊版金鑰，僅在 `SESSION_SECRET` 未設定時作為簽章備援 |

產生 `SESSION_SECRET`：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 首次升級須執行：輪替既有管理員密碼

舊版本會自動建立密碼為 `1234` 的 `admin` 帳號。該密碼的雜湊仍留在資料庫中，
新版本不會自動更動既有帳號，必須手動輪替一次：

1. 在 Railway Variables 設定 `DEFAULT_ADMIN_PASSWORD`（至少 6 字元）與
   `DEFAULT_ADMIN_PASSWORD_ROTATE=true`。
2. 重新部署，log 出現 `"passwordRotated":true` 即代表完成。
3. 把 `DEFAULT_ADMIN_PASSWORD_ROTATE` 改回 `false`（或刪除），
   避免每次部署都重設密碼。

## 後台管理（`/admin`）

僅 `ADMIN` 角色可進入，一般使用者會被導回首頁。功能：

- 新增／編輯／刪除使用者，設定顯示名稱、角色、啟用狀態
- 重設任一帳號的密碼（至少 6 字元）
- **指派每位使用者可檢視的廣告帳號**

權限模型：

| 角色 | 可檢視的廣告帳號 | 後台管理 | Meta Token |
| --- | --- | --- | --- |
| `ADMIN` | 全部，不受指派限制 | ✅ | ✅ |
| `STAFF` | 僅被指派的項目 | ❌ | ❌ |

權限在**後端每個 API 上強制執行**，不是只在前端隱藏。使用者的啟用狀態與角色每次請求都以資料庫為準，停用或降級帳號會立即生效。

防鎖死保護：不能停用、降級或刪除自己的帳號，也不能移除系統中最後一位可登入的管理員。

## PWA

手機瀏覽器開啟網站 → 加入主畫面，即可以獨立視窗開啟（iOS Safari：分享 → 加入主畫面；Android Chrome：選單 → 安裝應用程式）。

Service Worker 只負責可安裝與離線提示；不快取任何需要登入狀態的內容，靜態檔採網路優先，線上更新後會立即拿到新版。

## Database

`migrations/` 下的 `.sql` 檔會依檔名順序在每次啟動時執行，內容必須可重複執行。

資料表：`users`、`clients`、`ad_accounts`、`report_logs`、`user_clients`。

## 安全機制

- 登入採 HttpOnly + SameSite=Lax + Secure Cookie，內容為 HMAC-SHA256 簽章的 session token（12 小時有效）；每次請求以資料庫確認帳號狀態與角色。
- 密碼以 scrypt 雜湊儲存；驗證使用 timing-safe 比對。
- 登入端點有節流保護（同 IP + 帳號 15 分鐘內 10 次）。
- 管理功能（`/api/admin/*`）與 `/admin` 頁面以使用者角色 `ADMIN` 控管。
- 每位使用者可檢視的廣告帳號由後端逐一驗證，無法靠直接呼叫 API 繞過。
- 所有寫入型請求會檢查 `Origin` 同源（CSRF 第二道防線）。
- 回應帶 CSP、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy` 等安全標頭。
- 所有外部輸入（客戶 ID、日期、Meta 物件 ID）在進入 SQL 或 Graph API 路徑前皆經白名單驗證。
- 僅明確標記的錯誤會回傳原始訊息，其餘一律回傳通用訊息並記錄於伺服器 log。

## 部署驗收

Railway 監看 `main`，push 即自動部署。確認新版已上線：

```
GET /health  →  {"ok":true,"service":"hunter-ads-report-system","ready":true}
```

`ready:true` 代表資料庫連線正常且 migration 已完成。若線上一直是舊版，先檢查 Railway → Settings → Source 是否顯示「Auto deploy unavailable」（GitHub App 被移除的症狀，見 `MEMORY.md`）。

## 狀態

- Node/Express server、PostgreSQL schema、Meta API client：done
- Campaign / Ad Set / Insights routes、統一／個別回報：done
- Auth / roles / 後台使用者管理 / 廣告帳號授權：done
- PWA、手機版最佳化：done
- 使用者自行改密碼：next
- 「手動回報」（Google Ads）：未實作，按鈕已隱藏
- Google Ads API 串接：不在 V1 範圍
