require("dotenv").config();

const cors = require("cors");
const crypto = require("crypto");
const { execFile } = require("child_process");
const express = require("express");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { promisify } = require("util");
const cheerio = require("cheerio");

const app = express();
const execFileAsync = promisify(execFile);
const publicDir = path.join(__dirname, "public");

const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 3456);
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/responses";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 60000);
const PAGE_FETCH_TIMEOUT_MS = Number(process.env.PAGE_FETCH_TIMEOUT_MS || 15000);
const IMAGE_FETCH_TIMEOUT_MS = Number(process.env.IMAGE_FETCH_TIMEOUT_MS || 15000);
const OCR_IMAGE_LIMIT = Number(process.env.OCR_IMAGE_LIMIT || 3);
const OCR_MAX_IMAGE_BYTES = Number(process.env.OCR_MAX_IMAGE_BYTES || 4 * 1024 * 1024);
const OCR_LANG = process.env.OCR_LANG || "chi_tra+eng";
const PAGE_TEXT_CHAR_LIMIT = Number(process.env.PAGE_TEXT_CHAR_LIMIT || 6000);
const MAX_PRODUCT_IMAGES = Number(process.env.MAX_PRODUCT_IMAGES || 10);
const OCR_ALL_IMAGES = process.env.OCR_ALL_IMAGES === "true";
const VISION_IMAGE_LIMIT = Number(process.env.VISION_IMAGE_LIMIT || 2);
const SCREENSHOT_VISION_LIMIT = Number(process.env.SCREENSHOT_VISION_LIMIT || 1);
const SCREENSHOT_OCR_LIMIT = Number(process.env.SCREENSHOT_OCR_LIMIT || 1);
const SCREENSHOTONE_ACCESS_KEY = process.env.SCREENSHOTONE_ACCESS_KEY || "";
const SCREENSHOTONE_API_BASE_URL = process.env.SCREENSHOTONE_API_BASE_URL || "https://api.screenshotone.com/take";
const SCREENSHOTONE_ENABLED = process.env.SCREENSHOTONE_ENABLED !== "false" && Boolean(SCREENSHOTONE_ACCESS_KEY);
const SCREENSHOTONE_VIEWPORT_WIDTH = Number(process.env.SCREENSHOTONE_VIEWPORT_WIDTH || 1440);
const SCREENSHOTONE_VIEWPORT_HEIGHT = Number(process.env.SCREENSHOTONE_VIEWPORT_HEIGHT || 1800);
const SCREENSHOTONE_FULL_PAGE_MAX_HEIGHT = Number(process.env.SCREENSHOTONE_FULL_PAGE_MAX_HEIGHT || 20000);
const SCREENSHOTONE_SLICE_HEIGHT = Number(process.env.SCREENSHOTONE_SLICE_HEIGHT || 4000);
const SCREENSHOTONE_USE_SLICES = process.env.SCREENSHOTONE_USE_SLICES === "true";
const VISION_ENABLED = process.env.VISION_ENABLED !== "false";

let bridgeQueue = Promise.resolve();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/detailed", (_req, res) => {
  res.sendFile(path.join(publicDir, "detailed.html"));
});

app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "beck-copy-engine",
    mode: OPENAI_API_KEY ? "live" : "mock",
    provider: OPENAI_API_KEY ? "openai" : "none",
    model: OPENAI_API_KEY ? OPENAI_MODEL : "",
    framework: "beck-copy-framework-v1"
  });
});

app.post("/generate-copy", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const input = normalizeInput(req.body);
  const errors = validateGenerateInput(input);

  if (errors.length > 0) {
    return res.status(400).json({ ok: false, error: "validation_failed", errors });
  }

  try {
    const result = await enqueue(async () => {
      const pageAnalysis = await analyzeProductPage(input.productUrl);
      const prompt = buildPrompt(input, pageAnalysis);
      const masterDraft = OPENAI_API_KEY
        ? await generateMasterDraftFromModel(input, pageAnalysis)
        : buildFallbackMasterDraft(input, pageAnalysis);
      const output = OPENAI_API_KEY
        ? await generatePrimaryCopyFromModel(masterDraft, input)
        : formatDraftForChannel(masterDraft, "primary", input.productUrl);

      return {
        ok: true,
        mode: OPENAI_API_KEY ? "live" : "mock",
        provider: OPENAI_API_KEY ? "openai" : "fallback",
        model: OPENAI_API_KEY ? OPENAI_MODEL : "",
        prompt,
        masterDraft,
        output,
        pageAnalysis
      };
    });

    return res.json(result);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: "gateway_bridge_failed",
      message: formatError(error)
    });
  }
});

app.post("/format-copy", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const input = normalizeFormatInput(req.body);
  const errors = validateFormatInput(input);

  if (errors.length > 0) {
    return res.status(400).json({ ok: false, error: "validation_failed", errors });
  }

  try {
    const output = await enqueue(async () => {
      return OPENAI_API_KEY
        ? await generateChannelCopyFromModel(input.masterDraft, input)
        : formatDraftForChannel(input.masterDraft, input.channel, input.productUrl);
    });

    return res.json({
      ok: true,
      mode: OPENAI_API_KEY ? "live" : "mock",
      provider: OPENAI_API_KEY ? "openai" : "fallback",
      model: OPENAI_API_KEY ? OPENAI_MODEL : "",
      output
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: "formatter_failed",
      message: formatError(error)
    });
  }
});

function isAuthorized(req) {
  if (!BRIDGE_API_KEY) {
    return true;
  }

  const authHeader = req.get("authorization") || "";
  return authHeader === `Bearer ${BRIDGE_API_KEY}`;
}

function enqueue(task) {
  const nextRun = bridgeQueue.then(task, task);
  bridgeQueue = nextRun.catch(() => {});
  return nextRun;
}

function normalizeInput(payload) {
  return {
    productName: String(payload?.productName ?? payload?.product_name ?? "").trim(),
    benefits: Array.isArray(payload?.benefits)
      ? payload.benefits.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
    productUrl: normalizeProductUrl(payload?.productUrl ?? payload?.product_url),
    tone: String(payload?.tone ?? "").trim(),
    voiceBalance: normalizeVoiceBalance(payload?.voiceBalance ?? payload?.voice_balance)
  };
}

function normalizeFormatInput(payload) {
  return {
    productName: String(payload?.productName ?? payload?.product_name ?? "").trim(),
    productUrl: normalizeProductUrl(payload?.productUrl ?? payload?.product_url),
    channel: String(payload?.channel ?? "").trim(),
    tone: String(payload?.tone ?? "").trim(),
    voiceBalance: normalizeVoiceBalance(payload?.voiceBalance ?? payload?.voice_balance),
    masterDraft: payload?.masterDraft && typeof payload.masterDraft === "object" ? payload.masterDraft : null
  };
}

function normalizeProductUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }

  return `https://${raw}`;
}

function normalizeVoiceBalance(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 3;
  }

  return Math.min(5, Math.max(1, Math.round(parsed)));
}

function validateGenerateInput(data) {
  const errors = [];

  if (!data.productName) {
    errors.push("product_name 是必填欄位");
  }

  if (data.benefits.length < 3 || data.benefits.length > 5) {
    errors.push("benefits 需要 3~5 項");
  }

  if (!isValidUrl(data.productUrl)) {
    errors.push("product_url 必須是合法網址");
  }

  if (!["brand", "conversion"].includes(data.tone)) {
    errors.push("tone 必須是 brand 或 conversion");
  }

  return errors;
}

function validateFormatInput(data) {
  const errors = [];

  if (!data.productName) {
    errors.push("product_name 是必填欄位");
  }

  if (!isValidUrl(data.productUrl)) {
    errors.push("product_url 必須是合法網址");
  }

  if (!["meta_ad", "google_ads", "sms", "email", "line"].includes(data.channel)) {
    errors.push("channel 必須是 meta_ad、google_ads、sms、email 或 line");
  }

  if (!["brand", "conversion"].includes(data.tone)) {
    errors.push("tone 必須是 brand 或 conversion");
  }

  if (!data.masterDraft) {
    errors.push("masterDraft 是必填欄位");
  }

  return errors;
}

