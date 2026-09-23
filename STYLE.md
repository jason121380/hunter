# STYLE.md — UI 樣式規範

全站樣式只有一個來源：`public/styles.css`。所有數值都是 `:root` 裡的設計 token；
元件引用 token，不寫死 px。HTML 內**不放** `<style>` 區塊與 inline style。

目標：一個手機優先的內部工具，乾淨、對比清楚、拇指好按。品牌色是橘色 `#ff6500`，只用在強調處，不鋪滿。

---

## 1. 設計 Token

### 色彩

| Token | 值 | 用途 |
|---|---|---|
| `--brand` | `#ff6500` | 主要按鈕、標籤（eyebrow）、選取態邊框 |
| `--brand-strong` | `#e85c00` | 主要按鈕 hover、品牌色文字 |
| `--brand-soft` | `#fff4ec` | 選取態背景、品牌色淡底 |
| `--brand-line` | `#ffd3b5` | 品牌色邊框、spinner 底環 |
| `--text` / `--text-2` / `--text-3` | `#171717` / `#5b5b5b` / `#8b8b8b` | 主文字 / 次要說明 / 輔助資訊 |
| `--bg` / `--surface` / `--surface-2` | `#f4f5f7` / `#fff` / `#f8f9fa` | 頁面底 / 卡片與外殼 / 次層底 |
| `--line` / `--line-soft` | `#e6e7ea` / `#f0f1f3` | 卡片邊框 / 分隔線 |
| `--ok`、`--danger`、`--warn` 各含 `-bg`、`-line` | — | 狀態色，只用在狀態徽章、錯誤框、危險按鈕、已回報卡片 |
| `--info` / `--info-bg` | `#1d5fbf` / `#eef4ff` | 流量型廣告徽章 |

### 間距（4px 基準）

`--s1` 4 · `--s2` 8 · `--s3` 12 · `--s4` 16 · `--s5` 20 · `--s6` 24 · `--s7` 28 · `--s8` 32 · `--s10` 40 · `--s12` 48

慣用組合：
- 卡片內距 `--s4 --s5`（上下 16、左右 20）
- 清單間距 `--s3`（12）
- 區塊之間 `--s5`（20）
- 頁面左右邊距 `--s5`（20），底部留 `--s12 × 2` 加安全區

### 圓角

`--r-sm` 10（小按鈕、輸入框內元件） · `--r-md` 14（按鈕、輸入框、指標卡） · `--r-lg` 18（清單卡片、面板） · `--r-xl` 22（登入卡） · `--r-pill` 999（徽章）

### 字級

| Token | px | 用途 |
|---|---|---|
| `--fs-xs` | 12 | 徽章、指標標籤、輔助提示 |
| `--fs-sm` | 13 | `.meta`、eyebrow、表單標籤 |
| `--fs-base` | 15 | 內文（`:root` 預設） |
| `--fs-md` | 16 | 卡片標題、輸入框（**不可低於 16，否則 iOS 會自動縮放**） |
| `--fs-lg` | 18 | `h2` |
| `--fs-xl` | 22 | 指標數值 |
| `--fs-2xl` | 26 | `h1` |

行高：標題 `--lh-tight` 1.25，內文 `--lh-normal` 1.55。

### 尺寸

- `--control-h` 48：所有按鈕與輸入框高度
- `--header-h` 56：頂欄（會再加上 `env(safe-area-inset-top)`）
- 圖示按鈕 44 × 44：最小觸控目標
- `--app-w` 580 / `--app-w-wide` 820：主畫面 / 後台的最大寬度

---

## 2. 版面

```
.app                外殼：置中、白底、最小高度 100vh
  header            sticky 頂欄，三欄 grid「1fr auto 1fr」→ 標題永遠置中
    .hdr-side       左側容器（返回鍵 / 返回連結）
    .hdr-side--end  右側容器（重新整理、登出）
  main
    .screen         單頁式主畫面的每個畫面；.active 才顯示
    .page           一般頁面（後台、Token）
```

