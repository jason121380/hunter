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
- META_ACCESS_TOKEN
- META_APP_ID
- META_APP_SECRET
- META_API_VERSION=v26.0
- DATABASE_URL
- SESSION_SECRET

## Database
migrations/001_init.sql:
- users
- clients
- ad_accounts
- report_logs

## Migration status
- Node/Express server scaffold: done
- PostgreSQL schema: done
- Meta API client / token status: done
- Campaign / Ad Set / Insights routes: next
- Frontend REST migration: next
- Auth / roles: next