function buildPrompt(data, pageAnalysis) {
  const systemPrompt = buildSystemPrompt();
  const toneLabel = getToneLabel(data.tone);
  const benefitsList = data.benefits.map((item, index) => `${index + 1}. ${item}`).join("\n");
  const pageSummary = formatPageAnalysis(pageAnalysis);

  return `${systemPrompt}

任務：
請先吸收「銷售頁分析結果」與「使用者補充資訊」，再產出 1 則可直接使用的客戶版廣告文案。

銷售頁分析結果：
${pageSummary}

使用者補充資訊：

產品名稱：${data.productName}
產品優點：
${benefitsList}

產品頁連結：${data.productUrl}
文案風格：${toneLabel}
感性 / 理性強度：${getVoiceBalanceLabel(data.voiceBalance)}

流程要求：
1. 先產出結構化母稿
2. 再產出一篇完整、可直接閱讀的主要文案`;
}

function buildSystemPrompt() {
  return `你是一個「Beck Copy Engine」，核心不是私人記憶，而是可產品化的 Beck 文案方法論。

你的工作是把產品頁可驗證資訊、使用者提供的優點，以及轉換導向的寫作框架，整理成 1 則可直接上稿的廣告文案。

請遵守以下規則：
1. 先以銷售頁實際資訊為主，再融合使用者補充的優點；若兩者衝突，優先採信頁面上可驗證資訊。
2. 文案要符合行銷用途，優先清楚、有鉤子、有節奏、有 CTA，不要只堆形容詞。
3. 若風格是品牌型，語氣偏質感、可信、能建立品牌印象。
4. 若風格是轉單型，語氣偏直接、清楚、優先解決猶豫與下單阻力。
4.1 感性 / 理性強度會決定表達方式：偏感性時要更重視共鳴、畫面、留白與日常情境；偏理性時要更重視價值主張、重點排序、清楚判斷與資訊密度。
5. 若銷售頁圖片 OCR 有抓到關鍵字，優先整合那些頁面上已出現的優點。
6. 不要捏造頁面上沒有、且使用者也沒提供的具體數字、療效、保證、折扣或權威背書。
7. 廣告文案內不要提及任何價格、售價、原價、優惠價、折扣、金額或付款資訊。
8. 不要輸出多個版本，不要解釋思考過程，不要加前言或備註。
9. 標題要先抓主要優點或痛點，主文要把價值講清楚，CTA 要明確可執行。`;
}

async function generateMasterDraftFromModel(data, pageAnalysis) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_BASE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: buildMasterDraftSystemPrompt(),
        input: buildMasterDraftUserInput(data, pageAnalysis),
        max_output_tokens: 900
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error?.message || `模型請求失敗 (${response.status})`);
    }

    const text = extractModelOutputText(result);
    if (!text) {
      throw new Error("模型沒有回傳可解析的文字內容");
    }

    return parseMasterDraftOutput(text, data);
  } finally {
    clearTimeout(timer);
  }
}

function buildMasterDraftSystemPrompt() {
  return `你是一個「Beck Copy Engine」，請先產出結構化母稿，再交由 formatter 轉成不同渠道格式。

你只能輸出合法 JSON，不要輸出 markdown，不要輸出程式碼 fence，不要輸出解釋文字。

JSON schema:
{
  "hook": "一句最先抓注意力的核心句",
  "audience_angle": "受眾切角",
  "value_prop": "主要價值主張",
  "benefit_points": ["優點1", "優點2", "優點3"],
  "proof_points": ["可驗證線索1", "可驗證線索2"],
  "cta": "行動句",
  "tone_note": "語氣說明",
  "url": "產品連結"
}

規則：
1. 優先採信頁面上可驗證資訊，再融合使用者提供的優點。
2. benefit_points 以 3 項為主，proof_points 最多 3 項。
3. 不要捏造數字、療效、保證、折扣或權威背書。
4. 不要輸出價格、售價、原價、優惠價、折扣或任何金額資訊。
5. hook、value_prop、cta 都要可直接拿去改寫成廣告。
6. 若感性強度較高，hook 與 value_prop 要更有情境感；若理性強度較高，要更清楚講價值與重點。`;
}

function buildMasterDraftUserInput(data, pageAnalysis) {
  const toneLabel = getToneLabel(data.tone);
  const benefitsList = data.benefits.map((item, index) => `${index + 1}. ${item}`).join("\n");

  return `請根據以下資料生成結構化母稿。

銷售頁分析結果：
${formatPageAnalysis(pageAnalysis)}

使用者補充資訊：
產品名稱：${data.productName}
產品優點：
${benefitsList}
產品頁連結：${data.productUrl}
文案風格：${toneLabel}
感性 / 理性強度：${getVoiceBalanceLabel(data.voiceBalance)}
`;
}

async function generatePrimaryCopyFromModel(masterDraft, input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_BASE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: buildPrimaryCopySystemPrompt(),
        input: buildPrimaryCopyUserInput(masterDraft, input),
        max_output_tokens: 900
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error?.message || `主要文案生成失敗 (${response.status})`);
    }

    const text = extractModelOutputText(result);
    if (!text) {
      throw new Error("主要文案沒有回傳可解析文字");
    }

    return parseChannelCopyOutput(text, "primary", input.productUrl);
  } finally {
    clearTimeout(timer);
  }
}

function buildPrimaryCopySystemPrompt() {
  return `你是一個主要文案 writer。

你會收到一份結構化母稿，請把它改寫成一篇可直接閱讀、可直接上稿的繁體中文主要文案。

你只能輸出合法 JSON，不要輸出 markdown，不要輸出程式碼 fence，不要輸出解釋文字。

JSON schema:
{
  "title": "主標題",
  "body": "完整主文，可保留段落換行",
  "cta": "行動句",
  "url": "產品連結"
}

規則：
1. body 優先 2 到 4 段，保留閱讀節奏與排版。
2. 不要像規格彙整，要像真的文案。
3. 可以選最強的 2 到 3 個重點發揮，不要硬塞全部。
4. CTA 要自然。
5. 不要提及任何價格、售價、原價、優惠價、折扣或金額。`;
}

function buildPrimaryCopyUserInput(masterDraft, input) {
  return `請把以下結構化母稿改寫成主要文案。

產品名稱：${input.productName}
文案風格：${getToneLabel(input.tone)}
感性 / 理性強度：${getVoiceBalanceLabel(input.voiceBalance)}
連結：${input.productUrl}

母稿：
${JSON.stringify(masterDraft, null, 2)}
`;
}

async function generateChannelCopyFromModel(masterDraft, input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_BASE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: buildChannelFormatterSystemPrompt(input.channel),
        input: buildChannelFormatterUserInput(masterDraft, input),
        max_output_tokens: 900
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error?.message || `渠道格式化失敗 (${response.status})`);
    }

    const text = extractModelOutputText(result);
    if (!text) {
      throw new Error("渠道格式化沒有回傳可解析文字");
    }

    return parseChannelCopyOutput(text, input.channel, input.productUrl);
  } finally {
    clearTimeout(timer);
  }
}

