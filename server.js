require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const BECK_V1_SESSION_KEY =
  process.env.BECK_V1_SESSION_KEY || "agent:beck-v1:main";
const BECK_V1_TRANSCRIPT_PATH =
  process.env.BECK_V1_TRANSCRIPT_PATH ||
  "/Users/tonytsai/.openclaw/agents/beck-v1/sessions/46152bc9-a3e6-47b4-bce5-0dc0e0b59514.jsonl";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "openclaw";
const OPENCLAW_TIMEOUT_MS = Number(process.env.OPENCLAW_TIMEOUT_MS || 90000);
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || "";

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let beckV1Available = false;

function isAuthorized(req) {
  if (!BRIDGE_API_KEY) {
    return true;
  }

  const authHeader = req.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  return bearer === BRIDGE_API_KEY;
}

async function checkBeckV1() {
  try {
    await fs.access(BECK_V1_TRANSCRIPT_PATH);
    beckV1Available = true;

    if (beckV1Available) {
      console.log('✅ 貝克 v1 session 可用');
    } else {
      console.log('⚠️ 貝克 v1 session 未找到，將使用 mock 模式');
    }
  } catch (e) {
    console.log('⚠️ 無法檢查 beck-v1 session，將使用 mock 模式');
    beckV1Available = false;
  }
}

app.get('/api/health', async (req, res) => {
  await checkBeckV1();
  res.json({
    status: 'ok',
    service: 'lihi-copy-generator',
    version: '1.1.0',
    beckV1Available,
    endpointMode: beckV1Available ? 'live' : 'mock',
    mode: beckV1Available ? 'live' : 'mock'
  });
});

app.post('/api/generate-copy', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { product_name, benefits, product_url, tone } = req.body;

  const errors = [];

  if (!product_name || typeof product_name !== 'string' || product_name.trim() === '') {
    errors.push('product_name 是必填欄位');
  }

  if (!Array.isArray(benefits) || benefits.length < 3 || benefits.length > 5) {
    errors.push('benefits 需要 3~5 項');
  }

  if (Array.isArray(benefits)) {
    benefits.forEach((b, i) => {
      if (!b || typeof b !== 'string' || b.trim() === '') {
        errors.push(`benefits[${i}] 不能為空`);
      }
    });
  }

  if (!product_url || typeof product_url !== 'string' || !isValidUrl(product_url)) {
    errors.push('product_url 必須是合法網址');
  }

  if (!tone || !['warm', 'aggressive'].includes(tone)) {
    errors.push('tone 必須是 warm 或 aggressive');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'validation_failed', errors });
  }

  try {
    const copyResult = await generateCopyWithBeckV1(product_name, benefits, product_url, tone);
    res.json(copyResult);
  } catch (error) {
    console.error('生成文案時出錯:', error);
    const mockResponse = generateMockCopy(product_name, benefits, product_url, tone);
    res.json(mockResponse);
  }
});

