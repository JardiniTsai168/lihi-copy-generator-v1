require("dotenv").config();

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
const BRIDGE_ALLOWED_ORIGINS = String(process.env.BRIDGE_ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const RANDOM_STYLE_PRESET_KEY = "random";
const STYLE_PRESETS = {
  home_healing: {
    label: "回家療癒版",
    prompt: "回家療癒版：主打回家、放鬆、安定、被照顧的情緒，畫面要有溫度。"
  },
  sharing_moment: {
    label: "分享時刻版",
    prompt: "分享時刻版：把產品放進一起吃、一起聊、一起分享的場景，強調連結感。"
  },
  childhood_memory: {
    label: "童年回憶版",
    prompt: "童年回憶版：帶出熟悉味道、從小記憶、家常安心感，但不要俗套。"
  },
  premium_brand: {
    label: "高級品牌版",
    prompt: "高級品牌版：語氣克制、質感、乾淨，不喊賣點，用品味與信任感建立價值。"
  },
  founder_story: {
    label: "創辦人故事版",
    prompt: "創辦人故事版：適度加入品牌初衷、堅持或做這件事的理由，讓產品更有人味。"
  },
  social_proof: {
    label: "社群口碑版",
    prompt: "社群口碑版：語氣自然、有討論感，像使用者願意主動分享與推薦。"
  },
  scenario_solution: {
    label: "場景解決方案版",
    prompt: "場景解決方案版：優先寫明什麼情境下會需要它、它如何幫你解決當下問題。"
  },
  rational_comparison: {
    label: "理性對比版",
    prompt: "理性對比版：清楚說明差異、優勢、選擇理由，偏理性、可判斷。"
  },
  gift_recommendation: {
    label: "送禮推薦版",
    prompt: "送禮推薦版：強調體面、心意、好送、不失禮，讓人容易聯想到送禮情境。"
  },
  urgency_conversion: {
    label: "限時轉單版",
    prompt: "限時轉單版：節奏更快、行動更明確，優先降低猶豫、推進下單。"
  }
};
const RANDOM_STYLE_PRESET_META = {
  label: "隨機",
  prompt: "隨機：送出時從既有風格版本中隨機選 1 種。"
};
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "qwen/qwen3.5-plus-02-15";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1/chat/completions";
const IMAGE_API_BASE_URL = process.env.IMAGE_API_BASE_URL || "https://openrouter.ai/api/v1/images";
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "https://coloring.bktsai.link";
const COLORING_IMAGE_MODEL = process.env.COLORING_IMAGE_MODEL || "openai/gpt-5.4-image-2";
const COLORING_IMAGE_TIMEOUT_MS = Number(process.env.COLORING_IMAGE_TIMEOUT_MS || 300000);
const COLORING_IMAGE_ASPECT_RATIO = process.env.COLORING_IMAGE_ASPECT_RATIO || "3:4";
const COLORING_IMAGE_QUALITY = process.env.COLORING_IMAGE_QUALITY || "low";
const COLORING_ALLOWED_MODEL_QUALITIES = {
  "openai/gpt-5.4-image-2": ["low"]
};
const COLORING_IMAGE_INPUT_PRICE_PER_MILLION = Number(process.env.COLORING_IMAGE_INPUT_PRICE_PER_MILLION || 8);
const COLORING_IMAGE_OUTPUT_PRICE_PER_MILLION = Number(process.env.COLORING_IMAGE_OUTPUT_PRICE_PER_MILLION || 15);
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 60000);
const CHANNEL_FORMATTER_TIMEOUT_MS = Number(process.env.CHANNEL_FORMATTER_TIMEOUT_MS || Math.min(OPENAI_TIMEOUT_MS, 25000));
const OPENAI_REASONING_MAX_TOKENS = Number(process.env.OPENAI_REASONING_MAX_TOKENS || 128);
const OPENAI_REASONING_EXCLUDE = process.env.OPENAI_REASONING_EXCLUDE !== "false";
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
const BRIDGE_MAX_CONCURRENCY = Number(process.env.BRIDGE_MAX_CONCURRENCY || 8);
const GENERATE_MAX_CONCURRENCY = Number(process.env.GENERATE_MAX_CONCURRENCY || BRIDGE_MAX_CONCURRENCY);
const FORMAT_MAX_CONCURRENCY = Number(process.env.FORMAT_MAX_CONCURRENCY || 8);
const PAGE_ANALYSIS_CACHE_TTL_MS = Number(process.env.PAGE_ANALYSIS_CACHE_TTL_MS || 10 * 60 * 1000);
const RESULT_CACHE_TTL_MS = Number(process.env.RESULT_CACHE_TTL_MS || 15 * 60 * 1000);
const COLORING_JOB_TTL_MS = Number(process.env.COLORING_JOB_TTL_MS || 30 * 60 * 1000);
const COLORING_DAILY_LIMIT = Number(process.env.COLORING_DAILY_LIMIT || 5);
const COLORING_DAILY_LIMIT_TZ = process.env.COLORING_DAILY_LIMIT_TZ || "Asia/Taipei";
const DEVICE_COOKIE_NAME = process.env.DEVICE_COOKIE_NAME || "lihi_device";
const DEVICE_COOKIE_TTL_SECONDS = Number(process.env.DEVICE_COOKIE_TTL_SECONDS || 180 * 24 * 60 * 60);
const DEVICE_COOKIE_SECRET = process.env.DEVICE_COOKIE_SECRET || "lihi-coloring-device-secret-v1";
const COLORING_SESSION_TTL_MS = Number(process.env.COLORING_SESSION_TTL_MS || 20 * 60 * 1000);
const COLORING_SESSION_SECRET = process.env.COLORING_SESSION_SECRET || "lihi-coloring-session-secret-v1";
const COLORING_IP_WINDOW_MS = Number(process.env.COLORING_IP_WINDOW_MS || 10 * 60 * 1000);
const COLORING_IP_WINDOW_LIMIT = Number(process.env.COLORING_IP_WINDOW_LIMIT || 10);
const COLORING_IP_BAN_THRESHOLD = Number(process.env.COLORING_IP_BAN_THRESHOLD || 8);
const COLORING_IP_BAN_MS = Number(process.env.COLORING_IP_BAN_MS || 60 * 60 * 1000);
const COLORING_ACTIVE_JOB_LIMIT_PER_DEVICE = Number(process.env.COLORING_ACTIVE_JOB_LIMIT_PER_DEVICE || 1);
const CACHE_MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES || 200);

const generateQueue = createTaskQueue(GENERATE_MAX_CONCURRENCY);
const formatQueue = createTaskQueue(FORMAT_MAX_CONCURRENCY);
const pageAnalysisCache = new Map();
const formatResultCache = new Map();
const inflightPageAnalysis = new Map();
const inflightGenerateRequests = new Map();
const inflightFormatRequests = new Map();
const inflightColoringRequests = new Map();
const coloringJobs = new Map();
const coloringDailyUsage = new Map();
const coloringIpUsage = new Map();
const coloringIpBlocks = new Map();
const activeColoringJobsByDevice = new Map();
const TAIWAN_COMPLIANCE_FORBIDDEN_RULES = [
  { label: "disease_name", pattern: /(糖尿病|高血壓|高血脂|脂肪肝|憂鬱症|失眠症?|骨質疏鬆|胃潰瘍|關節炎|痛風|癌症|中風|阿茲海默症)/i },
  { label: "treatment_claim", pattern: /(治療|治好|根治|預防中風|預防癌症|預防骨折|改善病情|降低血糖|降血糖|降血壓|降低膽固醇|清除血栓|溶解血栓|治療高血脂|治療高血壓|治療糖尿病|治療便秘|治療胃潰瘍|治療氣喘|治療退化性關節炎)/i },
  { label: "medical_effect", pattern: /(抗癌|防癌|殺菌|抗病毒|消炎|修復肝臟|修補胃黏膜|軟骨再生|修復軟骨|治療關節炎|預防關節炎|預防痛風)/i },
  { label: "health_food_claim", pattern: /(健康食品功效|小綠人等級|國家認證保健功效|健康食品認證|健康食品驗證)/i }
];
const TAIWAN_COMPLIANCE_HIGH_RISK_RULES = [
  { label: "immune_claim", pattern: /(提升免疫力|增強抵抗力|免疫提升|增加防禦能力|升級防禦屏障)/i },
  { label: "sleep_claim", pattern: /(幫助入睡|改善睡眠|睡更深|一夜好眠|熟睡|秒睡|睡眠障礙救星)/i },
  { label: "metabolism_claim", pattern: /(促進代謝|燃脂|爆瘦|減肥|瘦身|減重|消脂|油切|減少體脂肪)/i },
  { label: "organ_claim", pattern: /(顧肝|護肝|強肝|顧眼睛|清血管|維持血糖穩定|調整體質|改善體質|舒緩發炎|減少發炎反應|排毒|清宿便|腸道淨化|整腸|消除便秘)/i },
  { label: "anti_aging_claim", pattern: /(抗老|逆齡|回春|青春永駐|延年益壽|阻斷老化)/i },
  { label: "repair_claim", pattern: /(修復|再生|活化)/i },
  { label: "brain_claim", pattern: /(增強記憶力|提升專注力|補腦|改善腦霧)/i },
  { label: "private_claim", pattern: /(私密調理|舒緩私密搔癢|降低私密感染|壯陽|提升睪固酮濃度|恢復男性雄風)/i },
  { label: "authority_claim", pattern: /(醫師推薦|專家見證|實證有效|國際專利|國家認證|審查合格)/i },
  { label: "absolute_claim", pattern: /(立即見效|7天見效|百分之百有效|100%有效|唯一|首創|最高|神效|奇蹟|醫界震撼|見證無數|速效)/i }
];
const TAIWAN_COMPLIANCE_REPLACEMENTS = [
  { pattern: /(提升免疫力|增強抵抗力|免疫提升|增加防禦能力|升級防禦屏障)/gi, replacement: "補充日常營養" },
  { pattern: /(幫助入睡|改善睡眠|睡更深|一夜好眠|熟睡|秒睡|睡眠障礙救星)/gi, replacement: "晚間也適合閱讀的產品資訊" },
  { pattern: /(促進代謝|燃脂|爆瘦|減肥|瘦身|減重|消脂|油切|減少體脂肪)/gi, replacement: "日常補給重點" },
  { pattern: /(顧肝|護肝|強肝|顧眼睛|清血管|維持血糖穩定|調整體質|改善體質|舒緩發炎|減少發炎反應|排毒|清宿便|腸道淨化|整腸|消除便秘)/gi, replacement: "日常營養補給" },
  { pattern: /(抗老|逆齡|回春|青春永駐|延年益壽|阻斷老化)/gi, replacement: "維持日常節奏" },
  { pattern: /(修復|再生|活化)/gi, replacement: "整理" },
  { pattern: /(增強記憶力|提升專注力|補腦|改善腦霧)/gi, replacement: "清楚好理解" },
  { pattern: /(私密調理|舒緩私密搔癢|降低私密感染|壯陽|提升睪固酮濃度|恢復男性雄風)/gi, replacement: "日常保養資訊" },
  { pattern: /(醫師推薦|專家見證|實證有效|國際專利|國家認證|審查合格)/gi, replacement: "產品資訊整理" },
  { pattern: /(立即見效|7天見效|百分之百有效|100%有效|唯一|首創|最高|神效|奇蹟|醫界震撼|見證無數|速效)/gi, replacement: "穩定整理" },
  { pattern: /(治療|治好|根治|預防中風|預防癌症|預防骨折|改善病情|降低血糖|降血糖|降血壓|降低膽固醇|清除血栓|溶解血栓|治療高血脂|治療高血壓|治療糖尿病|治療便秘|治療胃潰瘍|治療氣喘|治療退化性關節炎|抗癌|防癌|殺菌|抗病毒|消炎|修復肝臟|修補胃黏膜|軟骨再生|修復軟骨|治療關節炎|預防關節炎|預防痛風)/gi, replacement: "日常資訊" },
  { pattern: /(糖尿病|高血壓|高血脂|脂肪肝|憂鬱症|失眠症?|骨質疏鬆|胃潰瘍|關節炎|痛風|癌症|中風|阿茲海默症)/gi, replacement: "" },
  { pattern: /(健康食品功效|小綠人等級|國家認證保健功效|健康食品認證|健康食品驗證)/gi, replacement: "產品資訊" }
];
const SIMPLIFIED_TO_TRADITIONAL_REPLACEMENTS = [
  ["让", "讓"],
  ["这", "這"],
  ["专业", "專業"],
  ["链接", "連結"],
  ["为", "為"],
  ["专", "專"],
  ["业", "業"],
  ["产", "產"],
  ["广", "廣"],
  ["卖", "賣"],
  ["买", "買"],
  ["转", "轉"],
  ["单", "單"],
  ["决", "決"],
  ["点", "點"],
  ["优", "優"],
  ["势", "勢"],
  ["无", "無"],
  ["汤", "湯"],
  ["饮", "飲"],
  ["疗", "療"],
  ["触", "觸"],
  ["觉", "覺"],
  ["时", "時"],
  ["间", "間"],
  ["们", "們"],
  ["开", "開"],
  ["关", "關"],
  ["后", "後"],
  ["会", "會"],
  ["实", "實"],
  ["说", "說"],
  ["种", "種"],
  ["风", "風"],
  ["体", "體"],
  ["质", "質"],
  ["门", "門"],
  ["国", "國"],
  ["复", "復"],
  ["归", "歸"],
  ["来", "來"],
  ["个", "個"],
  ["两", "兩"],
  ["并", "並"],
  ["还", "還"],
  ["真", "真"],
  ["对", "對"],
  ["应", "應"],
  ["与", "與"],
  ["团", "團"],
  ["队", "隊"],
  ["连", "連"],
  ["温", "溫"],
  ["满", "滿"],
  ["画", "畫"],
  ["轻", "輕"],
  ["细", "細"],
  ["绵", "綿"],
  ["摆", "擺"],
  ["条", "條"],
  ["将", "將"],
  ["从", "從"],
  ["发", "發"],
  ["给", "給"],
  ["达", "達"],
  ["户", "戶"],
  ["见", "見"],
  ["观", "觀"],
  ["读", "讀"],
  ["级", "級"],
  ["经", "經"],
  ["结", "結"],
  ["链", "鏈"],
  ["网", "網"],
  ["联", "聯"],
  ["营", "營"],
  ["销", "銷"],
  ["欢", "歡"],
  ["选", "選"],
  ["适", "適"],
  ["简", "簡"],
  ["讯", "訊"],
  ["帮", "幫"],
  ["养", "養"],
  ["术", "術"],
  ["数", "數"],
  ["据", "據"],
  ["页", "頁"],
  ["礼", "禮"],
  ["组", "組"],
  ["礼物", "禮物"],
  ["好礼", "好禮"],
  ["组合", "組合"],
  ["现", "現"],
  ["里", "裡"],
  ["台", "臺"]
];