function buildChannelFormatterSystemPrompt(channel) {
  if (channel === "sms") {
    return `你是一個 SMS 文案 formatter。

你會收到一份結構化母稿，請把它改寫成一則可直接發送的繁體中文簡訊。

你只能輸出合法 JSON，不要輸出 markdown，不要輸出程式碼 fence，不要輸出解釋文字。

JSON schema:
{
  "title": "開頭句，短",
  "body": "有節奏的簡訊正文，可保留換行",
  "cta": "短 CTA",
  "url": "產品連結"
}

規則：
1. 總體要精簡、自然、像真的會發出去的簡訊，不要像規格摘要。
2. body 盡量控制在 2 到 3 句，避免過度冗長。
3. 保留口語與節奏，不要硬塞所有資訊。
4. title + body + cta 三個欄位的總字元數必須小於等於 70，不包含 url。
5. 不要捏造數字、折扣、時效。
6. 不要提及任何價格、售價、原價、優惠價或金額。`;
  }

  if (channel === "line") {
    return `你是一個 LINE 文案 formatter。

你會收到一份結構化母稿，請把它改寫成一則可直接發送的繁體中文 LINE 訊息文案。

你只能輸出合法 JSON，不要輸出 markdown，不要輸出程式碼 fence，不要輸出解釋文字。

JSON schema:
{
  "title": "開頭句，短",
  "body": "LINE 訊息正文，可保留換行",
  "cta": "短 CTA",
  "url": "產品連結"
}

規則：
1. 要像真的 LINE 訊息，輕、短、自然，不要像廣告規格表。
2. title + body + cta 三個欄位的總字元數必須小於等於 80，不包含 url。
3. 結尾一定要收在 CTA，再接產品連結。
4. 可保留 2 到 3 小段節奏，但總體要短。
5. 不要捏造數字、折扣、時效。
6. 不要提及任何價格、售價、原價、優惠價或金額。`;
  }

  if (channel === "email") {
    return `你是一個 Email 文案 formatter。

你會收到一份結構化母稿，請把它改寫成一封可直接使用的繁體中文行銷 email 文案。

你只能輸出合法 JSON，不要輸出 markdown，不要輸出程式碼 fence，不要輸出解釋文字。

JSON schema:
{
  "title": "Email 主旨",
  "body": "Email 內文，可保留段落換行",
  "description": "Preview text",
  "cta": "行動句",
  "url": "產品連結"
}

規則：
1. 要像真的 email，不要像廣告欄位拼接。
2. title 是主旨，要明確、有打開動機，但不要浮誇。
3. description 是 preview text，要補充主旨，不可留白。
4. body 控制在約 150 字左右，可正負 30 字，保留 2 到 3 段閱讀節奏。
5. 先講一個最值得打開的重點，再自然帶到產品價值。
6. body 的最後一段要自然收進行動句，最後一行直接放產品連結。
7. CTA 要自然，不要像按鈕名稱。
8. 不要捏造數字、療效、保證、折扣或時效。
9. 不要提及任何價格、售價、原價、優惠價或金額。`;
  }

  if (channel === "google_ads") {
    return `你是一個 Google Ads formatter。

你會收到一份結構化母稿，請把它改寫成一則可直接上稿的繁體中文 Google 搜尋廣告文案。

你只能輸出合法 JSON，不要輸出 markdown，不要輸出程式碼 fence，不要輸出解釋文字。

JSON schema:
{
  "title": "Headline",
  "body": "Description",
  "description": "Display path 1",
  "cta": "Display path 2",
  "url": "Final URL"
}

規則：
1. title 必須小於等於 30 字元。
2. body 必須小於等於 90 字元。
3. description 是 Display path 1，必須小於等於 15 字元。
4. cta 是 Display path 2，必須小於等於 15 字元。
5. Display path 只能是短詞或短片語，不要句子，不要網址，不要多餘符號。
6. Final URL 必須直接使用產品連結，不可改寫。
7. 整體要像 Google 搜尋廣告，不要像 Meta 主文，也不要輸出多段排版。
8. 不要捏造數字、療效、保證、折扣。
9. 不要提及任何價格、售價、原價、優惠價或金額。`;
  }

  return `你是一個 Meta 廣告 formatter。

你會收到一份結構化母稿，請把它改寫成一則可直接上稿的繁體中文 Meta 廣告文案。

你只能輸出合法 JSON，不要輸出 markdown，不要輸出程式碼 fence，不要輸出解釋文字。

JSON schema:
{
  "title": "Headline",
  "body": "Primary text，可保留段落換行",
  "description": "Description",
  "cta": "CTA",
  "url": "產品連結"
}

規則：
1. title 要有鉤子，body 要有節奏與可讀性，不要像資料拼接。
2. body 優先 2 到 4 小段，每段 1 句，保留排版。
3. 可以只挑最強的 2 到 3 個重點，不要硬塞全部。
4. description 要補上，做為較短的輔助說明，不可留白。
5. Headline 不可超過 12 個字，包含標點符號。
6. Description 不可超過 15 個字，包含標點符號。
7. Primary text 最下方最後一行一定要放產品連結，不可省略。
8. Primary text 正文本體請維持精簡，避免連同產品連結後過長。
9. CTA 要自然，不要像按鈕名稱。
10. 不要捏造數字、療效、保證、折扣。
11. 不要提及任何價格、售價、原價、優惠價或金額。`;
}

function buildChannelFormatterUserInput(masterDraft, input) {
  const labels = getOutputLabelsForChannel(input.channel);
  const outputFieldLines = [
    `- ${labels.title}`,
    `- ${labels.body}`,
    labels.description ? `- ${labels.description}` : "",
    `- ${labels.cta}`,
    `- ${labels.url}`
  ]
    .filter(Boolean)
    .join("\n");

  return `請把以下結構化母稿改寫成 ${getChannelLabel(input.channel)} 文案。

輸出欄位：
${outputFieldLines}

產品名稱：${input.productName}
渠道：${getChannelLabel(input.channel)}
語氣：${getToneLabel(input.tone)}
感性 / 理性強度：${getVoiceBalanceLabel(input.voiceBalance)}
連結：${input.productUrl}

母稿：
${JSON.stringify(masterDraft, null, 2)}
`;
}

function extractModelOutputText(result) {
  if (typeof result?.output_text === "string" && result.output_text.trim()) {
    return result.output_text.trim();
  }

  const output = Array.isArray(result?.output) ? result.output : [];
  const texts = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        texts.push(part.text.trim());
      }
    }
  }

  return texts.join("\n").trim();
}

function buildFallbackMasterDraft(data, pageAnalysis) {
  const primary = data.benefits[0] || "核心優點";
  const secondary = data.benefits[1] || "主要優勢";
  const tertiary = data.benefits[2] || "使用價值";
  const pageHook = pageAnalysis?.summary ? truncateText(pageAnalysis.summary, 80) : "頁面可驗證資訊";
  const isEmotional = normalizeVoiceBalance(data.voiceBalance) <= 2;

  return {
    hook:
      data.tone === "brand"
        ? isEmotional
          ? `${data.productName}，把 ${primary} 說得更貼近生活`
          : `${data.productName}，把 ${primary} 說得更清楚`
        : isEmotional
          ? `其實很多時候，只是想找到一個更貼近自己的 ${data.productName}`
          : `別再讓 ${data.productName} 的 ${primary} 被忽略`,
    audienceAngle:
      data.tone === "brand"
        ? "想快速理解價值、降低猶豫的受眾"
        : "需要快速被推動下單的受眾",
    value_prop:
      data.tone === "brand"
        ? isEmotional
          ? `${data.productName} 先從產品頁整理出 ${pageHook}，再把重點優點轉成更有畫面、更貼近日常感受的溝通內容。`
          : `${data.productName} 先從產品頁整理出 ${pageHook}，再把重點優點濃縮成更容易理解的溝通內容。`
        : isEmotional
          ? `${data.productName} 把頁面上真正可用的優點放進更有感受的情境裡，讓人比較不抗拒地理解它的價值。`
          : `${data.productName} 直接把頁面上真正可用的優點推到最前面，讓受眾更快理解差異、減少猶豫。`,
    benefitPoints: [primary, secondary, tertiary].filter(Boolean),
    proofPoints: pageAnalysis?.visualEvidence?.claims?.slice(0, 2) || [],
    cta: data.tone === "brand" ? "立即了解更多" : "立即查看商品頁",
    toneNote:
      `${getToneFallbackNote(data.tone)}；${getVoiceBalanceLabel(data.voiceBalance)}`,
    url: data.productUrl
  };
}

async function analyzeProductPage(productUrl) {
  try {
    const html = await fetchText(productUrl, PAGE_FETCH_TIMEOUT_MS);
    return await analyzeProductPageFromHtml(html, productUrl);
  } catch (error) {
    if (shouldUseScreenshotFallback(error)) {
      try {
        return await analyzeProductPageFromScreenshot(productUrl, error);
      } catch (fallbackError) {
        return buildEmptyPageAnalysis(
          productUrl,
          `頁面分析失敗：${formatError(error)}；Screenshot fallback 失敗：${formatError(fallbackError)}`
        );
      }
    }

    return buildEmptyPageAnalysis(productUrl, `頁面分析失敗：${formatError(error)}`);
  }
}

