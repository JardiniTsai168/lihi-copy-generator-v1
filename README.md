# Lihi Copy Generator 文案產生器

一個把 Beck 文案策略框架產品化的客戶版廣告文案產生器

## 快速開始

### Worker 本機開發

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

然後開啟 <http://127.0.0.1:8787>

沒有設定 `COPY_ENGINE_ENDPOINT` 或 `BECK_V1_ENDPOINT` 時，Worker 會自動以 mock 模式提供 `/api/health` 與 `/api/generate-copy`。

### Cloudflare Worker 部署

```bash
npm run deploy
```

部署前請先設定 Cloudflare secrets / vars：

```bash
wrangler secret put COPY_ENGINE_API_KEY
wrangler secret put COPY_ENGINE_ENDPOINT
```

相容舊設定的話，也可以沿用 `BECK_V1_API_KEY` 與 `BECK_V1_ENDPOINT`。

Worker 會把以下 payload 送到 copy engine endpoint：

```json
{
  "prompt": "...",
  "product_name": "產品名稱",
  "benefits": ["優點 1", "優點 2", "優點 3"],
  "product_url": "https://example.com",
  "tone": "warm"
}
```

endpoint 可回傳兩種格式之一：

```json
{
  "output": {
    "title": "標題",
    "body": "主文",
    "cta": "CTA",
    "url": "https://example.com"
  }
}
```

或純文字：

```text
標題：...
主文：...
CTA：...
連結：...
```

### Bridge Server

本機 bridge server 會保留頁面分析與 OCR，但不再依賴 OpenClaw session，而是直接呼叫模型 API：

```bash
npm run bridge:start
```

## 環境變數

```bash
COPY_ENGINE_ENDPOINT=https://your-copy-engine.example.com
COPY_ENGINE_API_KEY=replace-me
OPENAI_API_KEY=replace-me
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TIMEOUT_MS=60000
SCREENSHOTONE_ACCESS_KEY=replace-me
SCREENSHOTONE_ENABLED=true
```

## API

### POST /api/generate-copy

live 模式現在的後端流程是：

1. 抓取 `productUrl` 銷售頁 HTML
2. 若 HTML 被 `401/403/429` 或逾時，改用 `ScreenshotOne` 取得 full-page screenshot slices
3. 解析頁面 title、meta、heading、段落、價格訊號與圖片資訊
4. 收集完整商品圖清單，並對商品圖或 screenshot slices 跑 OCR
5. 挑選高價值商品圖與 screenshot slices 做 vision 分析
6. 把頁面分析結果與使用者輸入欄位合成 Beck 文案策略 prompt
7. 直接交給模型 API 產出文案

**Request**
```json
{
  "productName": "產品名稱",
  "benefits": ["優點 1", "優點 2", "優點 3"],
  "productUrl": "https://example.com",
  "tone": "warm"
}
```

**Response**
```json
{
  "ok": true,
  "mode": "live",
  "provider": "openai",
  "model": "gpt-4.1-mini",
  "prompt": "...",
  "pageAnalysis": {
    "sourceUrl": "https://example.com",
    "summary": "頁面摘要..."
  },
  "output": {
    "title": "標題",
    "body": "主文內容",
    "cta": "CTA 文字",
    "url": "https://example.com"
  }
}
```

### OCR / 頁面分析相關環境變數

```bash
PAGE_FETCH_TIMEOUT_MS=15000
IMAGE_FETCH_TIMEOUT_MS=15000
OCR_IMAGE_LIMIT=3
OCR_MAX_IMAGE_BYTES=4194304
OCR_LANG=chi_tra+eng
MAX_PRODUCT_IMAGES=30
OCR_ALL_IMAGES=true
VISION_IMAGE_LIMIT=8
SCREENSHOT_VISION_LIMIT=3
SCREENSHOTONE_ACCESS_KEY=replace-me
SCREENSHOTONE_ENABLED=true
SCREENSHOTONE_API_BASE_URL=https://api.screenshotone.com/take
SCREENSHOTONE_VIEWPORT_WIDTH=1440
SCREENSHOTONE_VIEWPORT_HEIGHT=1800
SCREENSHOTONE_FULL_PAGE_MAX_HEIGHT=20000
SCREENSHOTONE_SLICE_HEIGHT=4000
```

## GitHub Pages Demo

<https://jardinitsai168.github.io/lihi-copy-generator-v1/>

GitHub Pages 版本仍是純靜態 demo，不會呼叫 live endpoint。

## License

MIT