app.use(express.json({ limit: "25mb" }));
app.use((req, res, next) => {
  ensureDeviceCookie(req, res);
  next();
});
app.use(express.static(publicDir));

app.use((req, res, next) => {
  if (!isProtectedEndpoint(req.path)) {
    return next();
  }

  if (req.method === "OPTIONS") {
    if (!hasAuthorizedBridgeAccess(req)) {
      return res.status(403).json({ ok: false, error: "forbidden_origin" });
    }

    const origin = getAllowedRequestOrigin(req);
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Coloring-Session");
    return res.status(204).end();
  }

  if (!hasAuthorizedBridgeAccess(req)) {
    return res.status(403).json({ ok: false, error: "forbidden_origin" });
  }

  const origin = getAllowedRequestOrigin(req);
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  return next();
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "lihi-coloring-card",
    mode: OPENAI_API_KEY ? "live" : "mock",
    provider: OPENAI_API_KEY ? "openai" : "none",
    model: OPENAI_API_KEY ? OPENAI_MODEL : "",
    imageModel: OPENAI_API_KEY ? COLORING_IMAGE_MODEL : "",
    framework: "lihi-coloring-card-v1"
  });
});

app.get("/coloring-session", (req, res) => {
  if (!hasAuthorizedBridgeAccess(req)) {
    return res.status(403).json({ ok: false, error: "forbidden_origin" });
  }

  const deviceId = getTrustedDeviceIdFromRequest(req);
  if (!deviceId) {
    return res.status(403).json({ ok: false, error: "missing_device_cookie" });
  }

  const session = createColoringSession(deviceId);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  return res.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    dailyLimit: COLORING_DAILY_LIMIT
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

  const resolvedInput = {
    ...input,
    stylePreset: resolveStylePresetKey(input.stylePreset)
  };
  const cacheKey = buildGenerateCacheKey(resolvedInput);
  try {
    const result = await getOrCreateInflight(inflightGenerateRequests, cacheKey, async () => {
      return generateQueue(async () => {
      const pageAnalysis = await analyzeProductPage(resolvedInput.productUrl);
      const prompt = buildPrompt(resolvedInput, pageAnalysis);
      const { masterDraft, output } = OPENAI_API_KEY
        ? await generatePrimaryBundleWithFallback(resolvedInput, pageAnalysis)
        : (() => {
            const draft = buildFallbackMasterDraft(resolvedInput, pageAnalysis);
            return {
              masterDraft: draft,
              output: formatDraftForChannel(draft, "primary", resolvedInput.productUrl)
            };
          })();

      return {
        ok: true,
        mode: OPENAI_API_KEY ? "live" : "mock",
        provider: OPENAI_API_KEY ? "openai" : "fallback",
        model: OPENAI_API_KEY ? OPENAI_MODEL : "",
        stylePreset: resolvedInput.stylePreset,
        prompt,
        masterDraft,
        output,
        pageAnalysis
      };
      });
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

  const cacheKey = buildFormatCacheKey(input);
  const cachedResult = getCachedValue(formatResultCache, cacheKey);
  if (cachedResult) {
    return res.json(cachedResult);
  }

  try {
    const output = await getOrCreateInflight(inflightFormatRequests, cacheKey, async () => {
      return formatQueue(async () => {
        return OPENAI_API_KEY
          ? await generateChannelCopyWithFallback(input.masterDraft, input)
          : formatDraftForChannel(input.masterDraft, input.channel, input.productUrl);
      });
    });

    const result = {
      ok: true,
      mode: OPENAI_API_KEY ? "live" : "mock",
      provider: OPENAI_API_KEY ? "openai" : "fallback",
      model: OPENAI_API_KEY ? OPENAI_MODEL : "",
      output
    };

    setCachedValue(formatResultCache, cacheKey, result, RESULT_CACHE_TTL_MS);
    return res.json(result);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: "formatter_failed",
      message: formatError(error)
    });
  }
});

app.post("/generate-coloring-card", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const gate = validateColoringRequest(req, { requireSessionToken: true, enforceActiveJobLimit: true });
  if (!gate.ok) {
    return res.status(gate.status).json(gate.body);
  }

  const input = normalizeColoringInput(req.body);
  const errors = validateColoringInput(input);

  if (errors.length > 0) {
    return res.status(400).json({ ok: false, error: "validation_failed", errors });
  }

  const quota = consumeColoringQuota(req);
  if (!quota.ok) {
    return res.status(429).json({
      ok: false,
      error: "daily_limit_reached",
      message: `今天最多只能產圖 ${COLORING_DAILY_LIMIT} 次，請明天再試`,
      remaining: 0,
      limit: COLORING_DAILY_LIMIT
    });
  }

  const cacheKey = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const activeJob = {
    id: `sync:${crypto.randomUUID()}`,
    deviceId: gate.context.deviceId
  };
  markColoringJobActive(activeJob);

  try {
    const result = await getOrCreateInflight(inflightColoringRequests, cacheKey, async () => {
      return generateColoringResult(input);
    });

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    return res.json(result);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: "coloring_generation_failed",
      message: formatError(error)
    });
  } finally {
    unmarkColoringJobActive(activeJob);
  }
});

app.post("/generate-coloring-card-job", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const gate = validateColoringRequest(req, { requireSessionToken: true, enforceActiveJobLimit: true });
  if (!gate.ok) {
    return res.status(gate.status).json(gate.body);
  }

  const input = normalizeColoringInput(req.body);
  const errors = validateColoringInput(input);

  if (errors.length > 0) {
    return res.status(400).json({ ok: false, error: "validation_failed", errors });
  }

  const quota = consumeColoringQuota(req);
  if (!quota.ok) {
    return res.status(429).json({
      ok: false,
      error: "daily_limit_reached",
      message: `今天最多只能產圖 ${COLORING_DAILY_LIMIT} 次，請明天再試`,
      remaining: 0,
      limit: COLORING_DAILY_LIMIT
    });
  }

  const { job, token } = createColoringJob(input, gate.context);
  runColoringJob(job.id).catch(() => {});

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  return res.status(202).json({
    ok: true,
    jobId: job.id,
    jobToken: token,
    status: job.status,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt
  });
});

app.get("/coloring-jobs/:jobId", async (req, res) => {
  const gate = validateColoringRequest(req, {
    requireSessionToken: true,
    enforceActiveJobLimit: false,
    consumeIpLimit: false
  });
  if (!gate.ok) {
    return res.status(gate.status).json(gate.body);
  }

  const jobId = String(req.params?.jobId || "").trim();
  const token = String(req.query?.token || "").trim();
  const job = getColoringJob(jobId);

  if (!job) {
    return res.status(404).json({ ok: false, error: "job_not_found" });
  }

  if (!verifyColoringJobAccess(job, token)) {
    return res.status(403).json({ ok: false, error: "forbidden_job_access" });
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  return res.json({
    ok: true,
    job: serializeColoringJob(job)
  });
});

function isAuthorized(req) {
  if (!BRIDGE_API_KEY) {
    return true;
  }

  const authHeader = req.get("authorization") || "";
  return authHeader === `Bearer ${BRIDGE_API_KEY}`;
}

function isProtectedEndpoint(pathname) {
  return (
    pathname === "/generate-copy" ||
    pathname === "/format-copy" ||
    pathname === "/generate-coloring-card" ||
    pathname === "/generate-coloring-card-job" ||
    pathname.startsWith("/coloring-jobs/")
  );
}

function normalizeColoringInput(body = {}) {
  const requestedModel = String(body?.model || "").trim();
  const model = normalizeColoringModel(requestedModel);
  const photoDataUrls = Array.isArray(body?.photoDataUrls)
    ? body.photoDataUrls.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const fallbackPhotoDataUrl = String(body?.photoDataUrl || "").trim();

  return {
    photoDataUrls: photoDataUrls.length > 0 ? photoDataUrls : (fallbackPhotoDataUrl ? [fallbackPhotoDataUrl] : []),
    model,
    quality: normalizeColoringQuality(model, body?.quality)
  };
}

function normalizeColoringModel(value) {
  return Object.prototype.hasOwnProperty.call(COLORING_ALLOWED_MODEL_QUALITIES, value)
    ? value
    : COLORING_IMAGE_MODEL;
}

function normalizeColoringQuality(model, value) {
  const allowedQualities = COLORING_ALLOWED_MODEL_QUALITIES[model] || [COLORING_IMAGE_QUALITY];
  const normalized = String(value || "").trim().toLowerCase();
  return allowedQualities.includes(normalized) ? normalized : allowedQualities[0];
}

function validateColoringInput(input) {
  const errors = [];

  if (!Array.isArray(input.photoDataUrls) || input.photoDataUrls.length === 0) {
    errors.push("請先上傳照片");
  } else if (input.photoDataUrls.length > 3) {
    errors.push("一次最多只能上傳 3 張照片");
  } else {
    for (const photoDataUrl of input.photoDataUrls) {
      const parsed = parseImageDataUrl(photoDataUrl);
      if (!parsed) {
        errors.push("照片格式不正確，請重新上傳 JPG、PNG 或 WebP");
        break;
      }

      const approxBytes = Math.floor((parsed.base64.length * 3) / 4);
      if (approxBytes > 5 * 1024 * 1024) {
        errors.push("照片太大，請壓到 5MB 以下再試");
        break;
      }
    }
  }

  if (!Object.prototype.hasOwnProperty.call(COLORING_ALLOWED_MODEL_QUALITIES, input.model)) {
    errors.push("model 不在這次測試範圍內");
  } else if (!COLORING_ALLOWED_MODEL_QUALITIES[input.model].includes(input.quality)) {
    errors.push("quality 與 model 組合不在這次測試範圍內");
  }

  return errors;
}

async function generateColoringResult(input) {
  return generateQueue(async () => {
    const prompt = buildColoringPrompt(input);

    if (!OPENAI_API_KEY) {
      const outputs = input.photoDataUrls.map((photoDataUrl) => createMockColoringCard({ ...input, photoDataUrl }));
      return {
        ok: true,
        mode: "mock",
        provider: "fallback",
        model: "",
        imageModel: "",
        costUsd: null,
        prompt,
        outputs,
        output: outputs[0] || null
      };
    }

    const outputs = await Promise.all(
      input.photoDataUrls.map((photoDataUrl) => generateColoringCardFromModel({ ...input, photoDataUrl }, prompt))
    );

    return {
      ok: true,
      mode: "live",
      provider: "openai",
      model: OPENAI_MODEL,
      imageModel: input.model,
      costUsd: sumColoringCosts(outputs),
      prompt,
      outputs,
      output: outputs[0] || null
    };
  });
}

function createColoringJob(input, context = {}) {
  pruneExpiredColoringJobs();

  const id = crypto.randomUUID();
  const token = crypto.randomBytes(18).toString("base64url");
  const now = Date.now();
  const job = {
    id,
    tokenHash: createColoringJobTokenHash(token),
    status: "queued",
    input,
    deviceId: String(context.deviceId || "").trim(),
    requestIp: String(context.ip || "").trim(),
    result: null,
    error: "",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + COLORING_JOB_TTL_MS
  };

  coloringJobs.set(id, job);
  markColoringJobActive(job);
  pruneCache(coloringJobs, CACHE_MAX_ENTRIES);

  return { job, token };
}

function getColoringJob(jobId) {
  pruneExpiredColoringJobs();

  if (!jobId) {
    return null;
  }

  const job = coloringJobs.get(jobId);
  if (!job) {
    return null;
  }

  if (job.expiresAt <= Date.now()) {
    unmarkColoringJobActive(job);
    coloringJobs.delete(jobId);
    return null;
  }

  return job;
}

function pruneExpiredColoringJobs() {
  const now = Date.now();
  for (const [jobId, job] of coloringJobs.entries()) {
    if (!job || job.expiresAt <= now) {
      unmarkColoringJobActive(job);
      coloringJobs.delete(jobId);
    }
  }
}

function touchColoringJob(job) {
  if (!job) {
    return;
  }

  job.updatedAt = Date.now();
  job.expiresAt = job.updatedAt + COLORING_JOB_TTL_MS;
}

function createColoringJobTokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function verifyColoringJobAccess(job, token) {
  if (!job || !token) {
    return false;
  }

  return job.tokenHash === createColoringJobTokenHash(token);
}

function serializeColoringJob(job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    expiresAt: job.expiresAt,
    error: job.error || "",
    result: job.result
  };
}