async function analyzeProductPageFromHtml(html, productUrl) {
  const $ = cheerio.load(html);
  const initialState = parseInitialState(html);

  $("script, style, noscript").remove();

  const headings = collectUnique([
    ...$("h1, h2, h3")
      .map((_, el) => cleanText($(el).text()))
      .get()
  ]).slice(0, 12);

  const paragraphs = collectUnique([
    ...$("p")
      .map((_, el) => cleanText($(el).text()))
      .get()
      .filter((text) => text.length >= 30)
  ]).slice(0, 12);

  const bulletPoints = collectUnique([
    ...$("li")
      .map((_, el) => cleanText($(el).text()))
      .get()
      .filter((text) => text.length >= 8)
  ]).slice(0, 15);

  const priceSignals = collectPriceSignals(cleanText($("body").text())).slice(0, 10);
  const title = cleanText($("title").first().text()) || cleanText($('meta[property="og:title"]').attr("content"));
  const metaDescription =
    cleanText($('meta[name="description"]').attr("content")) ||
    cleanText($('meta[property="og:description"]').attr("content"));
  const productMeta = cleanText(initialState?.product?.meta);
  const productVariants = collectUnique(
    (initialState?.product?.types || [])
      .flatMap((type) => (Array.isArray(type?.attributes) ? type.attributes.map((item) => item?.name) : []))
      .filter(Boolean)
  );
  const structuredPriceSignals = collectUnique(
    (initialState?.product?.products || []).flatMap((product) => {
      const results = [];
      if (product?.originPrice) {
        results.push(`原價 NT$${product.originPrice}`);
      }
      if (product?.price) {
        results.push(`售價 NT$${product.price}`);
      }
      return results;
    })
  );

  const hasStrongTextSignals = hasSufficientTextSignals({
    title,
    metaDescription,
    productMeta,
    headings,
    paragraphs,
    bulletPoints
  });
  const imageCandidates = extractImageCandidates($, productUrl, initialState).slice(0, MAX_PRODUCT_IMAGES);
  const ocrTargets = hasStrongTextSignals
    ? []
    : OCR_ALL_IMAGES
      ? imageCandidates
      : imageCandidates.slice(0, OCR_IMAGE_LIMIT);
  const visionTargets = hasStrongTextSignals
    ? imageCandidates.slice(0, Math.min(1, imageCandidates.length))
    : imageCandidates.slice(0, Math.min(VISION_IMAGE_LIMIT, imageCandidates.length));
  const imageOcr = await collectImageOcrEntries(ocrTargets, "product_image");
  const imageInsights = await analyzeImagesWithVision(visionTargets, { productUrl, title, metaDescription });

  return buildPageAnalysis({
    sourceUrl: productUrl,
    title,
    metaDescription,
    productMeta,
    headings,
    paragraphs,
    bulletPoints,
    productVariants,
    imageCandidates,
    imageOcr,
    imageInsights,
    priceSignals: collectUnique([...priceSignals, ...structuredPriceSignals]).slice(0, 12),
    captureMode: "html"
  });
}

async function analyzeProductPageFromScreenshot(productUrl, rootError) {
  const screenshotData = await fetchPageScreenshotsWithScreenshotOne(productUrl);
  const screenshotImages = screenshotData.images.length
    ? screenshotData.images.slice(0, SCREENSHOT_OCR_LIMIT)
    : screenshotData.slices.slice(0, SCREENSHOT_OCR_LIMIT);
  const imageOcr = await collectImageOcrEntries(screenshotImages, "page_screenshot");
  const imageInsights = await analyzeImagesWithVision(
    screenshotImages.slice(0, Math.min(SCREENSHOT_VISION_LIMIT, screenshotImages.length)),
    { productUrl, title: "", metaDescription: "" },
    buildPageScreenshotAnalysisPrompt
  );

  return buildPageAnalysis({
    sourceUrl: productUrl,
    title: "",
    metaDescription: "",
    productMeta: "",
    headings: [],
    paragraphs: [],
    bulletPoints: [],
    productVariants: [],
    imageCandidates: [],
    imageOcr,
    imageInsights,
    priceSignals: [],
    captureMode: "screenshot_fallback",
    screenshotCount: screenshotImages.length,
    screenshotUrl: screenshotData.url,
    fallbackReason: formatError(rootError)
  });
}

function buildPageAnalysis({
  sourceUrl,
  title,
  metaDescription,
  productMeta,
  headings,
  paragraphs,
  bulletPoints,
  productVariants,
  imageCandidates,
  imageOcr,
  imageInsights,
  priceSignals,
  captureMode,
  screenshotCount = 0,
  screenshotUrl = "",
  fallbackReason = ""
}) {
  const visualEvidence = buildVisualEvidence(imageInsights, imageOcr);
  const visualSignals = flattenVisualEvidence(visualEvidence).slice(0, 12);
  const pageAnalysis = {
    sourceUrl,
    title,
    metaDescription,
    productMeta,
    headings,
    paragraphs,
    bulletPoints,
    productVariants,
    imageAlts: imageCandidates.map((item) => item.alt).filter(Boolean),
    imageOcr,
    imageInsights,
    visualEvidence,
    visualSignals,
    priceSignals,
    captureMode,
    screenshotCount,
    screenshotUrl,
    fallbackReason
  };

  return {
    ...pageAnalysis,
    summary: summarizePageSignals(pageAnalysis)
  };
}

function buildEmptyPageAnalysis(productUrl, summary) {
  return {
    sourceUrl: productUrl,
    title: "",
    metaDescription: "",
    productMeta: "",
    headings: [],
    paragraphs: [],
    bulletPoints: [],
    productVariants: [],
    imageAlts: [],
    imageOcr: [],
    imageInsights: [],
    visualEvidence: emptyVisualEvidence(),
    visualSignals: [],
    priceSignals: [],
    captureMode: "failed",
    screenshotCount: 0,
    screenshotUrl: "",
    fallbackReason: "",
    summary
  };
}

function shouldUseScreenshotFallback(error) {
  if (!SCREENSHOTONE_ENABLED) {
    return false;
  }

  const message = formatError(error);
  return /\((401|403|429)\)/.test(message) || /timed out|aborted/i.test(message);
}

async function collectImageOcrEntries(images, sourceType) {
  const results = [];

  for (const image of images) {
    const ocrText = await ocrImageFromUrl(image.url);
    if (!ocrText) {
      continue;
    }

    results.push({
      url: image.url,
      alt: image.alt || "",
      sourceType,
      text: ocrText,
      filteredText: extractUsefulOcrText(ocrText)
    });
  }

  return results;
}

async function fetchPageScreenshotsWithScreenshotOne(productUrl) {
  if (!SCREENSHOTONE_ENABLED) {
    throw new Error("ScreenshotOne 未啟用");
  }

  const response = await fetch(SCREENSHOTONE_API_BASE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-access-key": SCREENSHOTONE_ACCESS_KEY
    },
    body: JSON.stringify({
      access_key: SCREENSHOTONE_ACCESS_KEY,
      url: productUrl,
      format: "png",
      response_type: "json",
      full_page: true,
      full_page_scroll: true,
      full_page_slices: SCREENSHOTONE_USE_SLICES,
      full_page_slice_height: SCREENSHOTONE_SLICE_HEIGHT,
      full_page_max_height: SCREENSHOTONE_FULL_PAGE_MAX_HEIGHT,
      viewport_width: SCREENSHOTONE_VIEWPORT_WIDTH,
      viewport_height: SCREENSHOTONE_VIEWPORT_HEIGHT,
      block_cookie_banners: true,
      block_chats: true,
      block_ads: true
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      result?.error?.message ||
        result?.error_message ||
        result?.message ||
        `ScreenshotOne 失敗 (${response.status})`
    );
  }

  const slices = Array.isArray(result?.slices)
    ? result.slices
        .map((slice, index) => ({
          url: String(slice?.url || "").trim(),
          alt: `page screenshot slice ${index + 1}`,
          sourceType: "page_screenshot",
          score: 20 - index
        }))
        .filter((item) => item.url)
    : [];

  const images = [];
  if (typeof result?.url === "string" && result.url.trim()) {
    images.push({
      url: result.url.trim(),
      alt: "page screenshot",
      sourceType: "page_screenshot",
      score: 20
    });
  }

  return {
    url: images[0]?.url || "",
    slices,
    images
  };
}

