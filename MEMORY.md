# MEMORY.md — 決策紀錄與待辦

這份文件記錄「為什麼系統長這樣」，讓之後接手的人（或 AI）不用重新推導。
按時間倒序；每一項寫清楚背景、決定、代價。

---

## 2026-09-23 · 自製日期區間選擇器，移除原生日期欄位

**背景**：iPhone 上的原生 `<input type="date">` 有固定最小寬度，撐破版面（欄位右緣超出螢幕）；原生選擇器是英文、藍色系，跟整體設計不一致。使用者要求「不要原生」。

**決定**：
- 改為「快選膠囊（本月至今／上個月／近 7 天／近 30 天）＋ 區間欄位 ＋ 底部月曆」。
- 月曆一次選起訖：第一下選開始、第二下選結束；點到比開始更早的日期會改當開始；只點一天就套用視為單日。
- 未來日期停用、下個月按鈕在當月時停用（未來沒有成效資料）。
- 連續回報多個客戶時保留已選區間，不再每次重設為本月（原本每進一次都重設）。
- 日期一律用本地時間的 `YYYY-MM-DD` 字串處理，不用 `toISOString()`（會轉 UTC 差一天）。已驗證月底、跨年、閏年二月。

**代價**：多了約 150 行前端程式（`app.js`）與對應樣式；沒有引入任何套件。

---

## 2026-09-22 · UI 重整、PWA、手機版

**背景**：樣式散在 4 個檔案（`styles.css` 壓成一行 + 3 個 HTML 各自 inline），圓角有 7 種、按鈕高度 4 種、標題字級 4 種；主畫面沒有登出；手機加到主畫面後體驗跟一般網頁一樣。

**決定**：
- `styles.css` 改為全站唯一來源，設計 token 定義在 `:root`（見 `STYLE.md`）。
- 登入頁、後台、Token 頁全部改用共用樣式，HTML 內不再有 `<style>` 與 inline style。
- 主畫面 header 改成「左 返回｜中 標題｜右 重新整理 + 登出」，圖示用 inline SVG。
- 加入 PWA：`manifest.webmanifest`、`sw.js`、icons。Service Worker **只做**「可安裝」與離線提示，**不快取**任何需要登入狀態的內容；靜態檔採網路優先，避免再發生「線上更新了但手機看到舊版」。
- 首頁的 ☰ 原本是返回鍵，首頁按了沒反應 → 改成首頁隱藏、子頁顯示。
- 客戶清單改照字元順序排序（匯入順序沒有意義）。
- 統一回報的狀態碼（`ok` / `no_data`…）改顯示中文。

**代價**：`app.js` 由壓縮風格改為格式化程式碼，diff 很大，但之後可維護。

---

## 2026-09-22 · 密碼最短長度 12 → 4 → 6

**背景**：使用者希望同事好記。12 字元太長。

**決定**：先依要求改 4，說明風險（約 1 萬種組合，換 IP 即可繞過節流）後，使用者選擇 **6 字元**（約 10 億種組合，配合節流已足夠）。

**實作**：`MIN_PASSWORD_LENGTH` 只在 `services/auth.js` 定義一次，`users.js` 匯入使用；前端標示與文件同步。

---

## 2026-09-22 · 後台與每位使用者的廣告帳號授權

**背景**：需要管理使用者，並限制每個人只能看到自己負責的廣告帳號。

**決定**：
- 新增 `user_clients` 表；`ADMIN` 不受限制，`STAFF` 只能看到被指派的客戶。
- **授權在後端逐一強制執行**（客戶清單、廣告、廣告組合、統一／個別回報、回報紀錄的寫入與查詢共 6 個入口），前端隱藏不算授權。
- `/api/campaigns/:id/adsets` 改為必須帶 `accountId`，否則任何登入者都能用 ID 讀到別人的廣告組合。
- 防鎖死：不能停用／降級／刪除自己；不能移除最後一位可登入的管理員。

**發現並修正的漏洞**：做完「停用帳號」後測試，發現 session token 是自包含的，被停用或降級的帳號在 12 小時內仍保有原權限。改為 `requireLogin` 每次以資料庫為準；`/api/auth/me` 同樣處理。代價是每個請求多一次索引查詢，內部工具可接受。

---

## 2026-09-22 · 資安修補（首輪）