async function runColoringJob(jobId) {
  const job = getColoringJob(jobId);
  if (!job || job.status !== "queued") {
    return;
  }

  job.status = "running";
  touchColoringJob(job);

  try {
    job.result = await generateColoringResult(job.input);
    job.status = "succeeded";
    job.error = "";
  } catch (error) {
    job.result = null;
    job.status = "failed";
    job.error = formatError(error);
  } finally {
    unmarkColoringJobActive(job);
    touchColoringJob(job);
  }
}

function parseImageDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    return null;
  }

  return {
    mediaType: match[1].toLowerCase(),
    base64: match[2].replace(/\s+/g, "")
  };
}

function buildColoringPrompt(input) {
  return [
    "Turn this photo into a clean black-and-white coloring page for kids.",
    "Re-draw the photo as polished coloring-book line art, not a direct photo trace.",
    "Keep the main subject recognizable and preserve important facial features, expression, pose, and key details.",
    "Use slightly simpler subject detail than a highly detailed coloring page, keeping the subject clear but not too intricate inside.",
    "Keep some background elements so the page still feels like a scene, especially larger shapes and recognizable environment details, but simplify them into clean, colorable forms.",
    "Remove tiny textures, visual noise, and unnecessary micro-details from both subject and background.",
    "Style: clean cartoon line art, white background, thick clear outlines, simple interior details, easy for children to color.",
    "Do not use gray shading, color, messy textures, crosshatching, sketchy tracing, noisy tracing, realistic lighting gradients, or halftone noise.",
    "The result should look like a professional printable coloring page made from a real-life family photo, pet photo, toy photo, or everyday moment."
  ].join(" ");
}

function createMockColoringCard(input) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <rect width="1200" height="1600" fill="#ffffff"/>
  <rect x="72" y="72" width="1056" height="1456" rx="48" fill="#ffffff" stroke="#111111" stroke-width="10"/>
  <text x="120" y="180" font-size="44" font-family="Arial, sans-serif" fill="#111111">Coloring Card Preview</text>
  <text x="120" y="236" font-size="22" font-family="Arial, sans-serif" fill="#444444">Balanced printable outline preview</text>
  <ellipse cx="600" cy="720" rx="250" ry="310" fill="none" stroke="#111111" stroke-width="18"/>
  <circle cx="520" cy="650" r="20" fill="none" stroke="#111111" stroke-width="10"/>
  <circle cx="680" cy="650" r="20" fill="none" stroke="#111111" stroke-width="10"/>
  <path d="M 490 820 Q 600 900 710 820" fill="none" stroke="#111111" stroke-width="14" stroke-linecap="round"/>
  <path d="M 360 1060 Q 600 1180 840 1060" fill="none" stroke="#111111" stroke-width="18" stroke-linecap="round"/>
  <text x="120" y="1390" font-size="28" font-family="Arial, sans-serif" fill="#111111">Clean printable line art mock preview</text>
  <text x="120" y="1450" font-size="22" font-family="Arial, sans-serif" fill="#777777">Mock preview when OPENAI_API_KEY is not configured.</text>
</svg>`;

  return {
    imageDataUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    mediaType: "image/svg+xml",
    usage: null,
    costUsd: null
  };
}

async function generateColoringCardFromModel(input, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COLORING_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(IMAGE_API_BASE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "HTTP-Referer": APP_PUBLIC_URL,
        "X-Title": "Lihi Coloring Card"
      },
      body: JSON.stringify({
        model: input.model,
        prompt,
        input_references: [
          {
            type: "image_url",
            image_url: {
              url: input.photoDataUrl
            }
          }
        ],
        aspect_ratio: COLORING_IMAGE_ASPECT_RATIO,
        quality: input.quality,
        output_format: "png",
        background: "opaque",
        n: 1
      })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error?.message || `著色圖生成失敗 (${response.status})`);
    }

    const firstImage = result?.data?.[0];
    if (!firstImage?.b64_json) {
      throw new Error("模型沒有回傳圖片");
    }

    const mediaType = typeof firstImage.media_type === "string" ? firstImage.media_type : "image/png";
    const usage = result?.usage || null;
    return {
      imageDataUrl: `data:${mediaType};base64,${firstImage.b64_json}`,
      mediaType,
      usage,
      costUsd: extractColoringCostUsd(usage)
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractColoringCostUsd(usage) {
  const directCost = coerceFiniteNumber(
    usage?.cost_usd ?? usage?.costUsd ?? usage?.cost ?? usage?.total_cost ?? usage?.totalCost
  );
  if (directCost !== null) {
    return directCost;
  }

  const inputTokens = coerceFiniteNumber(usage?.input_tokens ?? usage?.prompt_tokens ?? usage?.inputTokens);
  const outputTokens = coerceFiniteNumber(usage?.output_tokens ?? usage?.completion_tokens ?? usage?.outputTokens);

  if (inputTokens === null && outputTokens === null) {
    return null;
  }

  const estimatedInputCost = ((inputTokens || 0) / 1000000) * COLORING_IMAGE_INPUT_PRICE_PER_MILLION;
  const estimatedOutputCost = ((outputTokens || 0) / 1000000) * COLORING_IMAGE_OUTPUT_PRICE_PER_MILLION;
  return Number((estimatedInputCost + estimatedOutputCost).toFixed(6));
}

function sumColoringCosts(outputs) {
  const numericCosts = outputs
    .map((output) => coerceFiniteNumber(output?.costUsd))
    .filter((value) => value !== null);

  if (numericCosts.length === 0) {
    return null;
  }

  return Number(numericCosts.reduce((sum, value) => sum + value, 0).toFixed(6));
}

function coerceFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ensureDeviceCookie(req, res) {
  const existingDeviceId = getTrustedDeviceIdFromRequest(req);
  if (existingDeviceId) {
    return existingDeviceId;
  }

  const deviceId = crypto.randomUUID();
  const signedValue = signDeviceCookieValue(deviceId);
  res.append("Set-Cookie", buildDeviceCookieHeader(signedValue));
  return deviceId;
}

function getTrustedDeviceIdFromRequest(req) {
  const cookies = parseCookieHeader(req.get("cookie") || "");
  const signedValue = cookies[DEVICE_COOKIE_NAME];
  if (!signedValue) {
    return "";
  }

  return verifyDeviceCookieValue(signedValue);
}

function parseCookieHeader(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex <= 0) {
        return acc;
      }

      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (!key) {
        return acc;
      }

      try {
        acc[key] = decodeURIComponent(value);
      } catch {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function signDeviceCookieValue(deviceId) {
  const normalizedDeviceId = String(deviceId || "").trim();
  const signature = crypto
    .createHmac("sha256", DEVICE_COOKIE_SECRET)
    .update(normalizedDeviceId)
    .digest("base64url");
  return `${normalizedDeviceId}.${signature}`;
}

function verifyDeviceCookieValue(value) {
  const raw = String(value || "");
  const separatorIndex = raw.lastIndexOf(".");
  if (separatorIndex <= 0) {
    return "";
  }

  const deviceId = raw.slice(0, separatorIndex).trim();
  const signature = raw.slice(separatorIndex + 1).trim();
  if (!deviceId || !signature) {
    return "";
  }

  const expected = signDeviceCookieValue(deviceId);
  const expectedSignature = expected.slice(expected.lastIndexOf(".") + 1);
  if (signature.length !== expectedSignature.length) {
    return "";
  }

  try {
    if (
      crypto.timingSafeEqual(
        Buffer.from(signature, "utf8"),
        Buffer.from(expectedSignature, "utf8")
      )
    ) {
      return deviceId;
    }
  } catch {}

  return "";
}

function buildDeviceCookieHeader(signedValue) {
  const parts = [
    `${DEVICE_COOKIE_NAME}=${encodeURIComponent(signedValue)}`,
    "Path=/",
    `Max-Age=${DEVICE_COOKIE_TTL_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ];
  return parts.join("; ");
}

function createColoringSession(deviceId) {
  const normalizedDeviceId = String(deviceId || "").trim();
  const expiresAt = Date.now() + COLORING_SESSION_TTL_MS;
  const nonce = crypto.randomBytes(8).toString("base64url");
  const payload = `${normalizedDeviceId}.${expiresAt}.${nonce}`;
  const signature = crypto
    .createHmac("sha256", COLORING_SESSION_SECRET)
    .update(payload)
    .digest("base64url");

  return {
    token: `${payload}.${signature}`,
    expiresAt
  };
}

function verifyColoringSessionToken(token, deviceId) {
  const raw = String(token || "").trim();
  const normalizedDeviceId = String(deviceId || "").trim();
  const parts = raw.split(".");
  if (parts.length !== 4) {
    return false;
  }

  const [tokenDeviceId, expiresAtRaw, nonce, signature] = parts;
  if (!tokenDeviceId || !expiresAtRaw || !nonce || !signature) {
    return false;
  }

  if (tokenDeviceId !== normalizedDeviceId) {
    return false;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  const payload = `${tokenDeviceId}.${expiresAtRaw}.${nonce}`;
  const expectedSignature = crypto
    .createHmac("sha256", COLORING_SESSION_SECRET)
    .update(payload)
    .digest("base64url");

  if (signature.length !== expectedSignature.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expectedSignature, "utf8"));
  } catch {
    return false;
  }
}

function getColoringSessionTokenFromRequest(req) {
  return String(req.get("x-coloring-session") || "").trim();
}

function validateColoringRequest(req, options = {}) {
  const requireSessionToken = options.requireSessionToken !== false;
  const enforceActiveJobLimit = options.enforceActiveJobLimit === true;
  const consumeIpLimit = options.consumeIpLimit !== false;
  const deviceId = getTrustedDeviceIdFromRequest(req);
  if (!deviceId) {
    return {
      ok: false,
      status: 403,
      body: { ok: false, error: "missing_device_cookie", message: "請重新整理頁面後再試一次" }
    };
  }

  const ip = getRequestIp(req);
  pruneExpiredColoringAbuseState();
  const blocked = getColoringIpBlock(ip);
  if (blocked) {
    return {
      ok: false,
      status: 429,
      body: {
        ok: false,
        error: "ip_temporarily_blocked",
        message: "這個網路來源目前請求過於頻繁，請稍後再試",
        retryAfterSeconds: blocked.retryAfterSeconds
      }
    };
  }

  const suspicion = getColoringRequestSuspicionScore(req);
  if (suspicion.score >= 3) {
    const strikeResult = addColoringIpStrike(ip, suspicion.score);
    return {
      ok: false,
      status: strikeResult.blocked ? 429 : 403,
      body: {
        ok: false,
        error: strikeResult.blocked ? "ip_temporarily_blocked" : "suspicious_client",
        message: strikeResult.blocked
          ? "這個網路來源目前請求過於頻繁，請稍後再試"
          : "請從 coloring.bktsai.link 正常開啟頁面後再試一次"
      }
    };
  }

  if (requireSessionToken) {
    const sessionToken = getColoringSessionTokenFromRequest(req);
    if (!verifyColoringSessionToken(sessionToken, deviceId)) {
      addColoringIpStrike(ip, 2);
      return {
        ok: false,
        status: 403,
        body: {
          ok: false,
          error: "invalid_session_token",
          message: "頁面驗證已失效，請重新整理後再試一次"
        }
      };
    }
  }

  if (consumeIpLimit) {
    const ipLimit = consumeColoringIpLimit(ip);
    if (!ipLimit.ok) {
      return {
        ok: false,
        status: 429,
        body: {
          ok: false,
          error: "ip_rate_limited",
          message: "目前這個網路來源請求太快，請稍後再試",
          retryAfterSeconds: ipLimit.retryAfterSeconds
        }
      };
    }
  }

  if (enforceActiveJobLimit && hasReachedActiveColoringJobLimit(deviceId)) {
    addColoringIpStrike(ip, 1);
    return {
      ok: false,
      status: 429,
      body: {
        ok: false,
        error: "job_already_running",
        message: "這台裝置目前已有產圖任務進行中，請等目前這批完成後再送出下一批"
      }
    };
  }

  return {
    ok: true,
    context: {
      deviceId,
      ip
    }
  };
}

function getColoringRequestSuspicionScore(req) {
  let score = 0;
  const userAgent = String(req.get("user-agent") || "").trim();
  const origin = String(req.get("origin") || "").trim();
  const referer = String(req.get("referer") || "").trim();
  const secFetchSite = String(req.get("sec-fetch-site") || "").trim().toLowerCase();
  const secFetchMode = String(req.get("sec-fetch-mode") || "").trim().toLowerCase();

  if (!origin && !referer) {
    score += 2;
  }

  if (!userAgent || /(curl|wget|postman|insomnia|python|aiohttp|httpx|go-http-client|axios|node-fetch|powershell)/i.test(userAgent)) {
    score += 2;
  }

  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "same-site" && secFetchSite !== "none") {
    score += 1;
  }

  if (secFetchMode && secFetchMode !== "cors" && secFetchMode !== "same-origin" && secFetchMode !== "navigate") {
    score += 1;
  }

  return { score };
}

function getRequestIp(req) {
  const forwardedFor = String(req.get("x-forwarded-for") || "").trim();
  const rawIp = forwardedFor
    ? forwardedFor.split(",")[0]
    : (req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || "");
  return normalizeIp(rawIp);
}

function normalizeIp(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "unknown";
  }

  if (raw.startsWith("::ffff:")) {
    return raw.slice(7);
  }

  return raw;
}

function pruneExpiredColoringAbuseState() {
  const now = Date.now();
  for (const [ip, record] of coloringIpUsage.entries()) {
    if (!record || record.resetAt <= now) {
      coloringIpUsage.delete(ip);
    }
  }

  for (const [ip, record] of coloringIpBlocks.entries()) {
    if (!record || record.blockedUntil <= now) {
      coloringIpBlocks.delete(ip);
    }
  }
}