function buildPageScreenshotAnalysisPrompt(pageContext, image) {
  return `你在分析一張電商銷售頁的整頁截圖，目標是抓出畫面上直接可見、可驗證的產品資訊，不能猜測。

已知頁面資訊：
- 頁面網址：${pageContext.productUrl}
- 截圖區塊：${image.alt || "無"}

請只根據截圖內容回傳 JSON，格式如下：
{
  "visible_text": ["畫面上清楚可辨識的標題、賣點或品名"],
  "product_claims": ["頁面上可直接驗證的產品優點或訴求"],
  "packaging_cues": ["劑型、口味、數量、組合、使用情境等畫面線索"],
  "confidence": 0.0
}

規則：
1. 只寫截圖上看得到的資訊，不要補腦。
2. 若文字不清楚就不要硬猜。
3. 優先保留產品名、主標、條列重點與 CTA 附近文案。
4. 每個陣列最多 6 項，內容要短。
5. 只回 JSON。`;
}

function formatPageAnalysis(pageAnalysis) {
  if (!pageAnalysis) {
    return "無頁面分析資料。";
  }

  const lines = [
    `- 分析頁面：${pageAnalysis.sourceUrl}`,
    `- 分析模式：${pageAnalysis.captureMode || "html"}`,
    `- 頁面摘要：${pageAnalysis.summary || "無"}`,
    `- 頁面標題：${pageAnalysis.title || "無"}`,
    `- Meta 描述：${pageAnalysis.metaDescription || "無"}`,
    `- 商品補充描述：${pageAnalysis.productMeta || "無"}`,
    `- 主要標題：${joinForPrompt(pageAnalysis.headings, 8)}`,
    `- 重點段落：${joinForPrompt(pageAnalysis.paragraphs, 6)}`,
    `- 重點條列：${joinForPrompt(pageAnalysis.bulletPoints, 8)}`,
    `- 商品規格/組合：${joinForPrompt(pageAnalysis.productVariants, 8)}`,
    `- 圖片辨識到的品名/關鍵字：${joinForPrompt(pageAnalysis.visualEvidence?.productTerms || [], 8)}`,
    `- 圖片辨識到的可驗證優點：${joinForPrompt(pageAnalysis.visualEvidence?.claims || [], 8)}`,
    `- 圖片辨識到的規格/使用線索：${joinForPrompt(pageAnalysis.visualEvidence?.specs || [], 8)}`,
    `- 圖片 ALT：${joinForPrompt(pageAnalysis.imageAlts, 6)}`,
    `- 圖片 OCR：${joinForPrompt(
      pageAnalysis.imageOcr.map((item) => item.filteredText || item.text).filter(Boolean),
      6
    )}`
  ];

  if (pageAnalysis.screenshotUrl) {
    lines.push(`- 頁面截圖：${pageAnalysis.screenshotUrl}`);
  }

  if (pageAnalysis.fallbackReason) {
    lines.push(`- fallback 原因：${pageAnalysis.fallbackReason}`);
  }

  return lines.join("\n");
}

function hasSufficientTextSignals({ title, metaDescription, productMeta, headings, paragraphs, bulletPoints }) {
  const weightedSignals = [
    String(title || "").trim(),
    String(metaDescription || "").trim(),
    String(productMeta || "").trim(),
    ...(Array.isArray(headings) ? headings.slice(0, 4) : []),
    ...(Array.isArray(paragraphs) ? paragraphs.slice(0, 3) : []),
    ...(Array.isArray(bulletPoints) ? bulletPoints.slice(0, 4) : [])
  ].filter(Boolean);

  const totalChars = weightedSignals.reduce((sum, item) => sum + item.length, 0);
  return totalChars >= 240 || (headings?.length || 0) >= 3 || (paragraphs?.length || 0) >= 2;
}

function summarizePageSignals(data) {
  const summaryParts = [];

  if (data.captureMode === "screenshot_fallback") {
    summaryParts.push("HTML 抓取受阻，已改用頁面截圖分析");
  }

  if (data.title) {
    summaryParts.push(`頁面主題偏向「${truncateText(data.title, 80)}」`);
  }

  if (data.headings.length) {
    summaryParts.push(`heading 聚焦在 ${data.headings.slice(0, 3).join(" / ")}`);
  }

  if (data.productMeta) {
    summaryParts.push(`商品描述提到 ${truncateText(data.productMeta, 120)}`);
  }

  if (data.bulletPoints.length) {
    summaryParts.push(`條列優點包含 ${data.bulletPoints.slice(0, 3).join(" / ")}`);
  }

  if (data.productVariants.length) {
    summaryParts.push(`組合選項包含 ${data.productVariants.slice(0, 3).join(" / ")}`);
  }

  if (data.priceSignals.length) {
    summaryParts.push(`頁面出現價格或組合訊號 ${data.priceSignals.slice(0, 3).join(" / ")}`);
  }

  if (data.visualEvidence?.productTerms?.length) {
    summaryParts.push(
      `圖片辨識到品名/關鍵字 ${data.visualEvidence.productTerms
        .slice(0, 3)
        .map((item) => truncateText(item, 60))
        .join(" / ")}`
    );
  }

  if (data.visualEvidence?.claims?.length) {
    summaryParts.push(
      `圖片優點顯示 ${data.visualEvidence.claims
        .slice(0, 3)
        .map((item) => truncateText(item, 60))
        .join(" / ")}`
    );
  }

  if (data.visualEvidence?.specs?.length) {
    summaryParts.push(
      `圖片規格/使用線索包含 ${data.visualEvidence.specs
        .slice(0, 3)
        .map((item) => truncateText(item, 60))
        .join(" / ")}`
    );
  }

  if (data.screenshotCount) {
    summaryParts.push(`頁面截圖切成 ${data.screenshotCount} 張區塊做 OCR/vision`);
  }

  return summaryParts.join("；") || "可抓到的頁面訊號有限。";
}

