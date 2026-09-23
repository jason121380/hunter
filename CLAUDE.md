# CLAUDE.md — 給 Claude Code 的專案說明

這份文件是 Claude Code（或任何 AI 協作工具）進入這個 repo 時的第一份指引。
人類開發者請看 `README.md`；UI 規範看 `STYLE.md`；歷史決策看 `MEMORY.md`。

## 專案一句話

內部用的 Meta 廣告成效回報系統。Node 22 + Express 5 + PostgreSQL，前端是無框架的原生 JS，部署在 Railway。

## 指令

```bash
npm ci                # 安裝（有 package-lock.json，不要用 npm install）
npm run dev           # 本機開發（node --watch）
npm start             # 正式啟動
node --check <file>   # 語法檢查（沒有測試框架，這是最低限度）
```

本機需要 PostgreSQL。最少的環境變數：`DATABASE_URL`、`SESSION_SECRET`、`DEFAULT_ADMIN_PASSWORD`（≥ 6 字元）。完整清單見 `.env.example`。

## 架構地圖

```
src/
  server.js          啟動序：migrate → 啟動檢查 → listen；所有 middleware 與路由掛載順序在這裡
  config.js          環境變數唯一入口，其他檔案不要直接讀 process.env
  db.js              pg Pool、query()、withTransaction()
  errors.js          httpError(status, message)：唯一可對外顯示的錯誤型別
  validate.js        所有外部輸入的白名單驗證（ID、日期、Meta ID、列舉）
  migrate.js         依檔名順序執行 migrations/*.sql（必須可重複執行）
  middleware/
    security.js      安全標頭 + 寫入型請求的同源檢查
    rate-limit.js    登入節流
    admin.js         requireAdmin（角色 ADMIN）
  services/
    auth.js          密碼雜湊、session token、requireLogin、ensureDefaultAdmin
    access.js        每位使用者可看哪些客戶（授權邊界）
    users.js         後台的使用者 CRUD 與客戶指派
    meta.js          Graph API 客戶端（路徑白名單、分頁主機檢查、token 遮蔽）
    ads.js           campaigns / adsets / insights；報表用 60 秒快取，首頁廣告數另有 10 分鐘 stale-while-revalidate 快取
    unified.js       統一回報
    reports.js       純函式：判斷廣告類型、組報表
    clients.js       客戶清單（依使用者權限過濾）
  routes/            只做參數整理與呼叫 service，不放業務邏輯
public/
  styles.css         全站唯一樣式來源（設計 token 在 :root）
  index.html/app.js  回報系統主畫面（單頁，section 切換）
  login.html/.js     登入
  admin.html/.js     後台（僅 ADMIN）
  token.html/.js     Meta Token 交換（僅 ADMIN）
  gestures.js        PWA 模式專用：禁止縮放、左緣右滑返回（送出 edge-back 事件）
  sw.js / manifest.webmanifest / icons/   PWA
migrations/          schema 唯一來源
```

## 不可打破的規則

這些是安全邊界，改動前先讀懂為什麼存在（`MEMORY.md` 有來龍去脈）：

1. **所有外部輸入都經過 `validate.js`**。特別是會被拼進 Graph API URL 的 `accountId`／`campaignId`／`adSetIds`，一定用 `requireMeta*` 系列，否則會有路徑注入。
2. **每個接受 `clientId`／`accountId` 的路由都要呼叫 `access.js`** 的 `assertClientAllowed` 或 `assertAccountAllowed`。前端隱藏不算授權。
3. **`requireLogin` 以資料庫為準**，不是只驗 token。停用／降級必須立即生效。不要為了省一次查詢改回只驗 token。
4. **對外錯誤只走 `httpError`**。其他例外一律回傳通用訊息並寫 log；不要把 `error.message` 直接丟給客戶端。
5. **密碼最短長度只有一個定義**：`MIN_PASSWORD_LENGTH` in `services/auth.js`。前端文字與文件要跟著它。
6. **Secret 不進 repo**。`.env.example` 只放空值與說明。
7. **不要關掉資料庫 TLS 驗證**來解決連線問題；用 `.railway.internal` 內部網址。
8. **靜態資源預設在登入牆之後**。要公開的檔案必須加進 `server.js` 的 `PUBLIC_ASSETS` 清單，並確認內容不敏感。

9. **報表不可使用首頁的長快取**。`campaignCounts()`（10 分鐘）只給首頁顯示數字用；統一／個別回報必須走 `activeCampaigns()`（60 秒），否則剛上線的廣告會漏報。

## 程式慣例

- ESM（`"type": "module"`），Node ≥ 20。
- 註解與使用者可見訊息用**繁體中文**；識別字用英文。
- 前端 JS 寫成可讀的格式化程式碼（早期的 `app.js` 是壓縮風格，已改掉，不要再寫回去）。
- CSS 只用 `styles.css` 裡的 token，不在 HTML 裡寫 inline style，不在頁面內開 `<style>`。規範見 `STYLE.md`。
- 路由檔只做「取參數 → 驗證 → 呼叫 service → 回 JSON」，業務邏輯放 service。
- 新增資料表或欄位：新增一個 `migrations/00N_xxx.sql`，內容必須可重複執行（`IF NOT EXISTS`）。
- 不要為了單一用途加抽象層；不要引入新的依賴（目前只有 `express` 和 `pg`），除非真的需要。

## 驗證方式

沒有自動化測試套件。改動後至少做到：

1. `node --check` 所有動到的檔案。
2. 用本機 PostgreSQL 跑起來，`curl` 打相關端點確認狀態碼與回應。
3. 動到前端時，用 Playwright（Chromium 已預裝）實際載入頁面看有沒有 JS 錯誤與版面問題。
4. 安全相關改動：測「不該過的要被擋」，不只測「該過的能過」。

## 部署

Railway 監看 `main`，push 即部署。驗收：`GET /health` 回 `"ready":true` 代表新版已上線且資料庫連線正常。

Railway 的 GitHub App 曾被移除過一次，症狀是 Settings → Source 出現「Auto deploy unavailable」與「Could not load branches」；修法是重新安裝 GitHub App（見 `MEMORY.md`）。

## Commit 慣例

- 標題：`type: 簡述`，type 用 `feat` / `fix` / `security` / `docs` / `chore`。
- 內文用繁體中文說明「為什麼」，不只是「做了什麼」。
- 一個 commit 一個主題；安全修正與功能分開。