頂欄圖示用 inline SVG（24 viewBox、stroke 2、`currentColor`），放在 `.icon-btn` 裡。不要用 emoji 或文字符號當圖示。

---

## 3. 元件與 class

### 文字階層

```html
<small class="eyebrow">分類標籤</small>    <!-- 主畫面裡直接寫 <small> 也可 -->
<h1>頁面標題</h1>
<p class="lead">一句說明</p>
<span class="meta">輔助資訊</span>
<div class="note">補充說明區塊</div>
```

### 按鈕

| class | 用途 |
|---|---|
| `.primary` | 每個畫面最多一個主要動作 |
| `.outline` | 次要動作 |
| `.outline.outline--brand` | 次要但要吸引注意（如「手動回報」） |
| `.danger` | 破壞性動作（刪除） |
| `.link` | 文字連結型按鈕（頂欄） |
| `.icon-btn` | 44×44 純圖示按鈕 |

在 `.screen` 直下的 `.primary` / `.outline` 會自動整行。多顆並排用 `.actions`（有 gap，會換行）。

### 卡片與清單

```html
<div class="list">
  <button class="client|card|adset|user"><b>標題</b><span class="meta">說明</span></button>
</div>
```

四種卡片共用同一組樣式；`.selected` 表示已選取（橘框橘底）。`.card` 內的 `<span>` 用次要文字色。

### 表單

```html
<label class="field">標籤
  <input type="text">          <!-- 或 select / textarea -->
</label>
<div class="hint">欄位提示</div>
```

不使用原生 `<input type="date">`（iOS 的原生欄位有固定最小寬度會撐破版面，選擇器樣式也無法統一），日期一律用下面的區間選擇器。

### 統計區間選擇器

```html
<div class="presets">
  <button class="chip active" data-preset="mtd">本月至今</button> …
</div>
<button class="range-field">
  <span class="range-part"><small>開始日期</small><b>2026/09/01</b></span>
  <svg class="range-arrow">…</svg>
  <span class="range-part"><small>結束日期</small><b>2026/09/22</b></span>
  <svg class="range-cal">…</svg>
</button>
<div class="range-meta">共 22 天</div>
```

- `.chip`：44px 高的膠囊按鈕，`.active` 為選取態。
- `.range-field`：點擊開啟底部月曆；四欄 grid 的日期欄用 `minmax(0, 1fr)`，窄螢幕不會撐破。
- 日期顯示格式 `YYYY/MM/DD`；程式內部一律用本地時間的 `YYYY-MM-DD` 字串（可直接比大小，避免 UTC 差一天）。

### 底部彈出面板（Bottom sheet）與月曆

```html
<div class="sheet">
  <div class="sheet-backdrop" data-close></div>
  <div class="sheet-panel" role="dialog" aria-modal="true">
    <div class="sheet-grip"></div>
    …內容…
    <div class="sheet-actions"><button class="outline" data-close>取消</button><button class="primary">套用</button></div>
  </div>
</div>
```

- 帶 `data-close` 的元素點擊即關閉；開啟時 `body.no-scroll` 鎖住背景捲動。
- 月曆：`.cal-head`（上／下個月 + 標題）、`.cal-week`（日～六）、`.cal-grid` 內每格 `.day`。
- 狀態 class：`.is-start`、`.is-end`、`.in-range`、`.has-end`（起點且有終點）、`.is-today`；未來日期 `disabled`。
- 區間色帶以 `::before` 畫出：起點右半、終點左半、中間整格，在每週第一／最後一格收圓角。

### 成效結果：回報卡片

與舊版 Apps Script 相同：每個廣告一張卡片，內含可直接貼給客戶的回報文字。