function extractImageCandidates($, pageUrl, initialState) {
  const seen = new Set();
  const candidates = [];

  const pushCandidate = (src, alt, score) => {
    const absoluteUrl = resolveUrl(src, pageUrl);
    if (!absoluteUrl || seen.has(absoluteUrl)) {
      return;
    }

    seen.add(absoluteUrl);
    candidates.push({
      url: absoluteUrl,
      alt: cleanText(alt),
      score
    });
  };

  $("img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
    if (!src) {
      return;
    }

    const alt = cleanText($(el).attr("alt"));
    const width = Number($(el).attr("width")) || 0;
    const height = Number($(el).attr("height")) || 0;
    const className = cleanText($(el).attr("class"));
    const score =
      (alt ? 4 : 0) +
      (width >= 300 ? 2 : 0) +
      (height >= 300 ? 2 : 0) +
      (/product|hero|main|gallery|slide/i.test(className) ? 3 : 0) +
      (/images\//i.test(src) ? 2 : 0);

    pushCandidate(src, alt, score);
  });

  pushCandidate($('meta[property="og:image"]').attr("content"), "og image", 12);

  const stateImages = [
    initialState?.product?.mediaUrl,
    ...(initialState?.product?.products || []).flatMap((product) => [
      product?.image,
      ...(product?.images || []).map((item) => item?.absolute_url || item?.image_url)
    ]),
    ...(initialState?.product?.paragraphs || []).map((item) => item?.paragraph_image_url)
  ];

  for (const src of stateImages) {
    pushCandidate(src, "product image", 15);
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function parseInitialState(html) {
  const match = html.match(/window\.__INITIAL_STATE__='([\s\S]*?)'<\/script>/);
  if (!match) {
    return null;
  }

  try {
    const raw = match[1]
      .replace(/\\u003C/g, "<")
      .replace(/\\u003E/g, ">")
      .replace(/\\u002F/g, "/")
      .replace(/\\'/g, "'");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function ocrImageFromUrl(imageUrl) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lihi-ocr-"));
  const imagePath = path.join(tempDir, createTempFileName(imageUrl));

  try {
    const response = await fetchWithTimeout(imageUrl, IMAGE_FETCH_TIMEOUT_MS);
    if (!response.ok) {
      return "";
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return "";
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > OCR_MAX_IMAGE_BYTES) {
      return "";
    }

    await fs.writeFile(imagePath, buffer);

    const ocrText = await runTesseract(imagePath);
    return cleanText(ocrText).slice(0, 500);
  } catch {
    return "";
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function analyzeImagesWithVision(images, pageContext, promptBuilder = buildImageAnalysisPrompt) {
  if (!OPENAI_API_KEY || !VISION_ENABLED || !images.length) {
    return [];
  }

  const results = [];

  for (const image of images) {
    const insight = await analyzeSingleImageWithVision(image, pageContext, promptBuilder);
    if (insight) {
      results.push(insight);
    }
  }

  return results;
}

async function analyzeSingleImageWithVision(image, pageContext, promptBuilder) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_BASE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: promptBuilder(pageContext, image)
              },
              {
                type: "input_image",
                image_url: image.url
              }
            ]
          }
        ],
        max_output_tokens: 500
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error?.message || `圖片分析失敗 (${response.status})`);
    }

    const text = extractModelOutputText(result);
    if (!text) {
      return null;
    }

    const parsed = JSON.parse(text);
    return {
      url: image.url,
      alt: image.alt,
      sourceType: image.sourceType || "product_image",
      visibleText: collectUnique(Array.isArray(parsed.visible_text) ? parsed.visible_text : []).slice(0, 6),
      productClaims: collectUnique(Array.isArray(parsed.product_claims) ? parsed.product_claims : []).slice(0, 6),
      packagingCues: collectUnique(Array.isArray(parsed.packaging_cues) ? parsed.packaging_cues : []).slice(0, 4),
      confidence: Number(parsed.confidence) || 0
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildImageAnalysisPrompt(pageContext, image) {
  return `你在分析一張電商銷售頁商品圖，目標是抓出「畫面上可直接看見」的產品細節，不能猜測。

已知頁面資訊：
- 頁面網址：${pageContext.productUrl}
- 頁面標題：${pageContext.title || "無"}
- Meta 描述：${pageContext.metaDescription || "無"}
- 圖片 alt：${image.alt || "無"}

請只根據圖片內容回傳 JSON，格式如下：
{
  "visible_text": ["圖片上清楚可辨識的文案或品名"],
  "product_claims": ["從包裝或圖上直接可驗證的產品優點"],
  "packaging_cues": ["口味、劑型、數量、使用情境、組合等可直接看見的線索"],
  "confidence": 0.0
}

規則：
1. 只寫圖片上看得到的資訊，不要補腦。
2. 若文字不清楚就不要硬猜。
3. 若有中英文品名或關鍵詞，優先保留。
4. 每個陣列最多 6 項，內容要短。
5. 只回 JSON。`;
}

async function runTesseract(imagePath) {
  try {
    const { stdout } = await execFileAsync("tesseract", [imagePath, "stdout", "-l", OCR_LANG], {
      maxBuffer: 1024 * 1024
    });
    return stdout;
  } catch (error) {
    if (OCR_LANG !== "eng") {
      const { stdout } = await execFileAsync("tesseract", [imagePath, "stdout", "-l", "eng"], {
        maxBuffer: 1024 * 1024
      });
      return stdout;
    }
    throw error;
  }
}

async function fetchText(url, timeoutMs) {
  const response = await fetchWithTimeout(url, timeoutMs);
  if (!response.ok) {
    throw createHttpError(`頁面抓取失敗 (${response.status})`, response.status);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!/html|text/i.test(contentType)) {
    throw new Error(`頁面不是 HTML：${contentType || "unknown"}`);
  }

  const html = await response.text();
  return html.slice(0, PAGE_TEXT_CHAR_LIMIT * 4);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "cache-control": "no-cache",
        pragma: "no-cache"
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = Number(status) || 0;
  return error;
}

function parseMasterDraftOutput(rawOutput, input) {
  const normalized = String(rawOutput || "").trim();
  const match = normalized.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("母稿格式不是合法 JSON");
  }

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch (error) {
    throw new Error(`母稿 JSON 解析失敗：${formatError(error)}`);
  }

  const benefits = Array.isArray(parsed?.benefit_points)
    ? parsed.benefit_points.map((item) => cleanText(item)).filter(Boolean)
    : [];
  const proofPoints = Array.isArray(parsed?.proof_points)
    ? parsed.proof_points.map((item) => cleanText(item)).filter(Boolean)
    : [];

  return {
    hook: cleanText(parsed?.hook) || `${input.productName}，把重點說清楚`,
    audienceAngle: cleanText(parsed?.audience_angle) || "",
    valueProp: cleanText(parsed?.value_prop) || input.benefits.slice(0, 2).join("、"),
    benefitPoints: collectUnique([...benefits, ...input.benefits]).slice(0, 4),
    proofPoints: collectUnique(proofPoints).slice(0, 3),
    cta: cleanText(parsed?.cta) || "立即了解更多",
    toneNote: cleanText(parsed?.tone_note) || getToneFallbackNote(input.tone),
    url: isValidUrl(parsed?.url) ? parsed.url : input.productUrl
  };
}

function formatDraftForChannel(masterDraft, channel, defaultUrl) {
  if (channel === "primary") {
    return formatPrimaryOutput(masterDraft, defaultUrl);
  }

  if (channel === "sms") {
    return formatSmsOutput(masterDraft, defaultUrl);
  }

  if (channel === "line") {
    return formatLineOutput(masterDraft, defaultUrl);
  }

  if (channel === "email") {
    return formatEmailOutput(masterDraft, defaultUrl);
  }

  if (channel === "google_ads") {
    return formatGoogleAdsOutput(masterDraft, defaultUrl);
  }

  return formatMetaAdOutput(masterDraft, defaultUrl);
}

function formatPrimaryOutput(masterDraft, defaultUrl) {
  return {
    title: truncateText(masterDraft.hook || masterDraft.valueProp, 52),
    body: [
      ensureSentence(masterDraft.valueProp || masterDraft.hook),
      masterDraft.benefitPoints?.length ? `重點優點：${masterDraft.benefitPoints.slice(0, 3).join("、")}。` : "",
      masterDraft.proofPoints?.[0] ? ensureSentence(masterDraft.proofPoints[0]) : ""
    ]
      .filter(Boolean)
      .join("\n\n"),
    cta: truncateText(masterDraft.cta || "立即了解更多", 28),
    url: isValidUrl(masterDraft.url) ? masterDraft.url : defaultUrl,
    labels: getOutputLabelsForChannel("primary")
  };
}

function formatMetaAdOutput(masterDraft, defaultUrl) {
  const title = truncateText(masterDraft.hook || masterDraft.valueProp, 12);
  const lead = truncateText(ensureSentence(masterDraft.valueProp || masterDraft.hook), 90);
  const benefits = masterDraft.benefitPoints.slice(0, 2).join("、");
  const proof = masterDraft.proofPoints[0] ? ensureSentence(masterDraft.proofPoints[0]) : "";
  const cta = truncateText(masterDraft.cta || "立即了解更多", 28);
  const descriptionSource = masterDraft.benefitPoints[0] || masterDraft.audienceAngle || masterDraft.cta;
  const description = truncateText(cleanText(descriptionSource), 15);
  const body = [
    lead,
    benefits ? `重點優點：${benefits}` : "",
    proof
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    title,
    body: appendUrlToMetaBody(body, isValidUrl(masterDraft.url) ? masterDraft.url : defaultUrl),
    description,
    cta,
    url: isValidUrl(masterDraft.url) ? masterDraft.url : defaultUrl,
    labels: getOutputLabelsForChannel("meta_ad")
  };
}

function formatSmsOutput(masterDraft, defaultUrl) {
  const title = truncateText(masterDraft.hook, 18);
  const shortBenefit = masterDraft.benefitPoints.slice(0, 2).join("、");
  const cta = truncateText(masterDraft.cta || "立即查看", 10);
  const body = fitSmsFieldsToLimit({
    title,
    body: [shortBenefit ? `${shortBenefit}。` : "", masterDraft.valueProp || ""].filter(Boolean).join(" "),
    cta
  }).body;

  return {
    title,
    body,
    cta,
    url: isValidUrl(masterDraft.url) ? masterDraft.url : defaultUrl,
    labels: getOutputLabelsForChannel("sms")
  };
}