**背景**：初次完整讀 repo，列出的問題見下表。

| 問題 | 處置 |
|---|---|
| 預設帳密 `admin/1234` 寫死、登入頁預填帳號 | `DEFAULT_ADMIN_PASSWORD` 必填且有最短長度；不符則不建立帳號 |
| 既有資料庫裡的 `1234` 雜湊仍有效、無改密碼介面 | 新增 `DEFAULT_ADMIN_PASSWORD_ROTATE=true` 一次性輪替 |
| Graph API 路徑注入（`accountId` 直接拼進 URL） | `validate.js` 的 `requireMeta*` 白名單 + `meta.js` 二次防護 + 分頁只跟隨 `graph.facebook.com` |
| DB 連線 `rejectUnauthorized:false` | 預設驗證憑證；私有網址免 TLS；需明確 `DATABASE_SSL_INSECURE=true` 才關 |
| 啟動時 `migrate()` 失敗直接 crash | 記錄錯誤後繼續啟動，`/health` 回 `ready:false` |
| 每次啟動全量匯入 Meta 帳號 | 改為 `BOOTSTRAP_META_ON_START` opt-in，預設關 |
| Schema 雙來源（`migrations/*.sql` vs `migrate.js` 內嵌）已漂移 | `migrations/` 成為唯一來源，`migrate.js` 只負責執行 |
| 無 lockfile | 產生 `package-lock.json` |
| `/api/clients` N+1 且單一帳號失敗拖垮整頁 | 60 秒快取、並行上限 4、單帳號失敗容錯 |
| `report_logs.user_id` 永遠 NULL | 寫入 `req.user.uid` |
| 雙軌認證（session + `x-admin-key`） | 統一為 session 角色，移除 `x-admin-key` |
| 錯誤一律 500 且外露內部訊息 | `httpError` 標記可外露；其餘通用訊息 |
| 無 CSRF 二層防護、無節流、無安全標頭 | 同源檢查、登入節流（同 IP+帳號 15 分鐘 10 次）、CSP 等標頭 |
| inline `<script>` 阻礙 CSP | 外部化為 `login.js` / `token.js` |

**刻意未動**（業務規則，改了會變結果）：
- `detectCampaignType` 靠廣告名稱含「私訊」「流量」判斷。脆弱但是現行規則。
- 流量型加收 5% 服務費、私訊型不加。
- `resultCount` 在 `optimization:` 前綴時為 0。需真實資料才能驗證正確行為。

---

## 2026-09-22 · Railway 部署卡住的根因

**症狀**：push 到 `main` 後線上一直是舊版；Railway 的 Deployments 顯示同一個舊 commit 被重跑。

**根因**：Railway 的 GitHub App 從使用者的 GitHub 帳號被移除（`github.com/settings/installations` 的 Installed 清單裡沒有 Railway）。Railway Settings → Source 出現「Auto deploy unavailable」與「Could not load branches」。

**修法**：Railway → Settings → Source → Disconnect → Connect Repo → 依導引重新安裝 GitHub App 並勾選 `hunter`。

**教訓**：Railway 在這種狀況下**不會發任何通知**。之後若「改了但線上沒變」，第一步先開 `/health` 看版本。

---

## 尚未完成 / 已知缺口

| 項目 | 狀態 | 備註 |
|---|---|---|
| 換掉正式環境的舊 `admin` 密碼 | ⬜ 待使用者執行 | 設 `DEFAULT_ADMIN_PASSWORD` + `DEFAULT_ADMIN_PASSWORD_ROTATE=true` → 部署 → 改回 `false` |
| 設定獨立的 `SESSION_SECRET` | ⬜ 建議 | 目前 fallback 到 `ADMIN_KEY` |
| 同事自己改密碼 | ⬜ 未做 | 目前只有管理員能改別人的密碼 |
| 「＋ 手動回報」功能 | ⬜ 未做 | 按鈕已隱藏（`index.html` 加 `hidden`）；實作時移除即可 |
| Meta Graph API 實際呼叫的驗證 | ⚠️ 未在開發環境測過 | 沒有有效 token，只驗證到參數組裝與錯誤處理 |
| 自動化測試 | ⬜ 無 | 目前靠本機 Postgres + curl + Playwright 手動驗證 |