function getColoringIpUsageRecord(ip) {
  const normalizedIp = normalizeIp(ip);
  const now = Date.now();
  const existing = coloringIpUsage.get(normalizedIp);
  if (existing && existing.resetAt > now) {
    return existing;
  }

  const record = {
    count: 0,
    strikes: 0,
    resetAt: now + COLORING_IP_WINDOW_MS
  };
  coloringIpUsage.set(normalizedIp, record);
  return record;
}

function consumeColoringIpLimit(ip) {
  const record = getColoringIpUsageRecord(ip);
  record.count += 1;

  if (record.count <= COLORING_IP_WINDOW_LIMIT) {
    return { ok: true };
  }

  const strikeResult = addColoringIpStrike(ip, 1);
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - Date.now()) / 1000)),
    blocked: strikeResult.blocked
  };
}

function addColoringIpStrike(ip, weight = 1) {
  const normalizedIp = normalizeIp(ip);
  const record = getColoringIpUsageRecord(normalizedIp);
  record.strikes += Math.max(1, Number(weight) || 1);

  if (record.strikes >= COLORING_IP_BAN_THRESHOLD) {
    const blockedUntil = Date.now() + COLORING_IP_BAN_MS;
    coloringIpBlocks.set(normalizedIp, { blockedUntil });
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil(COLORING_IP_BAN_MS / 1000))
    };
  }

  return { blocked: false };
}

function getColoringIpBlock(ip) {
  const normalizedIp = normalizeIp(ip);
  const record = coloringIpBlocks.get(normalizedIp);
  if (!record) {
    return null;
  }

  if (record.blockedUntil <= Date.now()) {
    coloringIpBlocks.delete(normalizedIp);
    return null;
  }

  return {
    retryAfterSeconds: Math.max(1, Math.ceil((record.blockedUntil - Date.now()) / 1000))
  };
}

function hasReachedActiveColoringJobLimit(deviceId) {
  const normalizedDeviceId = String(deviceId || "").trim();
  const activeJobs = activeColoringJobsByDevice.get(normalizedDeviceId);
  return Boolean(activeJobs && activeJobs.size >= COLORING_ACTIVE_JOB_LIMIT_PER_DEVICE);
}

function markColoringJobActive(job) {
  const deviceId = String(job?.deviceId || "").trim();
  if (!deviceId) {
    return;
  }

  const activeJobs = activeColoringJobsByDevice.get(deviceId) || new Set();
  activeJobs.add(job.id);
  activeColoringJobsByDevice.set(deviceId, activeJobs);
}

function unmarkColoringJobActive(job) {
  const deviceId = String(job?.deviceId || "").trim();
  const jobId = String(job?.id || "").trim();
  if (!deviceId || !jobId) {
    return;
  }

  const activeJobs = activeColoringJobsByDevice.get(deviceId);
  if (!activeJobs) {
    return;
  }

  activeJobs.delete(jobId);
  if (activeJobs.size === 0) {
    activeColoringJobsByDevice.delete(deviceId);
  }
}

function consumeColoringQuota(req) {
  pruneExpiredColoringUsage();
  const deviceId = getTrustedDeviceIdFromRequest(req);
  if (!deviceId) {
    return { ok: false, error: "missing_device_cookie" };
  }

  const dayKey = getCurrentTaipeiDayKey();
  const usageKey = `${dayKey}:${deviceId}`;
  const currentCount = Number(coloringDailyUsage.get(usageKey) || 0);
  if (currentCount >= COLORING_DAILY_LIMIT) {
    return { ok: false, remaining: 0, limit: COLORING_DAILY_LIMIT };
  }

  coloringDailyUsage.set(usageKey, currentCount + 1);
  return {
    ok: true,
    remaining: Math.max(0, COLORING_DAILY_LIMIT - currentCount - 1),
    limit: COLORING_DAILY_LIMIT
  };
}

function pruneExpiredColoringUsage() {
  const currentDay = getCurrentTaipeiDayKey();
  for (const key of coloringDailyUsage.keys()) {
    if (!String(key).startsWith(`${currentDay}:`)) {
      coloringDailyUsage.delete(key);
    }
  }
}

function getCurrentTaipeiDayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COLORING_DAILY_LIMIT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function hasAuthorizedBridgeAccess(req) {
  if (BRIDGE_API_KEY) {
    return hasValidBridgeApiKey(req);
  }

  return isTrustedLocalBrowserRequest(req);
}

function hasValidBridgeApiKey(req) {
  if (!BRIDGE_API_KEY) {
    return false;
  }

  return isAuthorized(req);
}

function isTrustedLocalBrowserRequest(req) {
  const origin = getAllowedRequestOrigin(req);
  if (!origin) {
    return false;
  }

  if (!getTrustedDeviceIdFromRequest(req)) {
    return false;
  }

  if (isExplicitlyAllowedOrigin(origin)) {
    return true;
  }

  const hostHeader = cleanHostHeader(req.get("x-forwarded-host") || req.get("host") || "");
  return isLoopbackHost(hostHeader);
}

function isExplicitlyAllowedOrigin(originValue) {
  if (!BRIDGE_ALLOWED_ORIGINS.length) {
    return false;
  }

  try {
    const parsed = new URL(String(originValue || "").trim());
    return BRIDGE_ALLOWED_ORIGINS.includes(parsed.origin.toLowerCase());
  } catch {
    return false;
  }
}

function getAllowedRequestOrigin(req) {
  const hostHeader = cleanHostHeader(req.get("x-forwarded-host") || req.get("host") || "");
  if (!hostHeader) {
    return "";
  }

  const originHeader = req.get("origin") || "";
  if (originHeader) {
    return isMatchingOrigin(originHeader, hostHeader) ? originHeader : "";
  }

  const refererHeader = req.get("referer") || "";
  if (!refererHeader) {
    return "";
  }

  try {
    const parsed = new URL(refererHeader);
    const refererOrigin = parsed.origin;
    return isMatchingOrigin(refererOrigin, hostHeader) ? refererOrigin : "";
  } catch {
    return "";
  }
}

function cleanHostHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/:\d+$/, "");
}

function isMatchingOrigin(originValue, expectedHost) {
  try {
    const parsed = new URL(String(originValue || "").trim());
    return parsed.protocol === "https:" && cleanHostHeader(parsed.host) === expectedHost;
  } catch {
    return false;
  }
}

function isLoopbackHost(hostname) {
  const normalized = cleanHostHeader(hostname);
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "::1";
}

function createTaskQueue(maxConcurrency) {
  const limit = Math.max(1, Number(maxConcurrency) || 1);
  let activeTasks = 0;
  const pendingTasks = [];

  return function enqueue(task) {
    return new Promise((resolve, reject) => {
      const runTask = async () => {
        activeTasks += 1;

        try {
          resolve(await task());
        } catch (error) {
          reject(error);
        } finally {
          activeTasks = Math.max(0, activeTasks - 1);
          const nextTask = pendingTasks.shift();
          if (nextTask) {
            nextTask();
          }
        }
      };

      if (activeTasks < limit) {
        runTask();
        return;
      }

      pendingTasks.push(runTask);
    });
  };
}

function getCachedValue(cache, key) {
  if (!key || !cache.has(key)) {
    return null;
  }

  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function setCachedValue(cache, key, value, ttlMs) {
  if (!key || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return;
  }

  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });

  pruneCache(cache, CACHE_MAX_ENTRIES);
}

