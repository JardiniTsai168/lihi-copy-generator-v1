# Lihi Copy Generator 文案產生器

一個由貝克 v1 驅動的廣告文案產生器

## 快速開始

### Local Development

```bash
npm start
```

然後開啟 <http://localhost:3000>

### Live 部署

```bash
./scripts/start-live.sh
```

伺服器會在 port 3000 啟動

## 環境變數

```bash
PORT=3000
```

## API

### POST /api/generate-copy

**Request**
```json
{
  "product_name": "產品名稱",
  "benefits": ["優點 1", "優點 2", "優點 3"],
  "product_url": "https://example.com",
  "tone": "warm"
}
```

**Response**
```json
{
  "title": "標題",
  "body": "主文內容",
  "cta": "CTA 文字",
  "url": "https://example.com"
}
```

## GitHub Pages Demo

<https://jardinitsai168.github.io/lihi-copy-generator-v1/>

## License

MIT