async function generateCopyWithBeckV1(productName, benefits, productUrl, tone) {
  const toneLabel = tone === 'warm' ? '溫和風格' : 'aggressive 風格';
  const requestId = `webcopy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const benefitsList = benefits.map((b, i) => `${i + 1}. ${b}`).join('\n');

  const prompt = `[webcopy-request:${requestId}]

你是「貝克 v1」，擅長整合行銷策略、受眾洞察、轉換導向寫作經驗，以及既有知識庫中的行銷相關資料，產出可直接使用的廣告文案。

請根據以下資訊，產出 1 則可直接使用的廣告文案：

產品名稱：${productName}
產品優點：
${benefitsList}

產品頁連結：${productUrl}
文案風格：${toneLabel}

請遵守以下規則：
1. 文案要符合行銷用途，語氣自然、有說服力。
2. 需依照「貝克 v1」既有的行銷知識、經驗與已整理的行銷資料來生成。
3. 若風格是「溫和」，語氣要偏信任感、專業感、引導式溝通。
4. 若風格是「aggressive」，語氣要偏強烈、直接、促動行動，但不要低俗或過度誇大。
5. 不要產出多個版本，先只產出一個最佳版本。
6. 不要解釋你的思考過程，只輸出結果。
7. 不要提到 request id、系統標記或 webcopy-request。

請用以下格式輸出：

標題：
主文：
CTA：
連結：`;

  try {
    console.log('📤 呼叫 beck-v1 agent...');
    const rawOutput = await sendPromptViaOpenClaw(prompt, requestId);
    console.log('📥 beck-v1 回應:', rawOutput.substring(0, 200) + '...');
    return parseCopyOutput(rawOutput, productUrl);
  } catch (error) {
    console.error('呼叫 beck-v1 失敗:', error);
    throw new Error('無法呼叫貝克 v1 agent');
  }
}

async function sendPromptViaOpenClaw(prompt, requestId) {
  const startedAt = new Date();
  const child = spawn(
    OPENCLAW_BIN,
    [
      'terminal',
      '--local',
      '--deliver',
      '--session',
      BECK_V1_SESSION_KEY,
      '--message',
      prompt,
      '--timeout-ms',
      String(OPENCLAW_TIMEOUT_MS)
    ],
    {
      detached: true,
      stdio: 'ignore'
    }
  );

  child.unref();

  try {
    const result = await waitForAssistantReply(requestId, startedAt, OPENCLAW_TIMEOUT_MS);
    return result;
  } finally {
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch (_) {
      // ignore process cleanup failures
    }
  }
}

async function waitForAssistantReply(requestId, startedAt, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const lines = await readTranscriptLines();
    let requestMessageId = null;

    for (const entry of lines) {
      const message = entry?.message;
      if (!message) continue;

      if (
        message.role === 'user' &&
        typeof message.content === 'string' &&
        message.content.includes(`[webcopy-request:${requestId}]`) &&
        new Date(entry.timestamp).getTime() >= startedAt.getTime()
      ) {
        requestMessageId = entry.id;
      }
    }

    if (requestMessageId) {
      for (const entry of lines) {
        const message = entry?.message;
        if (!message) continue;

        if (
          message.role === 'assistant' &&
          entry.parentId === requestMessageId &&
          Array.isArray(message.content)
        ) {
          const text = message.content
            .filter((item) => item.type === 'text' && item.text)
            .map((item) => item.text)
            .join('\n')
            .trim();

          if (text) {
            return text;
          }
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('等待 beck-v1 回應逾時');
}

async function readTranscriptLines() {
  const raw = await fs.readFile(BECK_V1_TRANSCRIPT_PATH, 'utf8');
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function parseCopyOutput(rawOutput, defaultUrl) {
  const lines = rawOutput.split('\n').filter(line => line.trim());
  let title = '', body = '', cta = '', url = defaultUrl;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('標題：')) {
      title = trimmed.replace('標題：', '').trim();
    } else if (trimmed.startsWith('主文：')) {
      body = trimmed.replace('主文：', '').trim();
    } else if (trimmed.startsWith('CTA：')) {
      cta = trimmed.replace('CTA：', '').trim();
    } else if (trimmed.startsWith('連結：')) {
      url = trimmed.replace('連結：', '').trim();
    }
  }
  
  if (!title) title = '讓你的產品亮點被看見';
  if (!body) body = '結合產品優勢與行銷策略，打造可直接使用的高轉換文案。';
  if (!cta) cta = '立即了解更多';
  
  if (!url || url === defaultUrl) {
    url = defaultUrl;
  }
  
  return { title, body, cta, url };
}

function generateMockCopy(productName, benefits, productUrl, tone) {
  const toneData = {
    warm: {
      opening: '讓你的團隊',
      cta: '立即了解更多',
      style: '溫和專業'
    },
    aggressive: {
      opening: '現在就改變',
      cta: '馬上行動',
      style: '直接強烈'
    }
  };

  const selected = toneData[tone] || toneData.warm;

  return {
    title: `${selected.opening}把產品亮點快速轉化成高轉換文案`,
    body: `${productName}結合${benefits.slice(0, 2).join('、')}，${selected.style === '溫和專業' ? '幫助你用更溫和的方式建立信任感' : '讓你能夠直接打动受眾，促成立即行動'}. 不需反覆修改，拿到就能用.`,
    cta: selected.cta,
    url: productUrl
  };
}

function isValidUrl(str) {
  try {
    new URL(str);
    return true;
  } catch (_) {
    return false;
  }
}

async function startServer() {
  await checkBeckV1();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 live server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
  });
}

startServer();