function pruneCache(cache, maxEntries) {
  if (cache.size <= maxEntries) {
    return;
  }

  const entries = Array.from(cache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const deleteCount = Math.max(0, cache.size - maxEntries);
  for (let index = 0; index < deleteCount; index += 1) {
    cache.delete(entries[index][0]);
  }
}

async function getOrCreateInflight(inflightMap, key, factory) {
  if (!key) {
    return factory();
  }

  if (inflightMap.has(key)) {
    return inflightMap.get(key);
  }

  const task = Promise.resolve().then(factory);
  inflightMap.set(key, task);

  try {
    return await task;
  } finally {
    inflightMap.delete(key);
  }
}

function buildGenerateCacheKey(input) {
  return createDeterministicHash({
    type: "generate",
    productName: input.productName,
    benefits: input.benefits,
    productUrl: input.productUrl,
    tone: input.tone,
    voiceBalance: input.voiceBalance,
    complianceMode: input.complianceMode,
    model: OPENAI_MODEL
  });
}

function buildFormatCacheKey(input) {
  return createDeterministicHash({
    type: "format",
    productName: input.productName,
    productUrl: input.productUrl,
    channel: input.channel,
    tone: input.tone,
    voiceBalance: input.voiceBalance,
    complianceMode: input.complianceMode,
    masterDraft: input.masterDraft,
    model: OPENAI_MODEL
  });
}

function createDeterministicHash(value) {
  return crypto.createHash("sha1").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function normalizeInput(payload) {
  return {
    productName: String(payload?.productName ?? payload?.product_name ?? "").trim(),
    benefits: Array.isArray(payload?.benefits)
      ? payload.benefits.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
    extraContext: String(payload?.extraContext ?? payload?.extra_context ?? "").trim(),
    stylePreset: normalizeStylePreset(payload?.stylePreset ?? payload?.style_preset),
    productUrl: normalizeProductUrl(payload?.productUrl ?? payload?.product_url),
    tone: String(payload?.tone ?? "").trim(),
    voiceBalance: normalizeVoiceBalance(payload?.voiceBalance ?? payload?.voice_balance),
    complianceMode: normalizeComplianceMode(payload?.complianceMode ?? payload?.compliance_mode)
  };
}

function normalizeFormatInput(payload) {
  return {
    productName: String(payload?.productName ?? payload?.product_name ?? "").trim(),
    productUrl: normalizeProductUrl(payload?.productUrl ?? payload?.product_url),
    stylePreset: normalizeStylePreset(payload?.stylePreset ?? payload?.style_preset),
    channel: String(payload?.channel ?? "").trim(),
    tone: String(payload?.tone ?? "").trim(),
    voiceBalance: normalizeVoiceBalance(payload?.voiceBalance ?? payload?.voice_balance),
    complianceMode: normalizeComplianceMode(payload?.complianceMode ?? payload?.compliance_mode),
    masterDraft: payload?.masterDraft && typeof payload.masterDraft === "object"
      ? normalizeReusableMasterDraft(payload.masterDraft, normalizeProductUrl(payload?.productUrl ?? payload?.product_url))
      : null
  };
}

function normalizeProductUrl(value) {
  return normalizeExternalUrl(value);
}

function normalizeStylePreset(value) {
  const normalized = String(value || "").trim();
  return normalized === RANDOM_STYLE_PRESET_KEY || Object.prototype.hasOwnProperty.call(STYLE_PRESETS, normalized)
    ? normalized
    : RANDOM_STYLE_PRESET_KEY;
}

function getConcreteStylePresetKeys() {
  return Object.keys(STYLE_PRESETS);
}

function resolveStylePresetKey(value) {
  const normalized = normalizeStylePreset(value);
  if (normalized !== RANDOM_STYLE_PRESET_KEY) {
    return normalized;
  }

  const keys = getConcreteStylePresetKeys();
  return keys[Math.floor(Math.random() * keys.length)] || "home_healing";
}

function normalizeVoiceBalance(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 3;
  }

  return Math.min(5, Math.max(1, Math.round(parsed)));
}

function normalizeComplianceMode(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes";
}

function validateGenerateInput(data) {
  const errors = [];

  if (!data.productName) {
    errors.push("product_name 是必填欄位");
  } else if (data.productName.length > 80) {
    errors.push("product_name 需在 80 字內");
  }

  if (data.benefits.length < 3 || data.benefits.length > 4) {
    errors.push("benefits 需要 3~4 項");
  } else if (data.benefits.some((item) => item.length > 60)) {
    errors.push("每個 benefit 需在 60 字內");
  }

  if (data.extraContext.length > 600) {
    errors.push("extra_context 需在 600 字內");
  }

  if (!data.productUrl) {
    errors.push("product_url 必須是合法網址");
  } else if (data.productUrl.length > 300) {
    errors.push("product_url 需在 300 字內");
  } else if (!isAllowedPublicUrl(data.productUrl)) {
    errors.push("product_url 必須是公開 https 網址，且不可使用 localhost、內網 IP 或自訂 port");
  }

  if (!["brand", "conversion"].includes(data.tone)) {
    errors.push("tone 必須是 brand 或 conversion");
  }

  if (!(data.stylePreset === RANDOM_STYLE_PRESET_KEY || Object.prototype.hasOwnProperty.call(STYLE_PRESETS, data.stylePreset))) {
    errors.push("style_preset 無效");
  }

  return errors;
}

function validateFormatInput(data) {
  const errors = [];

  if (!data.productName) {
    errors.push("product_name 是必填欄位");
  } else if (data.productName.length > 80) {
    errors.push("product_name 需在 80 字內");
  }

  if (!data.productUrl) {
    errors.push("product_url 必須是合法網址");
  } else if (data.productUrl.length > 300) {
    errors.push("product_url 需在 300 字內");
  } else if (!isAllowedPublicUrl(data.productUrl)) {
    errors.push("product_url 必須是公開 https 網址，且不可使用 localhost、內網 IP 或自訂 port");
  }

  if (!["meta_ad", "google_ads", "sms", "email", "line"].includes(data.channel)) {
    errors.push("channel 必須是 meta_ad、google_ads、sms、email 或 line");
  }

  if (!["brand", "conversion"].includes(data.tone)) {
    errors.push("tone 必須是 brand 或 conversion");
  }

  if (!(data.stylePreset === RANDOM_STYLE_PRESET_KEY || Object.prototype.hasOwnProperty.call(STYLE_PRESETS, data.stylePreset))) {
    errors.push("style_preset 無效");
  }

  if (!data.masterDraft) {
    errors.push("masterDraft 是必填欄位");
  } else {
    errors.push(...validateMasterDraftPayload(data.masterDraft));
  }

  return errors;
}

function validateMasterDraftPayload(masterDraft) {
  const errors = [];
  const limits = {
    hook: 120,
    audienceAngle: 120,
    valueProp: 300,
    cta: 60,
    toneNote: 120,
    url: 300
  };

  for (const [key, maxLength] of Object.entries(limits)) {
    const value = cleanText(masterDraft?.[key]);
    if (value && value.length > maxLength) {
      errors.push(`masterDraft.${key} 需在 ${maxLength} 字內`);
    }
  }

  if (masterDraft?.url && !isAllowedPublicUrl(masterDraft.url)) {
    errors.push("masterDraft.url 必須是公開 https 網址，且不可使用 localhost、內網 IP 或自訂 port");
  }

  const listFields = [
    ["benefitPoints", 5, 80],
    ["proofPoints", 5, 120]
  ];

  for (const [field, maxItems, maxItemLength] of listFields) {
    const values = Array.isArray(masterDraft?.[field]) ? masterDraft[field] : [];
    if (values.length > maxItems) {
      errors.push(`masterDraft.${field} 最多 ${maxItems} 項`);
    }
    if (values.some((item) => cleanText(item).length > maxItemLength)) {
      errors.push(`masterDraft.${field} 每項需在 ${maxItemLength} 字內`);
    }
  }

  return errors;
}

function normalizeReusableMasterDraft(masterDraft, fallbackUrl = "") {
  if (!masterDraft || typeof masterDraft !== "object") {
    return null;
  }

  const cleanList = (values, maxItems, maxItemLength) =>
    (Array.isArray(values) ? values : [])
      .map((item) => truncateTextHard(cleanText(item), maxItemLength))
      .filter(Boolean)
      .slice(0, maxItems);

  return {
    hook: truncateTextHard(cleanText(masterDraft.hook), 120),
    audienceAngle: truncateTextHard(cleanText(masterDraft.audienceAngle), 120),
    valueProp: truncateTextHard(cleanText(masterDraft.valueProp), 300),
    benefitPoints: cleanList(masterDraft.benefitPoints, 5, 80),
    proofPoints: cleanList(masterDraft.proofPoints, 5, 120),
    cta: truncateTextHard(cleanText(masterDraft.cta), 60),
    toneNote: truncateTextHard(cleanText(masterDraft.toneNote), 120),
    url: resolveSafeOutputUrl(masterDraft.url, fallbackUrl)
  };
}

function buildPrompt(data, pageAnalysis) {
  const systemPrompt = buildSystemPrompt(data);
  const toneLabel = getToneLabel(data.tone);
  const benefitsList = data.benefits.map((item, index) => `${index + 1}. ${item}`).join("\n");
  const pageSummary = formatPageAnalysis(pageAnalysis);
  const stylePreset = getStylePresetMeta(data.stylePreset);

  return `${systemPrompt}

任務：
請先吸收「銷售頁分析結果」與「使用者補充資訊」，先產出結構化母稿，再產出 1 則可直接使用的客戶版廣告文案。

銷售頁分析結果：
${pageSummary}

使用者補充資訊：

產品名稱：${data.productName}
產品優點：
${benefitsList}
其他想補充的內容：${data.extraContext || "無"}
風格版本：${stylePreset.label}

產品頁連結：${data.productUrl}
文案風格：${toneLabel}
感性 / 理性強度：${getVoiceBalanceInputLabel(data.voiceBalance)}
台灣食品廣告合規模式：${data.complianceMode ? "開啟" : "關閉"}

流程要求：
1. 母稿階段以單一來源嚴格套用感性 / 理性結構化規則
2. 主文案階段嚴格遵守母稿的 hook、value_prop、benefit_points、proof_points、cta、tone_note
3. 不要在後續階段重新發明另一套風格`;
}

function buildSystemPrompt(data = {}) {
  return `你是一個「Beck Copy Engine」，核心不是私人記憶，而是可產品化的 Beck 文案方法論。

你的工作是把產品頁可驗證資訊、使用者提供的優點，以及轉換導向的寫作框架，整理成 1 則可直接上稿的廣告文案。

這是全域規則，所有階段都必須遵守：
1. 先以銷售頁實際資訊為主，再融合使用者補充的優點；若兩者衝突，優先採信頁面上可驗證資訊。
2. 文案要符合行銷用途，優先清楚、有鉤子、有節奏、有 CTA，不要只堆形容詞。
3. 若風格是品牌型，語氣偏質感、可信、能建立品牌印象。
4. 若風格是轉單型，語氣偏直接、清楚、優先解決猶豫與下單阻力。
5. 若銷售頁圖片 OCR 有抓到關鍵字，優先整合那些頁面上已出現的優點。
6. 不要捏造頁面上沒有、且使用者也沒提供的具體數字、療效、保證、折扣或權威背書。
7. 廣告文案內不要提及任何價格、售價、原價、優惠價、折扣、金額或付款資訊。
8. 不要輸出多個版本，不要解釋思考過程，不要加前言或備註。
9. 標題要先抓主要優點或痛點，主文要把價值講清楚，CTA 要明確可執行。
10. 感性 / 理性強度的詳細結構化規則只在母稿階段定義一次，後續階段只能遵守，不要重建。
11. 所有輸出一律使用台灣繁體中文，不可混入簡體中文。
12. 若要引用頁面上抓到的優點或規格，直接使用產品語句本身，不要加上「銷售頁面明確標示」、「頁面提到」、「圖片顯示」、「條列優點包含」這類包裝前綴。
${buildStylePresetPromptBlock(data)}
${buildTaiwanCompliancePromptBlock(data)}`;
}

function buildStylePresetPromptBlock(data = {}) {
  const stylePreset = getStylePresetMeta(data.stylePreset);
  return `13. 本次指定風格版本為「${stylePreset.label}」，請明確遵守這個版本的語氣與場景方向。
14. ${stylePreset.prompt}`;
}

function buildTaiwanCompliancePromptBlock(data = {}) {
  if (!data?.complianceMode) {
    return "15. 若使用者未開啟台灣食品廣告合規模式，可依一般行銷文案需求產出，但仍需避免虛構療效。";
  }

  return `15. 使用者已開啟「台灣食品廣告合規模式」，請優先遵守食品廣告紅線，輸出必須避開高風險與禁用詞。
16. 不得宣稱醫療效能、治療疾病、預防疾病，亦不得提及疾病名稱、降血糖、降血壓、抗癌、殺菌、消炎、修復器官等詞意。
17. 一般食品未經許可，不得廣告為健康食品，不得使用「健康食品功效」、「小綠人等級」、「國家認證保健功效」等詞意。
18. 避免高風險表述，例如提升免疫力、改善睡眠、燃脂、爆瘦、排毒、逆齡、回春、修復、再生、醫師推薦、實證有效、立即見效、百分之百有效等或近似詞。
19. 若需要表達產品價值，優先使用中性、可驗證、較不易誤解的寫法，例如產品資訊、成分資訊、口感特色、使用情境、日常營養補給、閱讀清楚度。
20. 若提到營養素或成分，只能描述該營養素或成分本身的中性資訊，不得把成分研究直接延伸為產品療效。`;
}

function buildVoiceBalanceFramework() {
  return `感性 / 理性強度必須嚴格遵守以下結構化規則：

【感性很多 (Level 1)】
- 開頭必須用情境、畫面、情緒或故事切入，不能直接講產品
- 產品優點最多提 2 個，且要用「感受」或「體驗」包裝，不能條列
- 禁止出現數字、數據、比較、具體證據或條列式
- 句子要長、有節奏感、有留白
- CTA 要柔軟間接，例如「一起來看看」、「值得你花 30 秒」、「給自己一個機會」
- 全程用第二人稱「你」，像朋友聊天

【偏感性 (Level 2)】
- 開頭優先用具體生活情境或痛點畫面
- 產品優點最多提 3 個，至少 2 個要用感受包裝
- 可以出現 1 個簡單數字或證據，但不能條列
- 句子長短交錯，保留一些留白
- CTA 要溫和但有行動感，例如「現在就了解」、「來看看適不適合你」

【平衡 (Level 3)】
- 開頭可以用情境或直接價值，兩者皆可
- 產品優點提 3 到 4 個，感受與事實各半
- 可以出現數字、證據，但不要條列
- 句子以易讀為主，適當留白
- CTA 明確但不要過於強硬，例如「立即了解更多」、「馬上看看」

【偏理性 (Level 4)】
- 開頭直接點出主要價值、痛點或差異
- 產品優點至少提 3 到 4 個，用清楚的事實或證據支持
- 鼓勵用數字、比較、條列式（最多 4 點）
- 句子要短、清楚、資訊密度高
- CTA 要明確直接，例如「立即購買」、「馬上行動」、「現在就選」

【理性很多 (Level 5)】
- 開頭必須直接講核心價值、最大差異或最強痛點
- 產品優點至少提 3 到 4 個，全部用事實、證據或數據支持
- 必須用條列式呈現重點（3 到 4 點）
- 句子要最短、最清楚，資訊密度最高
- CTA 要最強硬直接，例如「立即下單」、「馬上購買」、「立刻選」
- 禁止抒情、留白、曖昧用詞`;
}

async function generateMasterDraftWithFallback(data, pageAnalysis) {
  try {
    return await generateMasterDraftFromModel(data, pageAnalysis);
  } catch {
    return buildFallbackMasterDraft(data, pageAnalysis);
  }
}

async function generatePrimaryBundleWithFallback(data, pageAnalysis) {
  try {
    return await generatePrimaryBundleFromModel(data, pageAnalysis);
  } catch {
    const masterDraft = await generateMasterDraftWithFallback(data, pageAnalysis);
    const output = await generatePrimaryCopyWithFallback(masterDraft, data);
    return { masterDraft, output };
  }
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
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "HTTP-Referer": "https://copy.bktsai.link",
        "X-Title": "Beck Copy Engine"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: buildMasterDraftSystemPrompt(data) },
          { role: "user", content: buildMasterDraftUserInput(data, pageAnalysis) }
        ],
        reasoning: buildReasoningConfig(),
        max_tokens: 900
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

async function generatePrimaryBundleFromModel(data, pageAnalysis) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_BASE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "HTTP-Referer": "https://copy.bktsai.link",
        "X-Title": "Beck Copy Engine"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: buildPrimaryBundleSystemPrompt(data) },
          { role: "user", content: buildPrimaryBundleUserInput(data, pageAnalysis) }
        ],
        reasoning: buildReasoningConfig(),
        max_tokens: 1200
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error?.message || `整合生成失敗 (${response.status})`);
    }

    const text = extractModelOutputText(result);
    if (!text) {
      throw new Error("整合生成沒有回傳可解析文字");
    }

    return parsePrimaryBundleOutput(text, data);
  } finally {
    clearTimeout(timer);
  }
}

function buildMasterDraftSystemPrompt(data) {
  return `${buildSystemPrompt(data)}

你現在負責母稿層。請先產出結構化母稿，再交由 formatter 轉成不同渠道格式。

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
1. 這一層是感性 / 理性結構化規則的唯一來源，後續主文案與渠道 formatter 只能遵守這份母稿，不要重新定義。
2. hook、value_prop、cta 都要可直接拿去改寫成廣告。
3. benefit_points 以 3 項為主，proof_points 最多 3 項。
4. tone_note 必須明確寫出本次應遵守的語氣方向，至少包含文案風格與感性 / 理性強度。
5. 若感性強度較高，hook 與 value_prop 要更有情境感；若理性強度較高，要更清楚講價值與重點。

${buildVoiceBalanceFramework()}`;
}

function buildPrimaryBundleSystemPrompt(data) {
  return `${buildSystemPrompt(data)}

你現在負責一次完成兩件事：
1. 先產出結構化母稿
2. 再根據同一份母稿，直接產出主要文案

你只能輸出合法 JSON，不要輸出 markdown，不要輸出程式碼 fence，不要輸出解釋文字。

JSON schema:
{
  "master_draft": {
    "hook": "一句最先抓注意力的核心句",
    "audience_angle": "受眾切角",
    "value_prop": "主要價值主張",
    "benefit_points": ["優點1", "優點2", "優點3"],
    "proof_points": ["可驗證線索1", "可驗證線索2"],
    "cta": "行動句",
    "tone_note": "語氣說明",
    "url": "產品連結"
  },
  "primary_output": {
    "title": "主標題",
    "body": "完整主文，可保留段落換行",
    "cta": "行動句",
    "url": "產品連結"
  }
}

規則：
1. master_draft 仍是感性 / 理性結構化規則的唯一來源。
2. primary_output 必須嚴格遵守 master_draft，不要重新發明另一套風格。
3. primary body 優先 2 到 4 段，保留閱讀節奏與排版。
4. 不要像規格彙整，要像真的文案。
5. 可以選最強的 2 到 3 個重點發揮，不要硬塞全部。
6. 不要提及任何價格、售價、原價、優惠價、折扣或金額。
7. 禁止使用品牌簡報、提案稿、報告摘要語氣，例如「核心價值在於」、「製程數據透明且嚴格：」、「以事實支撐品質，用數據定義標準」、「這是一碗回歸食材本質」這類總結式或口號式轉場。
8. 不要用冒號開頭帶出一整段規格說明；若要寫事實，直接自然寫進句子裡。

${buildVoiceBalanceFramework()}`;
}

