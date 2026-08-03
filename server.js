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

app.post('/api/generate-creative', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  return res.json({
    ok: true,
    mode: 'mock',
    provider: 'local-creative-studio',
    asset: buildCreativeAsset(req.body || {})
  });
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

function buildCreativeAsset(body) {
  const platform = normalizeCreativePlatform(body?.platform);
  const platformMeta = getCreativePlatformMeta(platform);
  const style = normalizeCreativeStyle(body?.config?.style);
  const model = normalizeCreativeModel(body?.config?.model);
  const productName = String(body?.productName || '未命名產品').trim();
  const primaryCopy = String(body?.primaryCopy || '').trim();
  const title = String(body?.source?.title || productName).trim();
  const bodyText = String(body?.source?.body || primaryCopy || '').trim();
  const cta = String(body?.source?.cta || '了解更多').trim();

  return {
    platform,
    platformLabel: platformMeta.label,
    sizeLabel: `${platformMeta.width} × ${platformMeta.height}`,
    style,
    model,
    prompt: [
      `請根據以下主文案，產出一張 ${platformMeta.width}x${platformMeta.height} 的 ${platformMeta.label} 廣告素材。`,
      `產品名稱：${productName}`,
      `主標重點：${title}`,
      `文案內容：${primaryCopy || bodyText || title}`,
      `視覺風格：${getCreativeStyleLabel(style)}`,
      `模特兒設定：${getCreativeModelLabel(model)}`,
      '請保留清楚標題層級、品牌感與廣告可讀性，不要自行發明新的賣點。'
    ].join('\n'),
    imageUrl: buildCreativeSvgDataUrl({ platformMeta, style, model, productName, title, bodyText, cta }),
    alt: `${productName} ${platformMeta.label} 素材預覽`
  };
}

function normalizeCreativePlatform(value) {
  return ['facebook', 'instagram', 'threads', 'google_ads'].includes(value) ? value : 'facebook';
}

function normalizeCreativeStyle(value) {
  return ['clean', 'editorial', 'bold', 'warm', 'luxury'].includes(value) ? value : 'clean';
}

function normalizeCreativeModel(value) {
  return ['none', 'adult', 'family', 'hand'].includes(value) ? value : 'none';
}

function getCreativePlatformMeta(platform) {
  switch (platform) {
    case 'instagram':
      return { label: 'IG', width: 1080, height: 1350 };
    case 'threads':
      return { label: 'Threads', width: 1080, height: 1920 };
    case 'google_ads':
      return { label: 'Google Ads', width: 1200, height: 628 };
    case 'facebook':
    default:
      return { label: 'Facebook 主圖', width: 1200, height: 600 };
  }
}

function getCreativeStyleLabel(style) {
  const map = {
    clean: '清爽產品感，畫面乾淨、聚焦單一主賣點、保留品牌留白',
    editorial: '質感編輯感，像品牌專題封面，構圖有節奏與高級感',
    bold: '高轉換吸睛版，主標明確、視覺對比強、適合廣告投放',
    warm: '溫暖生活感，強調生活情境與柔和氛圍',
    luxury: '高級品牌版，克制、精緻、深色與粉色點綴'
  };

  return map[style] || map.clean;
}

function getCreativeModelLabel(model) {
  const map = {
    none: '不要模特兒，以產品與版面為主',
    adult: '可加入單一生活感模特兒，但不要搶走主產品',
    family: '可加入家庭互動感模特兒，傳遞分享氛圍',
    hand: '只加入手部互動，讓畫面更有使用情境'
  };

  return map[model] || map.none;
}

function buildCreativeSvgDataUrl({ platformMeta, style, model, productName, title, bodyText, cta }) {
  const palette = getCreativePalette(style);
  const headline = escapeHtml(truncateText(title || productName, platformMeta.width > 1100 ? 34 : 24));
  const body = escapeHtml(truncateText(compactCreativeText(bodyText || ''), platformMeta.height > 1000 ? 120 : 78));
  const product = escapeHtml(truncateText(productName, 24));
  const ctaText = escapeHtml(truncateText(cta || '了解更多', 14));
  const modelBadge = model === 'none' ? '' : `<text x="${platformMeta.width - 64}" y="92" text-anchor="end" font-size="28" fill="${palette.badgeText}" font-family="Avenir Next, Noto Sans TC, sans-serif">MODEL ON</text>`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${platformMeta.width}" height="${platformMeta.height}" viewBox="0 0 ${platformMeta.width} ${platformMeta.height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.bgStart}" />
          <stop offset="100%" stop-color="${palette.bgEnd}" />
        </linearGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.panelStart}" />
          <stop offset="100%" stop-color="${palette.panelEnd}" />
        </linearGradient>
      </defs>
      <rect width="${platformMeta.width}" height="${platformMeta.height}" fill="url(#bg)" rx="28" />
      <circle cx="${platformMeta.width * 0.16}" cy="${platformMeta.height * 0.18}" r="${platformMeta.width * 0.13}" fill="${palette.glowA}" />
      <circle cx="${platformMeta.width * 0.84}" cy="${platformMeta.height * 0.2}" r="${platformMeta.width * 0.18}" fill="${palette.glowB}" />
      <rect x="48" y="48" width="${platformMeta.width - 96}" height="${platformMeta.height - 96}" rx="34" fill="url(#panel)" stroke="${palette.border}" />
      <rect x="${platformMeta.width * 0.62}" y="${platformMeta.height * 0.18}" width="${platformMeta.width * 0.24}" height="${platformMeta.height * 0.52}" rx="28" fill="${palette.card}" stroke="${palette.border}" />
      <circle cx="${platformMeta.width * 0.74}" cy="${platformMeta.height * 0.34}" r="${platformMeta.width * 0.07}" fill="${palette.cardAccent}" />
      <rect x="${platformMeta.width * 0.66}" y="${platformMeta.height * 0.48}" width="${platformMeta.width * 0.16}" height="${platformMeta.height * 0.05}" rx="18" fill="${palette.cardAccentSoft}" />
      <rect x="${platformMeta.width * 0.66}" y="${platformMeta.height * 0.56}" width="${platformMeta.width * 0.12}" height="${platformMeta.height * 0.05}" rx="18" fill="${palette.cardAccentSoft}" />
      ${model === 'none' ? '' : `<circle cx="${platformMeta.width * 0.78}" cy="${platformMeta.height * 0.5}" r="${platformMeta.width * 0.045}" fill="${palette.modelSkin}" /><rect x="${platformMeta.width * 0.73}" y="${platformMeta.height * 0.55}" width="${platformMeta.width * 0.1}" height="${platformMeta.height * 0.12}" rx="30" fill="${palette.modelOutfit}" />`}
      <text x="88" y="104" font-size="28" letter-spacing="5" fill="${palette.overline}" font-family="Avenir Next, Noto Sans TC, sans-serif">LIHI CREATIVE</text>
      ${modelBadge}
      <text x="88" y="${platformMeta.height > 1000 ? 250 : 208}" font-size="${platformMeta.height > 1000 ? 92 : 62}" font-weight="800" fill="${palette.headline}" font-family="Avenir Next, Noto Sans TC, sans-serif">${headline}</text>
      <foreignObject x="88" y="${platformMeta.height > 1000 ? 320 : 250}" width="${platformMeta.width * 0.52}" height="${platformMeta.height * 0.34}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Avenir Next, 'Noto Sans TC', sans-serif; color: ${palette.body}; font-size: ${platformMeta.height > 1000 ? 40 : 28}px; line-height: 1.55; white-space: pre-wrap;">${body}</div>
      </foreignObject>
      <rect x="88" y="${platformMeta.height - 142}" width="${platformMeta.width > 1100 ? 220 : 200}" height="64" rx="32" fill="${palette.ctaBg}" />
      <text x="${platformMeta.width > 1100 ? 198 : 188}" y="${platformMeta.height - 100}" text-anchor="middle" font-size="28" font-weight="700" fill="${palette.ctaText}" font-family="Avenir Next, Noto Sans TC, sans-serif">${ctaText}</text>
      <text x="88" y="${platformMeta.height - 34}" font-size="26" fill="${palette.product}" font-family="Avenir Next, Noto Sans TC, sans-serif">${product}</text>
    </svg>
  `.replace(/\n\s+/g, ' ').trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getCreativePalette(style) {
  const palettes = {
    clean: {
      bgStart: '#FFF5F8', bgEnd: '#FFE1EC', panelStart: '#FFFFFF', panelEnd: '#FFF8FB', border: 'rgba(26,26,94,0.10)',
      glowA: 'rgba(255,107,157,0.26)', glowB: 'rgba(26,26,94,0.12)', overline: '#FF4D88', headline: '#1A1A5E',
      body: '#34346B', ctaBg: '#1A1A5E', ctaText: '#FFFFFF', product: '#FF4D88', badgeText: '#1A1A5E',
      card: '#FFF2F7', cardAccent: '#FF6B9D', cardAccentSoft: '#FFD0E0', modelSkin: '#F3C7AC', modelOutfit: '#1A1A5E'
    },
    editorial: {
      bgStart: '#F7F4FF', bgEnd: '#E7E1FF', panelStart: '#FFFFFF', panelEnd: '#F4F0FF', border: 'rgba(26,26,94,0.10)',
      glowA: 'rgba(125,93,255,0.22)', glowB: 'rgba(255,107,157,0.16)', overline: '#7D5DFF', headline: '#17174D',
      body: '#37376F', ctaBg: '#7D5DFF', ctaText: '#FFFFFF', product: '#1A1A5E', badgeText: '#7D5DFF',
      card: '#EFEAFF', cardAccent: '#7D5DFF', cardAccentSoft: '#D8D0FF', modelSkin: '#EFC1A6', modelOutfit: '#7D5DFF'
    },
    bold: {
      bgStart: '#1A1A5E', bgEnd: '#2A1458', panelStart: '#2B2B78', panelEnd: '#16164A', border: 'rgba(255,255,255,0.12)',
      glowA: 'rgba(255,107,157,0.32)', glowB: 'rgba(255,214,10,0.18)', overline: '#FFB8CF', headline: '#FFFFFF',
      body: '#F8EAF0', ctaBg: '#FF6B9D', ctaText: '#FFFFFF', product: '#FFD9E6', badgeText: '#FFD9E6',
      card: '#FF6B9D', cardAccent: '#FFD54F', cardAccentSoft: '#FF95B8', modelSkin: '#F1C5AA', modelOutfit: '#FFD54F'
    },
    warm: {
      bgStart: '#FFF6EE', bgEnd: '#FFE9DC', panelStart: '#FFFFFF', panelEnd: '#FFF8F1', border: 'rgba(26,26,94,0.08)',
      glowA: 'rgba(255,153,111,0.22)', glowB: 'rgba(255,107,157,0.14)', overline: '#C86D4A', headline: '#1A1A5E',
      body: '#4D4D74', ctaBg: '#FF6B9D', ctaText: '#FFFFFF', product: '#C86D4A', badgeText: '#C86D4A',
      card: '#FFF0E4', cardAccent: '#FFA36F', cardAccentSoft: '#FFD3B9', modelSkin: '#F1C5AA', modelOutfit: '#FF6B9D'
    },
    luxury: {
      bgStart: '#101038', bgEnd: '#1A1A5E', panelStart: '#17174A', panelEnd: '#0F0F34', border: 'rgba(255,255,255,0.12)',
      glowA: 'rgba(255,107,157,0.2)', glowB: 'rgba(255,255,255,0.08)', overline: '#FF9CBD', headline: '#FFF7FB',
      body: '#EADCE3', ctaBg: '#FFF5F8', ctaText: '#1A1A5E', product: '#FF9CBD', badgeText: '#FFB8CF',
      card: '#252567', cardAccent: '#FF6B9D', cardAccentSoft: '#45458C', modelSkin: '#EAB89A', modelOutfit: '#FFF5F8'
    }
  };

  return palettes[style] || palettes.clean;
}

function compactCreativeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength) {
  const chars = Array.from(String(value || '').trim());
  if (chars.length <= maxLength) {
    return chars.join('');
  }
  return `${chars.slice(0, Math.max(0, maxLength - 1)).join('')}…`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function startServer() {
  await checkBeckV1();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 live server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
  });
}

startServer();