function formatLineOutput(masterDraft, defaultUrl) {
  const title = truncateText(masterDraft.hook, 18);
  const shortBenefit = masterDraft.benefitPoints.slice(0, 2).join("、");
  const cta = truncateText(masterDraft.cta || "點這裡看看", 12);
  const fitted = fitCompactFieldsToLimit({
    title,
    body: [shortBenefit ? `${shortBenefit}。` : "", masterDraft.valueProp || ""].filter(Boolean).join(" "),
    cta
  }, 80);

  return {
    title: fitted.title,
    body: fitted.body,
    cta: fitted.cta,
    url: isValidUrl(masterDraft.url) ? masterDraft.url : defaultUrl,
    labels: getOutputLabelsForChannel("line")
  };
}

function formatEmailOutput(masterDraft, defaultUrl) {
  const title = truncateText(masterDraft.hook || masterDraft.valueProp, 28);
  const cta = truncateText(masterDraft.cta || "點開看看", 16);
  const url = isValidUrl(masterDraft.url) ? masterDraft.url : defaultUrl;
  const previewSource = masterDraft.audienceAngle || masterDraft.benefitPoints[0] || masterDraft.cta;
  const description = truncateText(cleanText(previewSource), 36);
  const body = appendCtaAndUrlToEmailBody(
    normalizeEmailBodyLength(
      [
        ensureSentence(masterDraft.valueProp || masterDraft.hook),
        masterDraft.benefitPoints?.[0] ? ensureSentence(`這次想先把 ${masterDraft.benefitPoints[0]} 這個重點說清楚`) : "",
        masterDraft.proofPoints?.[0] ? ensureSentence(masterDraft.proofPoints[0]) : ""
      ]
        .filter(Boolean)
        .join("\n\n")
    ),
    cta,
    url
  );

  return {
    title,
    body,
    description,
    cta,
    url,
    labels: getOutputLabelsForChannel("email")
  };
}

function formatGoogleAdsOutput(masterDraft, defaultUrl) {
  const url = isValidUrl(masterDraft.url) ? masterDraft.url : defaultUrl;
  const title = truncateTextHard(masterDraft.hook || masterDraft.valueProp, 30);
  const body = truncateTextHard(
    cleanText([
      masterDraft.valueProp || masterDraft.hook,
      masterDraft.benefitPoints?.[0] ? `聚焦 ${masterDraft.benefitPoints[0]}` : "",
      masterDraft.proofPoints?.[0] || ""
    ]
      .filter(Boolean)
      .join("。")),
    90
  );
  const description = normalizeGoogleAdsPathSegment(masterDraft.benefitPoints?.[0] || masterDraft.audienceAngle || masterDraft.productName || "highlights");
  const cta = normalizeGoogleAdsPathSegment(masterDraft.benefitPoints?.[1] || masterDraft.cta || masterDraft.productName || "details");

  return {
    title,
    body,
    description,
    cta,
    url,
    labels: getOutputLabelsForChannel("google_ads")
  };
}

function getChannelLabel(channel) {
  if (channel === "sms") {
    return "SMS";
  }

  if (channel === "email") {
    return "Email";
  }

  if (channel === "line") {
    return "LINE";
  }

  if (channel === "meta_ad") {
    return "Meta 廣告";
  }

  if (channel === "google_ads") {
    return "Google Ads";
  }

  return "主要文案";
}

function getOutputLabelsForChannel(channel) {
  if (channel === "sms") {
    return {
      title: "開頭",
      body: "訊息內容",
      description: "",
      cta: "行動句",
      url: "連結"
    };
  }

  if (channel === "line") {
    return {
      title: "開頭",
      body: "LINE 內文",
      description: "",
      cta: "行動句",
      url: "連結"
    };
  }

  if (channel === "email") {
    return {
      title: "Email 主旨",
      body: "Email 內文",
      description: "Preview text",
      cta: "",
      url: ""
    };
  }

  if (channel === "meta_ad") {
    return {
      title: "Headline",
      body: "Primary text",
      description: "Description",
      cta: "CTA",
      url: "連結"
    };
  }

  if (channel === "google_ads") {
    return {
      title: "Headline",
      body: "Description",
      description: "Display path 1",
      cta: "Display path 2",
      url: "Final URL"
    };
  }

  return {
    title: "標題",
    body: "主文",
    description: "",
    cta: "CTA",
    url: "連結"
  };
}

function parseChannelCopyOutput(rawOutput, channel, defaultUrl) {
  const normalized = String(rawOutput || "").trim();
  const match = normalized.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("渠道文案格式不是合法 JSON");
  }

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch (error) {
    throw new Error(`渠道文案 JSON 解析失敗：${formatError(error)}`);
  }

  const labels = getOutputLabelsForChannel(channel);
  const title = cleanText(parsed?.title);
  const body = String(parsed?.body || "").replace(/\r/g, "").trim();
  const description = cleanText(parsed?.description);
  const cta = cleanText(parsed?.cta);
  const url = isValidUrl(parsed?.url) ? parsed.url : defaultUrl;

  if (!title || !body || (channel !== "email" && !cta) || ((channel === "meta_ad" || channel === "google_ads" || channel === "email") && !description)) {
    throw new Error("渠道文案回覆格式不完整");
  }

  const priceFields = [title, body, description, cta].filter(Boolean);
  if (priceFields.some((value) => containsPriceMention(value))) {
    throw new Error("渠道文案不可提及價格資訊");
  }

  const normalizedMeta = channel === "meta_ad"
    ? {
        title: truncateText(title, 12),
        body: appendUrlToMetaBody(body, url),
        description: truncateText(description, 15),
        cta
      }
    : { title, body, description: "", cta };

  const normalizedSms = channel === "sms"
    ? fitSmsFieldsToLimit({ title, body, cta })
    : null;

  const normalizedLine = channel === "line"
    ? fitLineFieldsToLimit({ title, body, cta })
    : null;

  const normalizedEmail = channel === "email"
    ? {
        title: truncateText(title, 28),
        body: appendCtaAndUrlToEmailBody(normalizeEmailBodyLength(body), truncateText(cta || "點開看看", 16), url),
        description: truncateText(description, 36),
        cta: truncateText(cta || "點開看看", 16)
      }
    : null;

  const normalizedGoogleAds = channel === "google_ads"
    ? {
        title: truncateTextHard(title, 30),
        body: truncateTextHard(body.replace(/\n+/g, " ").trim(), 90),
        description: normalizeGoogleAdsPathSegment(description),
        cta: normalizeGoogleAdsPathSegment(cta)
      }
    : null;

  return {
    title: normalizedGoogleAds?.title || normalizedEmail?.title || normalizedLine?.title || normalizedSms?.title || normalizedMeta.title,
    body: normalizedGoogleAds?.body || normalizedEmail?.body || normalizedLine?.body || normalizedSms?.body || normalizedMeta.body,
    description: channel === "meta_ad" ? normalizedMeta.description : channel === "google_ads" ? normalizedGoogleAds.description : channel === "email" ? normalizedEmail.description : "",
    cta: normalizedGoogleAds?.cta || normalizedEmail?.cta || normalizedLine?.cta || normalizedSms?.cta || normalizedMeta.cta,
    url,
    labels
  };
}