function buildMasterDraftUserInput(data, pageAnalysis) {
  const toneLabel = getToneLabel(data.tone);
  const benefitsList = data.benefits.map((item, index) => `${index + 1}. ${item}`).join("\n");
  const stylePreset = getStylePresetMeta(data.stylePreset);

  return `請根據以下資料生成結構化母稿。

銷售頁分析結果：
${formatPageAnalysis(pageAnalysis)}

使用者補充資訊：
產品名稱：${data.productName}
產品優點：
${benefitsList}
其他想補充的內容：${data.extraContext || "無"}
風格版本：${stylePreset.label}
產品頁連結：${data.productUrl}
文案風格：${toneLabel}
感性 / 理性強度：${getVoiceBalanceInputLabel(data.voiceBalance)}
台灣食品廣告合規模式：${data.complianceMode ? "開啟" : "關閉"}
`;
}

function buildPrimaryBundleUserInput(data, pageAnalysis) {
  return buildMasterDraftUserInput(data, pageAnalysis);
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
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "HTTP-Referer": "https://copy.bktsai.link",
        "X-Title": "Beck Copy Engine"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: buildPrimaryCopySystemPrompt(input) },
          { role: "user", content: buildPrimaryCopyUserInput(masterDraft, input) }
        ],
        reasoning: buildReasoningConfig(),
        max_tokens: 900
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

    return parseChannelCopyOutput(text, "primary", input.productUrl, {
      complianceMode: input.complianceMode,
      contextInput: input
    });
  } finally {
    clearTimeout(timer);
  }
}

async function generatePrimaryCopyWithFallback(masterDraft, input) {
  try {
    return await generatePrimaryCopyFromModel(masterDraft, input);
  } catch {
    return formatDraftForChannel(masterDraft, "primary", input.productUrl, {
      complianceMode: input.complianceMode,
      contextInput: input
    });
  }
}

function buildPrimaryCopySystemPrompt(input) {
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
4. 嚴格遵守母稿中的 hook、value_prop、benefit_points、proof_points、cta、tone_note，不要重新定義感性 / 理性結構。
5. CTA 要自然。
6. 不要提及任何價格、售價、原價、優惠價、折扣或金額。
7. 禁止使用品牌簡報、提案稿、報告摘要語氣，例如「核心價值在於」、「製程數據透明且嚴格：」、「以事實支撐品質，用數據定義標準」、「這是一碗回歸食材本質」這類總結式或口號式轉場。
8. 不要用冒號開頭帶出一整段規格說明；若要寫事實，直接自然寫進句子裡。
${buildTaiwanCompliancePromptBlock(input)}`;
}

function buildPrimaryCopyUserInput(masterDraft, input) {
  return `請把以下結構化母稿改寫成主要文案。

產品名稱：${input.productName}
風格版本：${getStylePresetMeta(input.stylePreset).label}
文案風格：${getToneLabel(input.tone)}
連結：${input.productUrl}
台灣食品廣告合規模式：${input.complianceMode ? "開啟" : "關閉"}
其他想補充的內容：${input.extraContext || "無"}

母稿：
${JSON.stringify(masterDraft, null, 2)}
`;
}

async function generateChannelCopyFromModel(masterDraft, input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHANNEL_FORMATTER_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_BASE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "HTTP-Referer": "https://copy.bktsai.link",
        "X-Title": "Beck Copy Engine"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: buildChannelFormatterSystemPrompt(input.channel, input) },
          { role: "user", content: buildChannelFormatterUserInput(masterDraft, input) }
        ],
        reasoning: buildReasoningConfig(),
        max_tokens: 900
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

    return parseChannelCopyOutput(text, input.channel, input.productUrl, {
      complianceMode: input.complianceMode,
      contextInput: input
    });
  } finally {
    clearTimeout(timer);
  }
}

async function generateChannelCopyWithFallback(masterDraft, input) {
  try {
    return await generateChannelCopyFromModel(masterDraft, input);
  } catch {
    return formatDraftForChannel(masterDraft, input.channel, input.productUrl, {
      complianceMode: input.complianceMode,
      contextInput: input
    });
  }
}

function buildChannelFormatterSystemPrompt(channel, input = {}) {
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
4. 嚴格遵守母稿 tone_note，不要自行改變感性 / 理性方向。
5. title + body + cta 三個欄位的總字元數必須小於等於 70，不包含 url。
6. 不要捏造數字、折扣、時效。
7. 不要提及任何價格、售價、原價、優惠價或金額。
${buildTaiwanCompliancePromptBlock(input)}`;
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
2. 嚴格遵守母稿 tone_note，不要自行改變感性 / 理性方向。
3. title + body + cta 三個欄位的總字元數必須小於等於 80，不包含 url。
4. 結尾一定要收在 CTA，再接產品連結。
5. 可保留 2 到 3 小段節奏，但總體要短。
6. 不要捏造數字、折扣、時效。
7. 不要提及任何價格、售價、原價、優惠價或金額。
${buildTaiwanCompliancePromptBlock(input)}`;
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
6. 嚴格遵守母稿 tone_note，不要自行改變感性 / 理性方向。
7. body 要整理成 2 到 3 小段，每段 1 句到 2 句，排版乾淨好讀，不要整段黏在一起。
8. body 的最後一段要自然收進行動句，最後一行直接放產品連結。
9. CTA 要自然，不要像按鈕名稱。
10. 不要捏造數字、療效、保證、折扣或時效。
11. 不要提及任何價格、售價、原價、優惠價或金額。
12. 開頭不要用空泛回憶、哲理問句、自我感動式寫法，避免像「還記得…嗎」「我們想給你」「給自己一個機會」這種句型。
13. 不要用過度抒情的比喻或散文化語氣，直接把產品重點講清楚。
${buildTaiwanCompliancePromptBlock(input)}`;
  }

  if (channel === "google_ads") {
    return `你是一個 Google Ads formatter。

你會收到一份結構化母稿，請把它改寫成一則可直接上稿的繁體中文 Google 搜尋廣告文案。

你只能輸出合法 JSON，不要輸出 markdown，不要輸出程式碼 fence，不要輸出解釋文字。

JSON schema:
{
  "title": "Headline，固定 3 組，每組一行，用 1. 2. 3. 列出",
  "body": "Description，固定 3 組，每組一行，用 1. 2. 3. 列出",
  "description": "Display path 1",
  "cta": "Display path 2",
  "url": "Final URL"
}

規則：
1. title 要固定輸出 3 組 Headline，每組各自小於等於 30 字元。
2. body 要固定輸出 3 組 Description，每組各自小於等於 90 字元。
3. description 是 Display path 1，必須小於等於 15 字元。
4. cta 是 Display path 2，必須小於等於 15 字元。
5. Display path 只能是短詞或短片語，不要句子，不要網址，不要多餘符號。
6. 嚴格遵守母稿 tone_note，不要自行改變感性 / 理性方向。
7. Final URL 必須直接使用產品連結，不可改寫。
8. 整體要像 Google 搜尋廣告，不要像 Meta 主文，也不要輸出多段排版。
9. 不要捏造數字、療效、保證、折扣。
10. 不要提及任何價格、售價、原價、優惠價或金額。
11. 三組 Headline 與三組 Description 內容要彼此有差異，不要只換標點或重複同一句。
${buildTaiwanCompliancePromptBlock(input)}`;
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
2. body 正文不含產品連結時，需控制在 120 到 150 字內。
3. body 優先 2 到 3 小段，每段 1 句，保留乾淨好讀的排版，不要擠成一整大段。
4. 可以只挑最強的 2 到 3 個重點，不要硬塞全部。
5. description 要補上，做為較短的輔助說明，不可留白。
6. 嚴格遵守母稿 tone_note，不要自行改變感性 / 理性方向。
7. Headline 不可超過 12 個字，包含標點符號。
8. Description 不可超過 15 個字，包含標點符號。
9. Primary text 最下方最後一行一定要放產品連結，不可省略。
10. CTA 要自然，不要像按鈕名稱。
11. 不要捏造數字、療效、保證、折扣。
12. 不要提及任何價格、售價、原價、優惠價或金額。
${buildTaiwanCompliancePromptBlock(input)}`;
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
風格版本：${getStylePresetMeta(input.stylePreset).label}
渠道：${getChannelLabel(input.channel)}
語氣：${getToneLabel(input.tone)}
感性 / 理性強度：${getVoiceBalanceInputLabel(input.voiceBalance)}
連結：${input.productUrl}
台灣食品廣告合規模式：${input.complianceMode ? "開啟" : "關閉"}

母稿：
${JSON.stringify(masterDraft, null, 2)}
`;
}

function detectTaiwanComplianceViolations(text) {
  const value = cleanText(text);
  if (!value) {
    return [];
  }

  const findings = [];
  for (const rule of TAIWAN_COMPLIANCE_FORBIDDEN_RULES) {
    if (rule.pattern.test(value)) {
      findings.push({ severity: "forbidden", label: rule.label });
    }
  }

  for (const rule of TAIWAN_COMPLIANCE_HIGH_RISK_RULES) {
    if (rule.pattern.test(value)) {
      findings.push({ severity: "high_risk", label: rule.label });
    }
  }

  return findings;
}

function sanitizeComplianceText(value, fallbackText = "") {
  let normalized = cleanText(value);
  if (!normalized) {
    return cleanText(fallbackText);
  }

  for (const rule of TAIWAN_COMPLIANCE_REPLACEMENTS) {
    normalized = normalized.replace(rule.pattern, rule.replacement);
  }

  normalized = cleanText(
    normalized
      .replace(/[，、；：,;:]{2,}/g, "，")
      .replace(/(?:^|[。！？.!?])\s*[，、；：,;:]+/g, "$1")
  );

  if (detectTaiwanComplianceViolations(normalized).length > 0) {
    normalized = cleanText(fallbackText);
  }

  return normalized;
}

function getComplianceSafeBenefitPoints(benefits, productName = "") {
  const source = Array.isArray(benefits) ? benefits : [];
  const sanitized = source
    .map((item) => sanitizeComplianceText(item, ""))
    .filter(Boolean)
    .filter((item) => !detectTaiwanComplianceViolations(item).length);

  if (sanitized.length) {
    return collectUnique(sanitized).slice(0, 3);
  }

  return collectUnique([
    `${productName}產品資訊更清楚`,
    "日常補給重點更好理解",
    "使用情境與閱讀重點更聚焦"
  ]).slice(0, 3);
}

function sanitizeMasterDraftForCompliance(masterDraft, input = {}) {
  const safeBenefits = getComplianceSafeBenefitPoints(masterDraft?.benefitPoints || input?.benefits || [], input.productName);
  const safeProofPoints = (Array.isArray(masterDraft?.proofPoints) ? masterDraft.proofPoints : [])
    .map((item) => sanitizeComplianceText(item, ""))
    .filter(Boolean)
    .filter((item) => !detectTaiwanComplianceViolations(item).length)
    .slice(0, 2);

  return {
    ...masterDraft,
    hook: sanitizeComplianceText(masterDraft?.hook, `${input.productName}，把產品重點說清楚`) || `${input.productName}，把產品重點說清楚`,
    audienceAngle: sanitizeComplianceText(masterDraft?.audienceAngle, "重視產品資訊透明與日常補給溝通的受眾") || "重視產品資訊透明與日常補給溝通的受眾",
    valueProp: sanitizeComplianceText(masterDraft?.valueProp, `${input.productName} 先整理產品頁與使用者提供的優點，再把重點轉成較中性、較不易誤解的食品廣告文案。`) || `${input.productName} 先整理產品頁與使用者提供的優點，再把重點轉成較中性、較不易誤解的食品廣告文案。`,
    benefitPoints: safeBenefits,
    proofPoints: safeProofPoints,
    cta: sanitizeComplianceText(masterDraft?.cta, "立即了解更多") || "立即了解更多",
    toneNote: collectUnique([
      sanitizeComplianceText(masterDraft?.toneNote, `${getStylePresetMeta(input.stylePreset).label}；${getToneFallbackNote(input.tone)}；${getVoiceBalanceLabel(input.voiceBalance)}`),
      "台灣食品廣告合規模式"
    ]).join("；"),
    url: resolveSafeOutputUrl(masterDraft?.url, input.productUrl)
  };
}

function sanitizeChannelOutputForCompliance(output, channel, contextInput = {}) {
  const safeOutput = {
    ...output,
    title: sanitizeComplianceText(output?.title, `${contextInput.productName || "產品"}重點整理`) || `${contextInput.productName || "產品"}重點整理`,
    body: sanitizeComplianceText(
      output?.body,
      channel === "email"
        ? `${contextInput.productName || "產品"} 這次先聚焦在產品資訊、使用情境與重點整理，讓內容更清楚也較不易誤解。`
        : "先看產品資訊、使用情境與整理後的重點。"
    ) || "先看產品資訊、使用情境與整理後的重點。",
    description: sanitizeComplianceText(output?.description, channel === "email" ? "先看清楚產品重點" : "先看產品資訊"),
    cta: sanitizeComplianceText(output?.cta, channel === "google_ads" ? "product-info" : "立即了解更多") || (channel === "google_ads" ? "product-info" : "立即了解更多"),
    url: resolveSafeOutputUrl(output?.url, contextInput.productUrl || output?.url)
  };

  if (channel === "google_ads") {
    safeOutput.description = normalizeGoogleAdsPathSegment(safeOutput.description || contextInput.productName || "product-info");
    safeOutput.cta = normalizeGoogleAdsPathSegment(safeOutput.cta || "product-info");
  }

  if (channel === "meta_ad" && !safeOutput.description) {
    safeOutput.description = "先看產品資訊";
  }

  if (channel === "email" && !safeOutput.description) {
    safeOutput.description = "先看清楚產品重點";
  }

  return safeOutput;
}

function extractModelOutputText(result) {
  // OpenAI Responses API format
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

  if (texts.length > 0) {
    return texts.join("\n").trim();
  }

  // OpenRouter Chat Completions API format
  if (typeof result?.choices?.[0]?.message?.content === "string" && result.choices[0].message.content.trim()) {
    return result.choices[0].message.content.trim();
  }

  return "";
}