```html
<div class="result result-list">
  <article class="report [is-reported]">
    <div class="report-head">
      <div class="report-title">
        <strong>廣告名稱</strong>
        <span class="type-badge type-message|type-traffic">私訊型廣告</span>
      </div>
      <span class="status status-pending|status-done">尚未回報 / ✓ 已回報</span>
    </div>
    <pre class="report-text">回報文字…</pre>
    <button class="copy-btn [is-done]">複製回報 / 再次複製</button>
  </article>
</div>
```

- `.report.is-reported`：已回報，淡綠底綠框；`.copy-btn.is-done` 變綠色「再次複製」。
- `.report-text`：`white-space: pre-wrap`，可選取（剪貼簿失敗時使用者可長按手動複製）。
- 無法回報的狀態（無資料、需個別回報）不顯示文字與按鈕，改顯示 `.report-msg` 說明；`.status-*` 對應後端的 `status` 值：`no_data`、`requires_individual`、`no_active_adsets`、`error`。
- 回報卡片內的 `.copy-btn` 是「每張卡片一個主要動作」，不受「每個畫面只有一個 `.primary`」限制。

### 回饋

- `.loading`：全螢幕遮罩 + `.spinner`（尊重 `prefers-reduced-motion`，只放慢不停止）。用在「使用者按了按鈕、必須等結果」的情境。
- `.skeleton`：灰色閃爍佔位條，`.skeleton--title` 為較粗的標題版；`.client--skeleton` 是整張佔位卡片。用在「畫面可以先出來、部分資料晚點補」的情境，比全螢幕遮罩好：使用者不用等就能操作。
- `.icon-btn.spinning`：圖示按鈕正在處理（例如 ↻ 重新整理時旋轉）。
- `.counts-info`：清單上方的輔助說明（例如資料更新時間），內容為空時自動隱藏。
- `.toast`：底部浮出訊息，會避開安全區
- `.error-box`：區塊內的錯誤（橘底）；`.form-error`：表單下方的錯誤（預設隱藏，JS 切 `display`）

### 後台專用

`.panel`（編輯面板）、`.panel-section`（面板內的分隔區）、`.badge`（`.admin` / `.off`）、`.accounts` + `.acct` + `.acct-name`（廣告帳號勾選清單）、`.picker-tools`（全選／全部取消）。

---

## 4. 手機與 PWA

- viewport 含 `viewport-fit=cover`；頂欄與底部內距都加了 `env(safe-area-inset-*)`，瀏海與 Home 條不會壓到內容。
- 所有可點元素至少 44px 高；`touch-action: manipulation` 移除點擊延遲；關閉 tap highlight。
- 輸入框 16px，避免 iOS 聚焦時自動放大；輸入框與 grid 欄位加 `min-width: 0`，避免內容撐破版面。
- 不用原生日期欄位（見「統計區間選擇器」）。
- 頂欄半透明毛玻璃（`backdrop-filter`），捲動時內容從底下滑過。
- PWA：`manifest.webmanifest`（standalone、直向、品牌色）+ `sw.js` + `icons/`。Service Worker 不快取登入相關內容，靜態檔網路優先。
- 圖示來源是 `icons/icon.svg`；PNG 由它渲染產生（192、512、maskable 512、apple-touch 180）。改圖示時四個 PNG 要一起重產。

---

## 5. 做與不做

**做**
- 新元件先看有沒有現成 class 可以組合；沒有才加，加在 `styles.css` 對應區段。
- 用 token；需要新數值時先問「現有的 scale 能不能用」。
- 每個畫面只有一個 `.primary`。
- 中文與數字混排時，數字用 `font-variant-numeric: tabular-nums`（指標已設）。

**不做**
- 不在 HTML 裡寫 `style=""` 或 `<style>`。
- 不用 emoji 當圖示。
- 不用 `!important`（`[hidden]` 是唯一例外，為了壓過任何 display 設定）。
- 不寫 12px 以下的字。
- 不加動畫，除非它傳達狀態（spinner、skeleton、按下縮放、面板滑出）。
