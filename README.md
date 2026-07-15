# lihi 實驗室文案產生器 V1

這是一個獨立頁面的網頁版文案產生器原型，目標是先把第一版使用流程做順：行銷人輸入產品資訊後，系統會組成給貝克 v1 的 prompt，並產出一則固定格式的廣告文案。

## 前端表單 Spec

- 產品名稱：必填，1 到 80 字
- 產品優點：必填，3 到 5 項，每項 1 到 60 字
- 產品頁連結：必填，需為合法網址
- 文案風格：`warm` 或 `aggressive`

## 輸出格式

- 標題：一句
- 主文：一段
- CTA：一句
- 連結：原始產品頁網址

## 互動流程

1. 使用者填表
2. 前端做欄位驗證
3. 將資料送到 `/api/generate-copy`
4. server 組成 prompt
5. 若設定 `BECK_V1_ENDPOINT`，轉送到真實 agent
6. 若未設定 endpoint，改用 mock 模式產出 fallback 文案

## 啟動方式

```bash
npm start
```

預設會啟動在 <http://localhost:3000>

## 真實 Agent 串接

### 模式 A：透過本機 OpenClaw 直接呼叫 `beck-v1`

```bash
BECK_V1_MODE=openclaw npm start
```

如需指定 agent id：

```bash
OPENCLAW_AGENT_ID=beck-v1
BECK_V1_MODE=openclaw
npm start
```

### 模式 B：透過自訂 HTTP endpoint

若要串接真正的貝克 v1，請設定：

```bash
BECK_V1_ENDPOINT=https://your-agent-endpoint
BECK_V1_API_KEY=your-key
npm start
```

目前 server 會送出以下 payload：

```json
{
  "input": {
    "productName": "AI 廣告助手",
    "benefits": [
      "快速整理產品賣點",
      "減少文案來回修改",
      "可套用既有行銷語氣"
    ],
    "productUrl": "https://example.com/product",
    "tone": "warm"
  },
  "prompt": "..."
}
```

真實 agent 只要回傳以下任一格式即可：

```json
{
  "title": "標題",
  "body": "主文",
  "cta": "CTA",
  "url": "https://example.com/product"
}
```

或：

```json
{
  "output": {
    "title": "標題",
    "body": "主文",
    "cta": "CTA",
    "url": "https://example.com/product"
  }
}
```

## GitHub Pages Demo

- `public/` 可以直接部署成 GitHub Pages
- 沒有後端時，頁面會自動切到 static demo mock 模式
- 若未來有公開 API，可修改 `public/config.js` 的 `apiBaseUrl`

## 本機 Live 對外測試

若要直接把本機 `beck-v1` live 版公開成測試網址：

```bash
chmod +x scripts/start-live.sh scripts/stop-live.sh
./scripts/start-live.sh
```

停止：

```bash
./scripts/stop-live.sh
```

啟動後可從 `.runtime/tunnel.log` 取得 `trycloudflare.com` 測試網址。