function buildFallbackMasterDraft(data, pageAnalysis) {
  const safeBenefits = getComplianceSafeBenefitPoints(data.benefits, data.productName);
  const primary = safeBenefits[0] || "核心優點";
  const secondary = safeBenefits[1] || "主要優勢";
  const tertiary = safeBenefits[2] || "使用價值";
  const pageHook = pageAnalysis?.summary ? truncateText(pageAnalysis.summary, 80) : "頁面可驗證資訊";
  const isEmotional = normalizeVoiceBalance(data.voiceBalance) <= 2;

  const fallbackDraft = {
    hook:
      data.complianceMode
        ? `${data.productName}，把產品重點說清楚`
        : data.tone === "brand"
        ? isEmotional
          ? `${data.productName}，把 ${primary} 說得更貼近生活`
          : `${data.productName}，把 ${primary} 說得更清楚`
        : isEmotional
          ? `其實很多時候，只是想找到一個更貼近自己的 ${data.productName}`
          : `別再讓 ${data.productName} 的 ${primary} 被忽略`,
    audienceAngle:
      data.complianceMode
        ? "重視產品資訊透明與日常補給溝通的受眾"
        : data.tone === "brand"
        ? "想快速理解價值、降低猶豫的受眾"
        : "需要快速被推動下單的受眾",
    value_prop:
      data.complianceMode
        ? `${data.productName} 先整理頁面上可驗證的資訊與你提供的優點，再把重點濃縮成較中性、較不易誤解的食品廣告文案。`
        : data.tone === "brand"
        ? isEmotional
          ? `${data.productName} 先從產品頁整理出 ${pageHook}，再把重點優點轉成更有畫面、更貼近日常感受的溝通內容。`
          : `${data.productName} 先從產品頁整理出 ${pageHook}，再把重點優點濃縮成更容易理解的溝通內容。`
        : isEmotional
          ? `${data.productName} 把頁面上真正可用的優點放進更有感受的情境裡，讓人比較不抗拒地理解它的價值。`
          : `${data.productName} 直接把頁面上真正可用的優點推到最前面，讓受眾更快理解差異、減少猶豫。`,
    benefitPoints: safeBenefits.slice(0, 3),
    proofPoints: pageAnalysis?.visualEvidence?.claims?.slice(0, 2) || [],
    cta: data.complianceMode ? "立即了解更多" : data.tone === "brand" ? "立即了解更多" : "立即查看商品頁",
    toneNote:
      `${getStylePresetMeta(data.stylePreset).label}；${getToneFallbackNote(data.tone)}；${getVoiceBalanceLabel(data.voiceBalance)}${data.complianceMode ? "；台灣食品廣告合規模式" : ""}`,
    url: data.productUrl
  };

  return data.complianceMode ? sanitizeMasterDraftForCompliance(fallbackDraft, data) : fallbackDraft;
}

async function analyzeProductPage(productUrl) {
  const cacheKey = normalizeExternalUrl(productUrl);
  const cached = getCachedValue(pageAnalysisCache, cacheKey);
  if (cached) {
    return cached;
  }

  if (inflightPageAnalysis.has(cacheKey)) {
    return inflightPageAnalysis.get(cacheKey);
  }

  const task = (async () => {
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
  })();

  inflightPageAnalysis.set(cacheKey, task);
  try {
    const result = await task;
    setCachedValue(pageAnalysisCache, cacheKey, result, PAGE_ANALYSIS_CACHE_TTL_MS);
    return result;
  } finally {
    inflightPageAnalysis.delete(cacheKey);
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
    ? []
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
    summaryParts.push(truncateText(data.title, 80));
  }

  if (data.headings.length) {
    summaryParts.push(data.headings.slice(0, 3).join(" / "));
  }

  if (data.productMeta) {
    summaryParts.push(truncateText(data.productMeta, 120));
  }

  if (data.bulletPoints.length) {
    summaryParts.push(data.bulletPoints.slice(0, 3).join(" / "));
  }

  if (data.productVariants.length) {
    summaryParts.push(data.productVariants.slice(0, 3).join(" / "));
  }

  if (data.priceSignals.length) {
    summaryParts.push(data.priceSignals.slice(0, 3).join(" / "));
  }

  if (data.visualEvidence?.productTerms?.length) {
    summaryParts.push(
      data.visualEvidence.productTerms
        .slice(0, 3)
        .map((item) => truncateText(item, 60))
        .join(" / ")
    );
  }

  if (data.visualEvidence?.claims?.length) {
    summaryParts.push(
      data.visualEvidence.claims
        .slice(0, 3)
        .map((item) => truncateText(item, 60))
        .join(" / ")
    );
  }

  if (data.visualEvidence?.specs?.length) {
    summaryParts.push(
      data.visualEvidence.specs
        .slice(0, 3)
        .map((item) => truncateText(item, 60))
        .join(" / ")
    );
  }

  if (data.screenshotCount) {
    summaryParts.push(`頁面截圖 ${data.screenshotCount} 張`);
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
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "HTTP-Referer": "https://copy.bktsai.link",
        "X-Title": "Beck Copy Engine"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: promptBuilder(pageContext, image)
              },
              {
                type: "image_url",
                image_url: image.url
              }
            ]
          }
        ],
        reasoning: buildReasoningConfig(),
        max_tokens: 500
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

function buildReasoningConfig() {
  const config = {};

  if (Number.isFinite(OPENAI_REASONING_MAX_TOKENS) && OPENAI_REASONING_MAX_TOKENS > 0) {
    config.max_tokens = Math.round(OPENAI_REASONING_MAX_TOKENS);
  }

  if (OPENAI_REASONING_EXCLUDE) {
    config.exclude = true;
  }

  return Object.keys(config).length > 0 ? config : undefined;
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
  const normalizedUrl = normalizeExternalUrl(url);
  if (!normalizedUrl || !isAllowedPublicUrl(normalizedUrl)) {
    throw new Error("禁止抓取非公開網址");
  }

  return await fetchWithRedirectValidation(normalizedUrl, timeoutMs);
}

async function fetchWithRedirectValidation(url, timeoutMs, redirectCount = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "cache-control": "no-cache",
        pragma: "no-cache"
      }
    });

    if (response.status >= 300 && response.status < 400) {
      if (redirectCount >= 5) {
        throw new Error("重新導向次數過多");
      }

      const location = response.headers.get("location") || "";
      const redirectedUrl = normalizeExternalUrl(resolveUrl(location, url));
      if (!redirectedUrl || !isAllowedPublicUrl(redirectedUrl)) {
        throw new Error("重新導向到不允許的網址");
      }

      return await fetchWithRedirectValidation(redirectedUrl, timeoutMs, redirectCount + 1);
    }

    return response;
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

  const draft = {
    hook: normalizeTraditionalChineseText(cleanText(parsed?.hook)) || `${input.productName}，把重點說清楚`,
    audienceAngle: normalizeTraditionalChineseText(cleanText(parsed?.audience_angle)) || "",
    valueProp: normalizeTraditionalChineseText(stripSourceScaffoldingPhrases(cleanText(parsed?.value_prop))) || input.benefits.slice(0, 2).join("、"),
    benefitPoints: collectUnique([...benefits, ...input.benefits]).map((item) => stripSourceScaffoldingPhrases(item)).slice(0, 4),
    proofPoints: collectUnique(proofPoints).map((item) => stripSourceScaffoldingPhrases(item)).slice(0, 3),
    cta: normalizeTraditionalChineseText(cleanText(parsed?.cta)) || "立即了解更多",
    toneNote: normalizeTraditionalChineseText(cleanText(parsed?.tone_note)) || `${getStylePresetMeta(input.stylePreset).label}；${getToneFallbackNote(input.tone)}`,
    url: resolveSafeOutputUrl(parsed?.url, input.productUrl)
  };

  return normalizeReusableMasterDraft(
    input.complianceMode ? sanitizeMasterDraftForCompliance(draft, input) : draft,
    input.productUrl
  );
}

function parsePrimaryBundleOutput(rawOutput, input) {
  const normalized = String(rawOutput || "").trim();
  const match = normalized.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("整合輸出格式不是合法 JSON");
  }

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch (error) {
    throw new Error(`整合輸出 JSON 解析失敗：${formatError(error)}`);
  }

  const masterDraft = parseMasterDraftOutput(JSON.stringify(parsed?.master_draft || {}), input);
  const output = parseChannelCopyOutput(
    JSON.stringify(parsed?.primary_output || {}),
    "primary",
    input.productUrl,
    {
      complianceMode: input.complianceMode,
      contextInput: input
    }
  );

  return { masterDraft, output };
}

function formatDraftForChannel(masterDraft, channel, defaultUrl, options = {}) {
  if (channel === "primary") {
    return finalizeChannelOutput(formatPrimaryOutput(masterDraft, defaultUrl), channel, options);
  }

  if (channel === "sms") {
    return finalizeChannelOutput(formatSmsOutput(masterDraft, defaultUrl), channel, options);
  }

  if (channel === "line") {
    return finalizeChannelOutput(formatLineOutput(masterDraft, defaultUrl), channel, options);
  }

  if (channel === "email") {
    return finalizeChannelOutput(formatEmailOutput(masterDraft, defaultUrl), channel, options);
  }

  if (channel === "google_ads") {
    return finalizeChannelOutput(formatGoogleAdsOutput(masterDraft, defaultUrl), channel, options);
  }

  return finalizeChannelOutput(formatMetaAdOutput(masterDraft, defaultUrl), channel, options);
}

function finalizeChannelOutput(output, channel, options = {}) {
  const normalizedOutput = normalizeTraditionalChineseOutput(sanitizeSourceScaffoldingFromOutput(output));
  if (!options?.complianceMode) {
    return normalizedOutput;
  }

  return normalizeTraditionalChineseOutput(
    sanitizeChannelOutputForCompliance(normalizedOutput, channel, options.contextInput || {})
  );
}