function normalizeGoogleAdsPathSegment(value) {
  const normalized = cleanText(value)
    .replace(/^https?:\/\//i, "")
    .replace(/[/?#&=]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return truncateTextHard(normalized || "highlights", 15);
}

function fitSmsFieldsToLimit(fields, maxChars = 70) {
  return fitCompactFieldsToLimit(fields, maxChars);
}

function fitLineFieldsToLimit(fields, maxChars = 80) {
  return fitCompactFieldsToLimit(fields, maxChars);
}

function fitCompactFieldsToLimit(fields, maxChars) {
  const normalized = {
    title: cleanText(fields?.title),
    body: String(fields?.body || "").replace(/\r/g, "").replace(/\n+/g, " ").trim(),
    cta: cleanText(fields?.cta)
  };

  const getLength = () => normalized.title.length + normalized.body.length + normalized.cta.length;

  if (getLength() <= maxChars) {
    return normalized;
  }

  const reserved = normalized.title.length + normalized.cta.length;
  const maxBody = Math.max(0, maxChars - reserved);
  normalized.body = truncateText(normalized.body, maxBody);

  if (getLength() <= maxChars) {
    return normalized;
  }

  normalized.title = truncateText(normalized.title, Math.max(0, maxChars - normalized.body.length - normalized.cta.length));

  if (getLength() <= maxChars) {
    return normalized;
  }

  normalized.cta = truncateText(normalized.cta, Math.max(0, maxChars - normalized.title.length - normalized.body.length));
  return normalized;
}

function normalizeEmailBodyLength(text, maxChars = 170) {
  const normalized = String(text || "").replace(/\r/g, "").trim();
  return truncateText(normalized, maxChars);
}

function appendUrlToMetaBody(body, url) {
  const normalizedBody = String(body || "").trim().replace(/\n{3,}/g, "\n\n");
  const normalizedUrl = String(url || "").trim();

  if (!normalizedUrl) {
    return normalizedBody;
  }

  const bodyWithoutUrl = normalizedBody
    .replace(new RegExp(escapeRegExp(normalizedUrl), "g"), "")
    .replace(/[：:]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return [bodyWithoutUrl, normalizedUrl].filter(Boolean).join("\n\n");
}

function appendCtaAndUrlToEmailBody(body, cta, url) {
  const normalizedBody = String(body || "").trim().replace(/\r/g, "").replace(/\n{3,}/g, "\n\n");
  const normalizedCta = cleanText(cta);
  const normalizedUrl = isValidUrl(url) ? String(url).trim() : "";
  const bodyWithoutUrl = normalizedUrl
    ? normalizedBody.replace(new RegExp(escapeRegExp(normalizedUrl), "g"), "").trim()
    : normalizedBody;
  const bodyWithoutCta = normalizedCta
    ? bodyWithoutUrl.replace(new RegExp(escapeRegExp(normalizedCta), "g"), "").replace(/\n{3,}/g, "\n\n").trim()
    : bodyWithoutUrl;

  return [bodyWithoutCta, normalizedCta, normalizedUrl].filter(Boolean).join("\n\n");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPriceMention(text) {
  const value = cleanText(text);
  if (!value) {
    return false;
  }

  return [
    /(?:NT\$|NTD|\$)\s*\d+/i,
    /\d[\d,]*(?:\.\d+)?\s*(?:元|塊|折)/,
    /(售價|原價|價格|價錢|優惠價|特價|折扣|現省|立省|付款資訊)/
  ].some((pattern) => pattern.test(value));
}

function ensureSentence(text) {
  const value = cleanText(text);
  if (!value) {
    return "";
  }

  return /[。！？.!?]$/.test(value) ? value : `${value}。`;
}

function getToneLabel(tone) {
  if (tone === "conversion") {
    return "轉單型";
  }

  return "品牌型";
}

function getVoiceBalanceLabel(voiceBalance) {
  switch (normalizeVoiceBalance(voiceBalance)) {
    case 1:
      return "很感性：重情境、共鳴、畫面與留白";
    case 2:
      return "偏感性：情境感較強，產品輕帶";
    case 4:
      return "偏理性：價值與重點更清楚";
    case 5:
      return "很理性：優先清楚、具體、好判斷";
    case 3:
    default:
      return "平衡：兼顧情境畫面與清楚價值";
  }
}

function getToneFallbackNote(tone) {
  if (tone === "conversion") {
    return "轉單型，直接、清楚";
  }

  return "品牌型，溫和、可信任";
}

function joinForPrompt(items, limit) {
  const normalized = collectUnique(items).slice(0, limit).map((item) => truncateText(item, 180));
  return normalized.length ? normalized.join(" | ") : "無";
}

function collectUnique(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const cleaned = cleanText(item);
    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function collectPriceSignals(text) {
  const matches = text.match(/(?:NT\$|HK\$|US\$|\$)\s?\d[\d,]*(?:\.\d+)?|\d+\s*(?:元|塊|折|包|入|盒|杯|份|天|組)/g) || [];
  return collectUnique(matches);
}

function extractUsefulOcrText(value) {
  const normalized = String(value || "")
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .filter((line) => isUsefulOcrLine(line));

  return collectUnique(normalized).slice(0, 6).join(" / ");
}

function isUsefulOcrLine(line) {
  if (!line || line.length < 4) {
    return false;
  }

  if (/[~£><]{2,}/.test(line) || /[^\w\u4e00-\u9fff\s]{3,}/.test(line)) {
    return false;
  }

  const symbolCount = (line.match(/[^0-9A-Za-z\u4e00-\u9fff\s/%().,:+-]/g) || []).length;
  const letterCount = (line.match(/[A-Za-z\u4e00-\u9fff]/g) || []).length;
  const digitCount = (line.match(/[0-9]/g) || []).length;
  const charCount = line.replace(/\s+/g, "").length;

  if (!charCount) {
    return false;
  }

  if (symbolCount / charCount > 0.1) {
    return false;
  }

  if (letterCount < 3 && digitCount < 2) {
    return false;
  }

  if (/[A-Za-z]{1,2}\b/.test(line) && !/[\u4e00-\u9fff]/.test(line) && line.length < 10) {
    return false;
  }

  if (!/[\u4e00-\u9fff]{2,}|[A-Za-z]{4,}|(?:\d+\s?(?:g|ml|oz|入|盒|包|人))/i.test(line)) {
    return false;
  }

  return true;
}

function buildVisualEvidence(imageInsights, imageOcr) {
  const evidence = emptyVisualEvidence();

  for (const item of imageInsights) {
    evidence.productTerms.push(...(item.visibleText || []));
    evidence.claims.push(...(item.productClaims || []));
    evidence.specs.push(...(item.packagingCues || []));
  }

  if (!evidence.productTerms.length && !evidence.claims.length && !evidence.specs.length) {
    evidence.ocrFallback.push(
      ...imageOcr
        .map((item) => item.filteredText)
        .filter(Boolean)
    );
  }

  return {
    productTerms: dedupeSignals(evidence.productTerms).slice(0, 6),
    claims: dedupeSignals(evidence.claims).slice(0, 6),
    specs: dedupeSignals(evidence.specs).slice(0, 6),
    ocrFallback: dedupeSignals(evidence.ocrFallback).slice(0, 4)
  };
}

function emptyVisualEvidence() {
  return {
    productTerms: [],
    claims: [],
    specs: [],
    ocrFallback: []
  };
}

function flattenVisualEvidence(visualEvidence) {
  return dedupeSignals([
    ...(visualEvidence?.productTerms || []),
    ...(visualEvidence?.claims || []),
    ...(visualEvidence?.specs || []),
    ...(visualEvidence?.ocrFallback || [])
  ]);
}

function dedupeSignals(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const cleaned = cleanText(item);
    if (!cleaned) {
      continue;
    }

    const key = normalizeSignalKey(cleaned);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function normalizeSignalKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/100%\s*natural\s*全天然食材/g, "100-natural")
    .replace(/全天然食材/g, "100-natural")
    .replace(/100%\s*natural/g, "100-natural")
    .replace(/net wt\.?\s*/g, "")
    .replace(/義式南瓜濃湯|南瓜濃湯|pumpkin soup/g, "pumpkin-soup")
    .replace(/belfort gourmet/g, "belfort")
    .replace(/gourmet/g, "gourmet")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .trim();
}

function truncateText(value, maxLength) {
  const text = cleanText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function truncateTextHard(value, maxLength) {
  const text = cleanText(value);
  return Array.from(text).slice(0, maxLength).join("");
}

function resolveUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function createTempFileName(sourceUrl) {
  const ext = path.extname(new URL(sourceUrl).pathname) || ".img";
  return `${crypto.randomUUID()}${ext.slice(0, 10)}`;
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

app.listen(BRIDGE_PORT, "0.0.0.0", () => {
  console.log(`beck-copy-engine listening on ${BRIDGE_PORT}`);
});
