# Lihi Copy Generator 文案產生器

一個由貝克 v1 驅動的廣告文案產生器

## 快速開始

### Worker 本機開發

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

然後開啟 <http://127.0.0.1:8787>

沒有設定 `BECK_V1_ENDPOINT` 時，Worker 會自動以 mock 模式提供 `/api/health` 與 `/api/generate-copy`。

### Cloudflare Worker 部署

```bash
npm run deploy
```

部署前請先設定 Cloudflare secrets / vars：

```bash
wrangler secret put BECK_V1_API_KEY
wrangler secret put BECK_V1_ENDPOINT
```

如果你的 endpoint 不吃標準 `Authorization: Bearer ...`，也可以額外設定：

```bash
wrangler secret put BECK_V1_AUTH_HEADER
```

Worker 會把以下 payload 送到 `BECK_V1_ENDPOINT`：

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

### Legacy Node server

如果還要沿用先前的本機 `express` 測試流程：

```bash
npm run dev:legacy
```

## 環境變數

```bash
BECK_V1_ENDPOINT=https://your-agent-endpoint.example.com/generate-copy
BECK_V1_API_KEY=replace-me
BECK_V1_TIMEOUT_MS=30000
```

## API

### POST /api/generate-copy

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
  "prompt": "...",
  "output": {
    "title": "標題",
    "body": "主文內容",
    "cta": "CTA 文字",
    "url": "https://example.com"
  }
}
```

## GitHub Pages Demo

<https://jardinitsai168.github.io/lihi-copy-generator-v1/>

GitHub Pages 版本仍是純靜態 demo，不會呼叫 Worker live endpoint。

## License

MIT