function formatPrimaryOutput(masterDraft, defaultUrl) {
  const benefitSummary = masterDraft.benefitPoints?.slice(0, 3).join("、");
  return {
    title: truncateText(masterDraft.hook || masterDraft.valueProp, 52),
    body: [
      ensureSentence(masterDraft.valueProp || masterDraft.hook),
      benefitSummary ? ensureSentence(`這次會把 ${benefitSummary} 這幾個重點整理清楚`) : "",
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
  const lead = ensureSentence(masterDraft.valueProp || masterDraft.hook);
  const benefits = masterDraft.benefitPoints.slice(0, 2).join("、");
  const proof = masterDraft.proofPoints[0] ? ensureSentence(masterDraft.proofPoints[0]) : "";
  const cta = truncateText(masterDraft.cta || "立即了解更多", 28);
  const descriptionSource = masterDraft.benefitPoints[0] || masterDraft.audienceAngle || masterDraft.cta;
  const description = truncateText(cleanText(descriptionSource), 15);
  const body = normalizeMetaAdBodyLength([
    lead,
    benefits ? ensureSentence(`這次也把 ${benefits} 這幾個重點整理給你`) : "",
    proof
  ]
    .filter(Boolean));

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
  const previewSource = masterDraft.benefitPoints[0] || masterDraft.proofPoints?.[0] || masterDraft.valueProp || masterDraft.cta;
  const description = truncateText(cleanText(previewSource), 36);
  const detailLine = [masterDraft.benefitPoints?.[0], masterDraft.proofPoints?.[0]]
    .filter(Boolean)
    .join("，");
  const body = appendCtaAndUrlToEmailBody(
    normalizeEmailBodyLength([
      ensureSentence(masterDraft.valueProp || masterDraft.hook),
      detailLine ? ensureSentence(detailLine) : "",
      masterDraft.benefitPoints?.[1] ? ensureSentence(masterDraft.benefitPoints[1]) : ""
    ]
      .filter(Boolean)),
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
  const title = formatGoogleAdsVariantText(buildBridgeGoogleAdsHeadlineVariants(masterDraft));
  const body = formatGoogleAdsVariantText(buildBridgeGoogleAdsDescriptionVariants(masterDraft));
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

function parseChannelCopyOutput(rawOutput, channel, defaultUrl, options = {}) {
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
  const title = channel === "google_ads"
    ? String(parsed?.title || "").replace(/\r/g, "").trim()
    : cleanText(parsed?.title);
  const body = String(parsed?.body || "").replace(/\r/g, "").trim();
  const description = cleanText(parsed?.description);
  const cta = cleanText(parsed?.cta);
  const url = resolveSafeOutputUrl(parsed?.url, defaultUrl);

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
        body: appendUrlToMetaBody(normalizeMetaAdBodyLength(body), url),
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
        title: normalizeGoogleAdsVariantField(
          title,
          30,
          buildBridgeGoogleAdsHeadlineVariants(options?.contextInput?.masterDraft || {})
        ),
        body: normalizeGoogleAdsVariantField(
          body,
          90,
          buildBridgeGoogleAdsDescriptionVariants(options?.contextInput?.masterDraft || {})
        ),
        description: normalizeGoogleAdsPathSegment(description),
        cta: normalizeGoogleAdsPathSegment(cta)
      }
    : null;

  const normalizedOutput = {
    title: normalizedGoogleAds?.title || normalizedEmail?.title || normalizedLine?.title || normalizedSms?.title || normalizedMeta.title,
    body: normalizedGoogleAds?.body || normalizedEmail?.body || normalizedLine?.body || normalizedSms?.body || normalizedMeta.body,
    description: channel === "meta_ad" ? normalizedMeta.description : channel === "google_ads" ? normalizedGoogleAds.description : channel === "email" ? normalizedEmail.description : "",
    cta: normalizedGoogleAds?.cta || normalizedEmail?.cta || normalizedLine?.cta || normalizedSms?.cta || normalizedMeta.cta,
    url,
    labels
  };

  const sanitizedOutput = sanitizeSourceScaffoldingFromOutput(normalizedOutput);
  const complianceOutput = options.complianceMode
    ? sanitizeChannelOutputForCompliance(sanitizedOutput, channel, options.contextInput || {})
    : sanitizedOutput;

  return normalizeTraditionalChineseOutput(complianceOutput);
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

function normalizeGoogleAdsVariantField(value, maxLength, fallbackItems = []) {
  const variants = collectUniqueItems([
    ...parseGoogleAdsVariantLines(value)
      .map((item) => truncateTextHard(item, maxLength))
      .filter(Boolean),
    ...fallbackItems
      .map((item) => truncateTextHard(item, maxLength))
      .filter(Boolean)
  ]);

  if (!variants.length) {
    return "";
  }

  return formatGoogleAdsVariantText(variants.slice(0, 3));
}

function parseGoogleAdsVariantLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

function buildBridgeGoogleAdsHeadlineVariants(masterDraft) {
  const candidates = [
    masterDraft?.hook,
    masterDraft?.benefitPoints?.[0] ? `${masterDraft.benefitPoints[0]}先看` : "",
    masterDraft?.benefitPoints?.[1] ? `${masterDraft.benefitPoints[1]}也整理好了` : "",
    masterDraft?.valueProp,
    masterDraft?.audienceAngle ? `${masterDraft.audienceAngle}先了解` : "",
    masterDraft?.benefitPoints?.[0] ? `${masterDraft.benefitPoints[0]}重點整理` : "",
    masterDraft?.benefitPoints?.[1] ? `${masterDraft.benefitPoints[1]}一次看懂` : "",
    masterDraft?.cta ? `${masterDraft.cta}前先看重點` : ""
  ]
    .map((item) => truncateTextHard(item, 30))
    .filter(Boolean);

  return collectUniqueItems(candidates).slice(0, 3);
}

function buildBridgeGoogleAdsDescriptionVariants(masterDraft) {
  const candidates = [
    cleanText(masterDraft?.valueProp || masterDraft?.hook),
    cleanText([masterDraft?.benefitPoints?.[0], masterDraft?.proofPoints?.[0]].filter(Boolean).join("，")),
    cleanText([masterDraft?.benefitPoints?.[1], masterDraft?.cta].filter(Boolean).join("，")),
    masterDraft?.benefitPoints?.[0] ? `先看 ${masterDraft.benefitPoints[0]}，再決定也可以。` : "",
    masterDraft?.proofPoints?.[0] || "",
    masterDraft?.benefitPoints?.[1] ? `${masterDraft.benefitPoints[1]} 與產品重點已整理好。` : "",
    masterDraft?.benefitPoints?.[0] ? `${masterDraft.benefitPoints[0]} 的閱讀重點一次看懂。` : "",
    masterDraft?.cta ? `${masterDraft.cta} 前，先把這次重點看清楚。` : ""
  ]
    .map((item) => truncateTextHard(item, 90))
    .filter(Boolean);

  return collectUniqueItems(candidates).slice(0, 3);
}

function formatGoogleAdsVariantText(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function collectUniqueItems(items) {
  return Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));
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

function normalizeEmailBodyLength(textOrParagraphs, maxChars = 170) {
  const paragraphs = normalizeReadableParagraphs(textOrParagraphs, 3);
  const joined = paragraphs.join("\n\n").replace(/\r/g, "").trim();
  if (joined.length <= maxChars) {
    return joined;
  }

  const sliced = truncateTextHard(joined, maxChars).trim();
  const lastSentenceEnd = Math.max(sliced.lastIndexOf("。"), sliced.lastIndexOf("！"), sliced.lastIndexOf("？"));
  const cropped = lastSentenceEnd >= Math.floor(maxChars * 0.55)
    ? sliced.slice(0, lastSentenceEnd + 1).trim()
    : sliced
      .replace(/[，、；：,:-]?[^\s。！？.!?]{0,8}$/u, "")
      .trim()
      .replace(/[，、；：,:-]+$/u, "")
      .trim();

  return normalizeReadableParagraphs(cropped, 3).join("\n\n");
}

function normalizeMetaAdBodyLength(textOrParagraphs, minChars = 120, maxChars = 150) {
  const paragraphs = normalizeReadableParagraphs(textOrParagraphs, 3);
  let fullText = paragraphs.join("\n\n").trim();
  const getVisibleLength = (value) => String(value || "").replace(/\n/g, "").length;

  if (!fullText) {
    return "";
  }

  if (getVisibleLength(fullText) >= minChars && getVisibleLength(fullText) <= maxChars) {
    return paragraphs.join("\n\n");
  }

  if (getVisibleLength(fullText) < minChars) {
    const fillers = [
      "也讓你更快看懂這款產品適不適合自己。",
      "整體資訊會更集中，讀起來也更沒有負擔。",
      "讀完後會更容易判斷是否值得進一步了解。"
    ];

    for (const filler of fillers) {
      if (getVisibleLength(fullText) >= minChars) {
        break;
      }
      if (getVisibleLength(`${fullText}${filler}`) > maxChars) {
        break;
      }
      fullText = `${fullText}\n\n${filler}`.trim();
    }
  }

  const expanded = getVisibleLength(fullText) > maxChars
    ? normalizeEmailBodyLength(fullText, maxChars)
    : fullText;

  return normalizeReadableParagraphs(expanded, 3).join("\n\n");
}

function normalizeReadableParagraphs(textOrParagraphs, maxParagraphs = 3) {
  const rawItems = Array.isArray(textOrParagraphs)
    ? textOrParagraphs
    : String(textOrParagraphs || "").split(/\n{2,}/);

  const sentences = rawItems
    .flatMap((item) => String(item || "").split(/(?<=[。！？.!?])\s+/u))
    .map((item) => cleanText(item))
    .filter(Boolean);

  if (!sentences.length) {
    return [];
  }

  const paragraphs = [];
  for (const sentence of sentences) {
    if (!paragraphs.length) {
      paragraphs.push(sentence);
      continue;
    }

    if (paragraphs.length < maxParagraphs) {
      paragraphs.push(sentence);
      continue;
    }

    paragraphs[paragraphs.length - 1] = `${paragraphs[paragraphs.length - 1]} ${sentence}`.trim();
  }

  return paragraphs;
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
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return [bodyWithoutUrl, normalizedUrl].filter(Boolean).join("\n\n");
}

function appendCtaAndUrlToEmailBody(body, cta, url) {
  const normalizedBody = String(body || "").trim().replace(/\r/g, "").replace(/\n{3,}/g, "\n\n");
  const normalizedCta = cleanText(cta);
  const normalizedUrl = isValidUrl(url) ? String(url).trim() : "";
  const bodyWithoutUrl = normalizedBody
    .replace(/https?:\/\/[^\s)\]]+/gi, "")
    .replace(/([。！？.!?])\s*[，、:：]+\s*/g, "$1 ")
    .replace(/\s+[，、:：]\s+/g, " ")
    .replace(/[：:]\s*$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const bodyWithoutCta = normalizedCta
    ? bodyWithoutUrl.replace(new RegExp(escapeRegExp(normalizedCta), "g"), "").replace(/\n{3,}/g, "\n\n").trim()
    : bodyWithoutUrl;
  const cleanedBody = bodyWithoutCta
    .replace(/[^\n。！？.!?]{0,12}…$/u, "")
    .replace(/[，、；：,:-]+$/u, "")
    .trim();

  return [cleanedBody, normalizedCta, normalizedUrl].filter(Boolean).join("\n\n");
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

function getStylePresetMeta(value) {
  const normalized = normalizeStylePreset(value);
  if (normalized === RANDOM_STYLE_PRESET_KEY) {
    return RANDOM_STYLE_PRESET_META;
  }

  return STYLE_PRESETS[normalized] || RANDOM_STYLE_PRESET_META;
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

function getVoiceBalanceInputLabel(voiceBalance) {
  const level = normalizeVoiceBalance(voiceBalance);
  const labelMap = {
    1: "感性很多",
    2: "偏感性",
    3: "平衡",
    4: "偏理性",
    5: "理性很多"
  };

  return `Level ${level}（${labelMap[level] || "平衡"}）`;
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

function normalizeTraditionalChineseText(value) {
  let result = String(value || "");
  for (const [simplified, traditional] of SIMPLIFIED_TO_TRADITIONAL_REPLACEMENTS) {
    result = result.split(simplified).join(traditional);
  }

  return result;
}

function stripSourceScaffoldingPhrases(value) {
  return normalizeTraditionalChineseText(
    String(value || "")
      .replace(/^(?:銷售頁面?|產品頁面?|頁面|圖片)(?:明確)?(?:顯示|標示|提到|指出|寫到|列出|整理出)\s*/g, "")
      .replace(/^(?:條列優點|圖片優點|商品描述|頁面主題|頁面截圖|組合選項|規格\/使用線索)(?:包含|為|是)\s*/g, "")
      .replace(/^heading\s*(?:聚焦在|為)?\s*/gi, "")
      .replace(/^[:：、，\-\s]+/g, "")
      .trim()
  );
}

function stripReportLikePhrases(value) {
  return normalizeTraditionalChineseText(
    String(value || "")
      .replace(/製程數據透明且嚴格[:：]\s*/g, "")
      .replace(/核心價值在於/g, "")
      .replace(/以事實支撐品質[，、,\s]*用數據定義標準[。．]*/g, "")
      .replace(/這是一碗回歸食材本質[、，,\s]*符合高規格無添加要求的純粹濃湯[。．]*/g, "這碗濃湯回到食材本身的單純。")
      .replace(/完全拒絕/g, "不使用")
      .replace(/真實可溯的天然風味/g, "天然風味")
      .replace(/^[:：、，\-\s]+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

function sanitizeSourceScaffoldingFromOutput(output) {
  if (!output || typeof output !== "object") {
    return output;
  }

  return {
    ...output,
    title: stripReportLikePhrases(stripSourceScaffoldingPhrases(output.title)),
    body: normalizeTraditionalChineseText(
      String(output.body || "")
        .split(/\n+/)
        .map((line) => stripReportLikePhrases(stripSourceScaffoldingPhrases(line)))
        .filter(Boolean)
        .join("\n")
        .trim()
    ),
    description: stripReportLikePhrases(stripSourceScaffoldingPhrases(output.description)),
    cta: stripReportLikePhrases(stripSourceScaffoldingPhrases(output.cta))
  };
}

function normalizeTraditionalChineseOutput(output) {
  if (!output || typeof output !== "object") {
    return output;
  }

  return {
    ...output,
    title: normalizeTraditionalChineseText(output.title),
    body: normalizeTraditionalChineseText(output.body),
    description: normalizeTraditionalChineseText(output.description),
    cta: normalizeTraditionalChineseText(output.cta)
  };
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
    return normalizeExternalUrl(new URL(value, baseUrl).toString());
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

function normalizeExternalUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  let candidate = raw;
  if (candidate.startsWith("//")) {
    candidate = `https:${candidate}`;
  } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/g, "")}`;
  }

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    parsed.protocol = "https:";
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";

    if (parsed.port && parsed.port !== "443") {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

function resolveSafeOutputUrl(candidate, fallbackValue = "") {
  const normalizedCandidate = normalizeExternalUrl(candidate);
  if (normalizedCandidate && isAllowedPublicUrl(normalizedCandidate)) {
    return normalizedCandidate;
  }

  const normalizedFallback = normalizeExternalUrl(fallbackValue);
  if (normalizedFallback && isAllowedPublicUrl(normalizedFallback)) {
    return normalizedFallback;
  }

  return "";
}

function isAllowedPublicUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "https:") {
      return false;
    }

    if (parsed.port && parsed.port !== "443") {
      return false;
    }

    return !isBlockedHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function isBlockedHostname(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "metadata.google.internal"
  ) {
    return true;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    const [a = 0, b = 0] = normalized.split(".").map((item) => Number(item));
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (normalized.includes(":")) {
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.") ||
      normalized.startsWith("::ffff:172.")
    );
  }

  return false;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (require.main === module) {
  app.listen(BRIDGE_PORT, "0.0.0.0", () => {
    console.log(`beck-copy-engine listening on ${BRIDGE_PORT}`);
  });
}

module.exports = {
  app,
  buildColoringPrompt,
  cleanHostHeader,
  createColoringSession,
  consumeColoringQuota,
  consumeColoringIpLimit,
  createColoringJob,
  createColoringJobTokenHash,
  createMockColoringCard,
  ensureDeviceCookie,
  detectTaiwanComplianceViolations,
  formatEmailOutput,
  formatGoogleAdsOutput,
  formatMetaAdOutput,
  formatPrimaryOutput,
  getAllowedRequestOrigin,
  getColoringRequestSuspicionScore,
  getRequestIp,
  hasAuthorizedBridgeAccess,
  hasReachedActiveColoringJobLimit,
  extractColoringCostUsd,
  isAllowedPublicUrl,
  isExplicitlyAllowedOrigin,
  isLoopbackHost,
  getTrustedDeviceIdFromRequest,
  normalizeTraditionalChineseText,
  normalizeExternalUrl,
  normalizeReusableMasterDraft,
  normalizeColoringInput,
  parseImageDataUrl,
  parseChannelCopyOutput,
  parseMasterDraftOutput,
  parsePrimaryBundleOutput,
  resolveStylePresetKey,
  resolveSafeOutputUrl,
  runColoringJob,
  sanitizeChannelOutputForCompliance,
  sanitizeMasterDraftForCompliance,
  serializeColoringJob,
  stripReportLikePhrases,
  stripSourceScaffoldingPhrases,
  summarizePageSignals,
  validateColoringRequest,
  verifyColoringJobAccess,
  verifyColoringSessionToken,
  validateColoringInput
};
