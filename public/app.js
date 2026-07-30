const APP_VERSION = "2026-07-29-copy-layout-v2";
const STORAGE_KEY = `lihi-copy-last-run:${APP_VERSION}`;
const appConfig = window.APP_CONFIG || {};
const GENERATE_COPY_TIMEOUT_MS = 120000;
const FORMAT_COPY_TIMEOUT_MS = 45000;
const DOMAIN_PRESET_BASES = {
  "copy.bktsai.link": "https://copy.bktsai.link",
  "lihi.io": "https://lihi.io",
  "howlihi.com": "https://howlihi.com",
  custom: ""
};
const VOICE_BALANCE_PRESETS = {
  "1": "偏感性很多：先放大共鳴、畫面、情緒與留白，產品要輕輕帶到。",
  "2": "偏感性：保留情境感與生活畫面，但仍要讓產品價值看得懂。",
  "3": "平衡：兼顧情境畫面與清楚價值。",
  "4": "偏理性：先把價值與重點講清楚，再留一點情緒與節奏。",
  "5": "偏理性很多：優先清楚、具體、好判斷，減少抒情與留白。"
};
const RANDOM_STYLE_PRESET_KEY = "random";
const STYLE_PRESETS = {
  home_healing: {
    label: "回家療癒版",
    note: "推開家門後那種終於可以好好吃一口、慢下來的溫暖感。",
    prompt: "回家療癒版：主打回家、放鬆、安定、被照顧的情緒，畫面要有溫度。"
  },
  sharing_moment: {
    label: "分享時刻版",
    note: "聚焦和家人、朋友一起吃、一起分享的氛圍。",
    prompt: "分享時刻版：把產品放進一起吃、一起聊、一起分享的場景，強調連結感。"
  },
  childhood_memory: {
    label: "童年回憶版",
    note: "走熟悉味道、記憶感、阿嬤媽媽餐桌那種親近感。",
    prompt: "童年回憶版：帶出熟悉味道、從小記憶、家常安心感，但不要俗套。"
  },
  premium_brand: {
    label: "高級品牌版",
    note: "語氣更克制、有質感，像在講一個值得信任的品牌。",
    prompt: "高級品牌版：語氣克制、質感、乾淨，不喊賣點，用品味與信任感建立價值。"
  },
  founder_story: {
    label: "創辦人故事版",
    note: "適合帶出為什麼做這個產品、背後堅持與初衷。",
    prompt: "創辦人故事版：適度加入品牌初衷、堅持或做這件事的理由，讓產品更有人味。"
  },
  social_proof: {
    label: "社群口碑版",
    note: "更像大家真的會轉貼、推薦、說這個不錯的社群語感。",
    prompt: "社群口碑版：語氣自然、有討論感，像使用者願意主動分享與推薦。"
  },
  scenario_solution: {
    label: "場景解決方案版",
    note: "把產品對應到具體生活情境，讓人立刻知道什麼時候會需要。",
    prompt: "場景解決方案版：優先寫明什麼情境下會需要它、它如何幫你解決當下問題。"
  },
  rational_comparison: {
    label: "理性對比版",
    note: "更適合強調差異、選擇理由、判斷依據與重點整理。",
    prompt: "理性對比版：清楚說明差異、優勢、選擇理由，偏理性、可判斷。"
  },
  gift_recommendation: {
    label: "送禮推薦版",
    note: "把產品包裝成送家人、送長輩、送客戶都體面的選擇。",
    prompt: "送禮推薦版：強調體面、心意、好送、不失禮，讓人容易聯想到送禮情境。"
  },
  urgency_conversion: {
    label: "限時轉單版",
    note: "更直接、更促動行動，適合活動、限時、快速決策。",
    prompt: "限時轉單版：節奏更快、行動更明確，優先降低猶豫、推進下單。"
  }
};
const RANDOM_STYLE_PRESET_META = {
  label: "隨機",
  note: "每次按下產出時，系統都會從 10 種風格裡隨機挑 1 種。",
  prompt: "隨機：送出時從既有風格版本中隨機選 1 種。"
};

const TAB_LABELS = {
  primary: { title: "標題", body: "主文", description: "", cta: "CTA", url: "連結" },
  meta_ad: { title: "Headline", body: "Primary text", description: "Description", cta: "CTA", url: "連結" },
  google_ads: { title: "Headline", body: "Description", description: "Display path 1", cta: "Display path 2", url: "Final URL" },
  sms: { title: "開頭", body: "訊息內容", description: "", cta: "行動句", url: "連結" },
  line: { title: "開頭", body: "LINE 內文", description: "", cta: "行動句", url: "連結" },
  email: { title: "Email 主旨", body: "Email 內文", description: "Preview text", cta: "", url: "" }
};

const form = document.querySelector("#copy-form");
const statusEl = document.querySelector("#form-status");
const submitButton = document.querySelector("#submit-button");
const refreshPromptButton = document.querySelector("#refresh-prompt-button");
const promptPreview = document.querySelector("#prompt-preview");
const modeBadge = document.querySelector("#mode-badge");
const resultCard = document.querySelector("#result-card");

const resultTitle = document.querySelector("#result-title");
const resultBody = document.querySelector("#result-body");
const resultDescription = document.querySelector("#result-description");
const resultCta = document.querySelector("#result-cta");
const resultUrl = document.querySelector("#result-url");
const resultTitleLabel = document.querySelector("#result-title-label");
const resultBodyLabel = document.querySelector("#result-body-label");
const resultDescriptionLabel = document.querySelector("#result-description-label");
const resultCtaLabel = document.querySelector("#result-cta-label");
const resultUrlLabel = document.querySelector("#result-url-label");
const resultDescriptionBlock = document.querySelector("#result-description-block");
const resultGoogleAdsBlock = document.querySelector("#result-google-ads-block");
const resultGoogleAdsGroups = document.querySelector("#result-google-ads-groups");
const resultRow = document.querySelector(".result-row");
const resultCtaBlock = document.querySelector(".result-block-cta");
const resultUrlBlock = document.querySelector(".result-block-url");
const resultSmsBlock = document.querySelector("#result-sms-block");
const resultCompactLabel = document.querySelector("#result-compact-label");
const resultSmsTitle = document.querySelector("#result-sms-title");
const resultSmsBody = document.querySelector("#result-sms-body");
const resultSmsCta = document.querySelector("#result-sms-cta");
const resultSmsUrl = document.querySelector("#result-sms-url");
const copyTitleButton = document.querySelector("#copy-title-button");
const copyBodyButton = document.querySelector("#copy-body-button");
const copyDescriptionButton = document.querySelector("#copy-description-button");
const copyCtaButton = document.querySelector("#copy-cta-button");
const copyUrlButton = document.querySelector("#copy-url-button");
const copySmsButton = document.querySelector("#copy-sms-button");
const resultCopyButtons = [
  copyTitleButton,
  copyBodyButton,
  copyDescriptionButton,
  copyCtaButton,
  copyUrlButton,
  copySmsButton
].filter(Boolean);
const resultTabButtons = Array.from(document.querySelectorAll("[data-tab]"));

const analysisCard = document.querySelector("#analysis-card");
const analysisSummary = document.querySelector("#analysis-summary");
const analysisMeta = document.querySelector("#analysis-meta");
const analysisPrices = document.querySelector("#analysis-prices");
const analysisOcr = document.querySelector("#analysis-ocr");
const voiceBalanceInput = document.querySelector("#voiceBalance");
const voiceBalanceNote = document.querySelector("#voice-balance-note");
const stylePresetInput = document.querySelector("#stylePreset");
const stylePresetNote = document.querySelector("#style-preset-note");
const domainPresetInput = document.querySelector("#domainPreset");
const productUrlInput = document.querySelector("#productUrl");
const toggleUrlSettingsButton = document.querySelector("#toggle-url-settings");
const urlSettingsPanel = document.querySelector("#url-settings-panel");

const errorEls = {
  productName: document.querySelector('[data-error-for="productName"]'),
  benefits: document.querySelector('[data-error-for="benefits"]'),
  productUrl: document.querySelector('[data-error-for="productUrl"]'),
  stylePreset: document.querySelector('[data-error-for="stylePreset"]'),
  tone: document.querySelector('[data-error-for="tone"]')
};

let promptRenderTimer = null;
let activeTab = "primary";
let currentRun = null;
let copyFeedbackTimer = null;
let activeCopyFeedbackButton = null;

function getFormData() {
  if (!form) {
    return null;
  }

  const formData = new FormData(form);
  const benefits = formData
    .getAll("benefit")
    .map((item) => String(item).trim())
    .filter(Boolean);

  return {
    productName: String(formData.get("productName") || "").trim(),
    benefits,
    extraContext: String(formData.get("extraContext") || "").trim(),
    stylePreset: normalizeStylePreset(formData.get("stylePreset")),
    domainPreset: normalizeDomainPreset(formData.get("domainPreset")),
    productUrl: normalizeProductUrl(formData.get("productUrl"), formData.get("domainPreset")),
    tone: String(formData.get("tone") || "").trim(),
    voiceBalance: normalizeVoiceBalance(formData.get("voiceBalance")),
    complianceMode: normalizeComplianceMode(formData.get("complianceMode"))
  };
}

function normalizeDomainPreset(value) {
  const normalized = String(value || "").trim();
  return Object.hasOwn(DOMAIN_PRESET_BASES, normalized) ? normalized : "copy.bktsai.link";
}

function normalizeStylePreset(value) {
  const normalized = String(value || "").trim();
  return normalized === RANDOM_STYLE_PRESET_KEY || Object.hasOwn(STYLE_PRESETS, normalized) ? normalized : RANDOM_STYLE_PRESET_KEY;
}

function getStylePresetMeta(value) {
  const normalized = normalizeStylePreset(value);
  if (normalized === RANDOM_STYLE_PRESET_KEY) {
    return RANDOM_STYLE_PRESET_META;
  }

  return STYLE_PRESETS[normalized] || RANDOM_STYLE_PRESET_META;
}

function getDomainPresetBase(value) {
  return DOMAIN_PRESET_BASES[normalizeDomainPreset(value)] || "";
}

function looksLikeHostnamePath(value) {
  const raw = String(value || "").trim();
  // 如果已經是完整網址（有 http:// 或 https://），直接回傳 true
  if (/^https?:\/\//i.test(raw)) {
    return true;
  }
  // 如果是 hostname + path 格式（例如 example.com/product），也回傳 true
  return /^[^/\s]+\.[^/\s]+(?:[/:?#]|$)/.test(raw);
}

function joinBaseAndPath(base, value) {
  const normalizedBase = String(base || "").replace(/\/+$/g, "");
  const raw = String(value || "").trim();

  if (!normalizedBase) {
    return raw;
  }

  if (!raw) {
    return `${normalizedBase}/`;
  }

  return `${normalizedBase}/${raw.replace(/^\/+/g, "")}`;
}

function normalizeProductUrl(value, domainPreset) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  let candidate = raw;
  if (looksLikeHostnamePath(raw)) {
    candidate = raw;
  } else {
    const presetBase = getDomainPresetBase(domainPreset);
    if (presetBase) {
      candidate = joinBaseAndPath(presetBase, raw);
    }
  }

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
    return parsed.toString();
  } catch {
    return "";
  }
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

  return String(value || "").toLowerCase() === "on" || String(value || "").toLowerCase() === "true";
}

function validate(data) {
  const errors = {};

  if (!data?.productName || data.productName.length > 80) {
    errors.productName = "產品名稱必填，且需在 80 字內。";
  }

  if (!Array.isArray(data?.benefits) || data.benefits.length < 3 || data.benefits.length > 4) {
    errors.benefits = "請提供 3 到 4 個產品優點。";
  } else if (data.benefits.some((item) => item.length > 60)) {
    errors.benefits = "每個優點需在 60 字內。";
  }

  const normalizedUrl = normalizeProductUrl(data?.productUrl || "", data?.domainPreset);
  if (!normalizedUrl) {
    errors.productUrl = "請輸入公開網域或網址，系統會自動補上 https://。";
  } else if (normalizedUrl.length > 300) {
    errors.productUrl = "網址需在 300 字內。";
  } else if (!isAllowedPublicUrl(normalizedUrl)) {
    errors.productUrl = "網址不可使用 localhost、內網 IP 或自訂 port。";
  }

  if (!["brand", "conversion"].includes(data?.tone || "")) {
    errors.tone = "請選擇文案風格。";
  }

  if (!(data?.stylePreset === RANDOM_STYLE_PRESET_KEY || Object.hasOwn(STYLE_PRESETS, data?.stylePreset || ""))) {
    errors.stylePreset = "請選擇一個風格版本。";
  }

  if (data?.extraContext && data.extraContext.length > 600) {
    errors.benefits = "其他想補充的內容需在 600 字內。";
  }

  return errors;
}

function renderErrors(errors) {
  Object.entries(errorEls).forEach(([key, el]) => {
    if (el) {
      el.textContent = errors[key] || "";
    }
  });
}

function isAllowedPublicUrl(value) {
  try {
    const parsed = new URL(value);
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
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }

  return false;
}

function toSafeDisplayUrl(value) {
  const normalized = normalizeProductUrl(value, "custom");
  return isAllowedPublicUrl(normalized) ? normalized : "";
}

function setSafeLink(anchor, value) {
  if (!anchor) {
    return;
  }

  const safeUrl = toSafeDisplayUrl(value);
  anchor.textContent = safeUrl || "-";
  anchor.href = safeUrl || "#";
}

function getApiErrorMessage(result, fallbackMessage) {
  if (Array.isArray(result?.errors) && result.errors.length) {
    return result.errors[0];
  }

  if (typeof result?.message === "string" && result.message.trim()) {
    return result.message.trim();
  }

  if (typeof result?.error === "string" && result.error.trim()) {
    return result.error.trim();
  }

  return fallbackMessage;
}

function getPrimaryStatusMessage(result) {
  const isLive = result.mode === "live" || result.mode === "openclaw";
  const mismatch = result.pageAnalysis?.inputMismatch;

  if (mismatch?.isSuspicious) {
    return "文案已完成，但產品名稱和頁面資訊差異較大，請先確認網址和商品是否一致。";
  }

  return isLive ? "已完成主要文案。點擊右側 tab 可產出渠道版本。" : "目前為 mock 模式，已先完成主要文案。";
}

function getTonePromptText(tone) {
  switch (tone) {
    case "conversion":
      return "轉單型：先抓痛點與差異，句子更短、更直接，優先推最能促成下單的 1 到 2 個重點。";
    case "brand":
    default:
      return "品牌型：語氣有質感、可信、好讀，強調品牌印象、產品價值與使用情境。";
  }
}

function getVoiceBalancePromptText(voiceBalance) {
  return VOICE_BALANCE_PRESETS[String(normalizeVoiceBalance(voiceBalance))] || VOICE_BALANCE_PRESETS["3"];
}

function updateStylePresetNote(value) {
  if (!stylePresetNote) {
    return;
  }

  stylePresetNote.textContent = getStylePresetMeta(value).note;
}

function buildPrompt(data) {
  if (!data) {
    return "目前沒有可用的 prompt。";
  }

  const benefitLines = data.benefits.map((item, index) => `${index + 1}. ${item}`).join("\n");

  return `你是「Beck Copy Engine」，核心不是私人記憶，而是可產品化的 Beck 文案方法論。

任務：
根據使用者提供的產品資訊與銷售頁可驗證內容，先產出一篇基礎文案，再依需求轉成不同渠道格式。

輸入資料：
- 產品名稱：${data.productName || "{{product_name}}"}
- 產品優點：
${benefitLines || "1. {{benefit_1}}\n2. {{benefit_2}}\n3. {{benefit_3}}"}
- 其他想補充的內容：${data.extraContext || "無"}
- 風格版本：${getStylePresetMeta(data.stylePreset).label}
- 導流網域：${getDomainPresetBase(data.domainPreset) || "用自訂網域"}
- 產品頁連結：${data.productUrl || "{{product_url}}"}
- 文案風格：${data.tone || "{{tone}}"}
- 感性 / 理性強度：${normalizeVoiceBalance(data.voiceBalance)}
- 台灣食品廣告合規模式：${data.complianceMode ? "開啟" : "關閉"}

風格規則：
- ${getStylePresetMeta(data.stylePreset).prompt}
- ${getTonePromptText(data.tone)}
- ${getVoiceBalancePromptText(data.voiceBalance)}

生成規則：
1. 先整理成結構化母稿，再產出一篇完整、可直接閱讀的基礎文案。
2. 必須結合使用者提供的產品名稱、產品優點與產品頁資訊。
3. 不要輸出多個版本，不要輸出分析、備註、前言、後記。
4. 不要捏造未提供的具體數字、成效、保證。
 5. 廣告文案內不要提及任何價格、售價、原價、折扣、優惠價或金額。
 6. ${data.complianceMode ? "避免高風險與禁用詞，優先用中性、清楚、較不易誤解的食品廣告寫法。" : "若有法規需求，可開啟台灣食品廣告合規模式。"} `;
}

function buildMockPrimaryCopy(data) {
  const [primary, secondary, tertiary] = data.benefits;
  const voiceBalance = normalizeVoiceBalance(data.voiceBalance);

  if (data.complianceMode) {
    return {
      title: `${data.productName}，把產品重點說清楚`,
      body: `${data.productName} 會先根據產品頁與你提供的優點，整理成較中性、較不易誤解的廣告文案。\n\n重點會放在產品資訊、使用情境與閱讀清楚度，不碰高風險或禁用詞。`,
      cta: "立即了解更多",
      url: data.productUrl,
      labels: TAB_LABELS.primary
    };
  }

  if (data.tone === "conversion") {
    return {
      title: `${data.productName}，把 ${primary} 直接說清楚`,
      body:
        voiceBalance <= 2
          ? `有些東西不是沒需要，只是一直沒有被好好說清楚。${data.productName} 把 ${primary}、${secondary}、${tertiary} 放到前面，讓人比較容易走到下一步。`
          : `如果你在找一個更好下決定的選擇，${data.productName}會先把 ${primary}、${secondary}、${tertiary} 放到最前面。\n\n少一點猶豫，多一點直接行動。`,
      cta: "立即查看商品頁",
      url: data.productUrl,
      labels: TAB_LABELS.primary
    };
  }

  return {
    title: `${data.productName}，把 ${primary} 說得更有感`,
    body:
      voiceBalance <= 2
        ? `有時候不是特別需要什麼大道理，只是想找到一個比較貼近自己的選擇。${data.productName} 把 ${primary}、${secondary} 和 ${tertiary} 整理成更容易被感受到的產品價值。`
        : `${data.productName} 把 ${primary}、${secondary} 和 ${tertiary} 整理成更容易被理解的產品價值。\n\n讓人一看就知道這個產品為什麼值得被選。`,
    cta: "了解更多",
    url: data.productUrl,
    labels: TAB_LABELS.primary
  };
}

function updateVoiceBalanceNote(value) {
  if (!voiceBalanceNote) {
    return;
  }

  voiceBalanceNote.textContent = getVoiceBalancePromptText(value);
}

function syncDomainPresetIntoUrl() {
  if (!(productUrlInput instanceof HTMLInputElement) || !(domainPresetInput instanceof HTMLSelectElement)) {
    return;
  }

  const raw = productUrlInput.value.trim();
  const presetBase = getDomainPresetBase(domainPresetInput.value);

  if (!presetBase) {
    return;
  }

  if (!raw) {
    productUrlInput.value = `${presetBase}/`;
    return;
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !raw.startsWith("//") && !looksLikeHostnamePath(raw)) {
    productUrlInput.value = joinBaseAndPath(presetBase, raw);
  }
}

function setUrlSettingsOpen(isOpen) {
  // 空函式，不做任何事
}

function buildMockChannelCopy(tab, data, masterDraft) {
  if (tab === "sms") {
    if (data.complianceMode) {
      return {
        title: `${data.productName}重點`,
        body: "先看產品資訊與使用情境。",
        cta: "立即了解",
        url: data.productUrl,
        labels: TAB_LABELS.sms
      };
    }

    const smsCopy = fitSmsFieldsToLimit({
      title: masterDraft?.hook || `${data.productName}值得你看一眼`,
      body: `${data.productName}主打 ${data.benefits.slice(0, 2).join("、")}。現在就看看這次整理好的重點。`,
      cta: "立即查看"
    });

    return {
      title: smsCopy.title,
      body: smsCopy.body,
      cta: smsCopy.cta,
      url: data.productUrl,
      labels: TAB_LABELS.sms
    };
  }

  if (tab === "line") {
    if (data.complianceMode) {
      return {
        title: `${data.productName}重點`,
        body: "先把產品資訊整理清楚，再決定是否適合你。",
        cta: "點這裡看看",
        url: data.productUrl,
        labels: TAB_LABELS.line
      };
    }

    const lineCopy = fitCompactFieldsToLimit({
      title: masterDraft?.hook || `${data.productName}值得你看一眼`,
      body: `${data.productName}主打 ${data.benefits.slice(0, 2).join("、")}。現在就看看這次整理好的重點。`,
      cta: "點這裡看看"
    }, 80);

    return {
      title: lineCopy.title,
      body: lineCopy.body,
      cta: lineCopy.cta,
      url: data.productUrl,
      labels: TAB_LABELS.line
    };
  }

  if (tab === "email") {
    if (data.complianceMode) {
      const cta = "點開看看";
      return {
        title: truncateText(`${data.productName}產品資訊整理`, 28),
        body: [`${data.productName} 這次先聚焦在產品資訊與使用情境。`, `也把整理後的重點放在前面，讓你更容易快速判斷。`, cta, data.productUrl].join("\n\n"),
        description: truncateText("先看清楚產品重點", 36),
        cta,
        url: data.productUrl,
        labels: TAB_LABELS.email
      };
    }

    const cta = "點開看看";
    const detailLine = [data.benefits[0], data.benefits[1]].filter(Boolean).join("，");
    return {
      title: truncateText(masterDraft?.hook || `${data.productName}值得你打開看看`, 28),
      body: [truncateText(
        [
          masterDraft?.valueProp || data.benefits.slice(0, 2).join("、"),
          detailLine,
          data.benefits[2] || ""
        ]
          .filter(Boolean)
          .join("。"),
        170
      ), cta, data.productUrl]
        .filter(Boolean)
        .join("\n\n"),
      description: truncateText(data.benefits[0] || `${data.productName} 重點整理`, 36),
      cta,
      url: data.productUrl,
      labels: TAB_LABELS.email
    };
  }

  if (tab === "google_ads") {
    if (data.complianceMode) {
      const fallbackHeadlines = [
        truncateTextHard(`${data.productName}重點整理`, 30),
        truncateTextHard(`${data.productName}產品資訊`, 30),
        truncateTextHard(`${data.productName}使用情境`, 30)
      ];
      const fallbackDescriptions = [
        truncateTextHard("先看產品資訊與使用情境。", 90),
        truncateTextHard("把重點先整理好，再決定也可以。", 90),
        truncateTextHard("先快速看懂這款產品的核心重點。", 90)
      ];
      return {
        title: formatGoogleAdsVariantText(fallbackHeadlines),
        body: formatGoogleAdsVariantText(fallbackDescriptions),
        description: normalizeGoogleAdsPathSegment(data.productName),
        cta: normalizeGoogleAdsPathSegment("product-info"),
        url: data.productUrl,
        labels: TAB_LABELS.google_ads
      };
    }

    const headlineGroups = buildGoogleAdsHeadlineVariants(data, masterDraft);
    const descriptionGroups = buildGoogleAdsDescriptionVariants(data, masterDraft);
    return {
      title: formatGoogleAdsVariantText(headlineGroups),
      body: formatGoogleAdsVariantText(descriptionGroups),
      description: normalizeGoogleAdsPathSegment(data.benefits[0] || data.productName),
      cta: normalizeGoogleAdsPathSegment(data.benefits[1] || "product-highlights"),
      url: data.productUrl,
      labels: TAB_LABELS.google_ads
    };
  }

  const metaCta = "前往商品頁看看";
  if (data.complianceMode) {
    return {
      title: truncateText(`${data.productName}重點整理`, 12),
      body: appendUrlToMetaBody(normalizeMetaAdBodyLength([
        "先看產品資訊與使用情境。",
        "也把整理後的重點放在前面。"
      ]), data.productUrl),
      description: truncateText("先看產品資訊", 15),
      cta: metaCta,
      url: data.productUrl,
      labels: TAB_LABELS.meta_ad
    };
  }

  return {
    title: truncateText(masterDraft?.hook || `${data.productName}，先把重點說清楚`, 12),
    body: appendUrlToMetaBody(normalizeMetaAdBodyLength([
      `${masterDraft?.valueProp || data.benefits.slice(0, 2).join("、")}。`,
      data.benefits[0] ? `這次也會把 ${data.benefits.slice(0, 2).join("、")} 這幾個重點整理清楚。` : ""
    ].filter(Boolean)), data.productUrl),
    description: truncateText(data.benefits[0] || `${data.productName}重點整理`, 15),
    cta: metaCta,
    url: data.productUrl,
    labels: TAB_LABELS.meta_ad
  };
}

function renderPrompt(data) {
  if (!promptPreview) {
    return;
  }

  promptPreview.textContent = typeof data === "string" ? data : buildPrompt(data || getFormData());
}

function schedulePromptRender() {
  if (!form) {
    return;
  }

  window.clearTimeout(promptRenderTimer);
  promptRenderTimer = window.setTimeout(() => {
    renderPrompt(getFormData());
  }, 120);
}

function applyResultLabels(labels = TAB_LABELS.primary) {
  const currentLabels = labels || TAB_LABELS.primary;
  const channel = activeTab || "primary";
  const hasDescriptionBlock = channel === "meta_ad" || channel === "google_ads" || channel === "email";
  const showGoogleAdsGroups = channel === "google_ads";
  const isEmailTab = channel === "email";
  const isCompactTab = channel === "sms" || channel === "line";
  const showCtaBlock = !isCompactTab && channel !== "email" && channel !== "meta_ad";
  const showUrlBlock = !isCompactTab && channel !== "email";

  if (resultCard) {
    resultCard.dataset.channel = channel;
    resultCard.classList.toggle("is-compact-layout", isCompactTab);
  }

  if (resultTitleLabel) {
    resultTitleLabel.textContent = currentLabels.title || TAB_LABELS.primary.title;
  }
  if (resultBodyLabel) {
    resultBodyLabel.textContent = currentLabels.body || TAB_LABELS.primary.body;
  }
  if (resultDescriptionLabel) {
    resultDescriptionLabel.textContent = currentLabels.description || "Description";
  }
  if (resultCtaLabel) {
    resultCtaLabel.textContent = currentLabels.cta || TAB_LABELS.primary.cta;
  }
  if (resultUrlLabel) {
    resultUrlLabel.textContent = currentLabels.url || TAB_LABELS.primary.url;
  }

  if (resultDescriptionBlock) {
    resultDescriptionBlock.classList.toggle("is-hidden", !hasDescriptionBlock);
  }

  if (resultGoogleAdsBlock) {
    resultGoogleAdsBlock.classList.toggle("is-hidden", !showGoogleAdsGroups);
  }

  if (resultRow) {
    resultRow.classList.toggle("is-hidden", isCompactTab || (!showCtaBlock && !showUrlBlock));
  }

  if (resultCtaBlock) {
    resultCtaBlock.classList.toggle("is-hidden", !showCtaBlock);
  }

  if (resultUrlBlock) {
    resultUrlBlock.classList.toggle("is-hidden", !showUrlBlock);
  }

  if (resultSmsBlock) {
    resultSmsBlock.classList.toggle("is-hidden", !isCompactTab);
  }

  if (resultCompactLabel) {
    resultCompactLabel.textContent = channel === "line" ? "LINE" : "SMS";
  }
}

function setTabLoadingState(isLoading) {
  resultTabButtons.forEach((button) => {
    button.disabled = isLoading;
  });
}

function renderResult(output) {
  if (!resultTitle || !resultBody || !resultCta || !resultUrl || !resultCard) {
    return;
  }

  applyResultLabels(output?.labels || TAB_LABELS[activeTab] || TAB_LABELS.primary);
  const googleHeadlineVariants = activeTab === "google_ads" ? parseGoogleAdsVariantText(output?.title) : [];
  const googleDescriptionVariants = activeTab === "google_ads" ? parseGoogleAdsVariantText(output?.body) : [];
  setTextContent(resultTitle, output?.title || "尚未產出");
  renderBodyContent(output?.body || "尚未產出");
  if (resultDescription) {
    setTextContent(resultDescription, output?.description || (activeTab === "meta_ad" || activeTab === "google_ads" || activeTab === "email" ? "待補欄位" : "-"));
  }
  setTextContent(resultCta, output?.cta || "-");
  setSafeLink(resultUrl, output?.url || "");
  if (resultSmsTitle) {
    resultSmsTitle.textContent = output?.title || "尚未產出";
  }
  if (resultSmsBody) {
    resultSmsBody.textContent = output?.body || "尚未產出";
  }
  if (resultSmsCta) {
    resultSmsCta.textContent = output?.cta || "-";
  }
  if (resultSmsUrl) {
    setSafeLink(resultSmsUrl, output?.url || "");
  }
  renderGoogleAdsGroups(resultGoogleAdsGroups, googleHeadlineVariants, googleDescriptionVariants);
  const isGoogleAdsTab = activeTab === "google_ads";
  resultTitle.classList.toggle("is-hidden", isGoogleAdsTab);
  resultBody.classList.toggle("is-hidden", isGoogleAdsTab);
  resultCard.classList.toggle("empty", !output);
  resultBody.classList.toggle("placeholder", !output?.body);

  resultCopyButtons.forEach((button) => {
    button.disabled = !output;
  });

  if (copyTitleButton) {
    copyTitleButton.disabled = !output || isGoogleAdsTab;
  }

  if (copyBodyButton) {
    copyBodyButton.disabled = !output || isGoogleAdsTab;
  }

  updateCompactLabel(output);
}

function fitSmsFieldsToLimit(fields, maxChars = 70) {
  const normalized = {
    title: String(fields?.title || "").trim(),
    body: String(fields?.body || "").replace(/\r/g, "").replace(/\n+/g, " ").trim(),
    cta: String(fields?.cta || "").trim()
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

function renderEmptyResult(tab = "primary") {
  applyResultLabels(TAB_LABELS[tab] || TAB_LABELS.primary);
  if (resultTitle) {
    setTextContent(resultTitle, "尚未產出");
    resultTitle.classList.remove("is-hidden");
  }
  if (resultBody) {
    renderBodyContent(tab === "primary" ? "送出表單後，會在這裡顯示完整廣告文案。" : "點擊上方 tab 後，會在這裡顯示對應渠道版本。");
    resultBody.classList.add("placeholder");
    resultBody.classList.remove("is-hidden");
  }
  if (resultDescription) {
    setTextContent(resultDescription, "-");
  }
  if (resultCta) {
    setTextContent(resultCta, "-");
  }
  if (resultUrl) {
    resultUrl.textContent = "-";
    resultUrl.href = "#";
  }
  if (resultSmsTitle) {
    resultSmsTitle.textContent = "尚未產出";
  }
  if (resultSmsBody) {
    resultSmsBody.textContent = tab === "line" ? "點擊上方 tab 後，會在這裡顯示 LINE 文案。" : "點擊上方 tab 後，會在這裡顯示 SMS 文案。";
  }
  if (resultSmsCta) {
    resultSmsCta.textContent = "-";
  }
  if (resultSmsUrl) {
    resultSmsUrl.textContent = "-";
    resultSmsUrl.href = "#";
  }
  renderGoogleAdsGroups(resultGoogleAdsGroups, [], []);
  if (resultCard) {
    resultCard.classList.add("empty");
  }
  resultCopyButtons.forEach((button) => {
    button.disabled = true;
  });
  updateCompactLabel();
}

function renderLoadingResult(tab = "primary") {
  applyResultLabels(TAB_LABELS[tab] || TAB_LABELS.primary);

  if (resultTitle) {
    setTextContent(resultTitle, "文案產出中");
    resultTitle.classList.remove("is-hidden");
  }
  if (resultBody) {
    renderBodyContent(tab === "meta_ad" ? "正在整理 Meta 廣告欄位..." : tab === "google_ads" ? "正在整理 Google Ads 欄位..." : tab === "email" ? "正在整理 Email 欄位..." : tab === "line" ? "正在整理 LINE 欄位..." : "正在整理 SMS 欄位...");
    resultBody.classList.add("placeholder");
    resultBody.classList.remove("is-hidden");
  }
  if (resultDescription) {
    setTextContent(resultDescription, tab === "meta_ad" || tab === "google_ads" || tab === "email" ? "文案產出中" : "-");
  }
  if (resultCta) {
    setTextContent(resultCta, "文案產出中");
  }
  if (resultUrl) {
    resultUrl.textContent = "文案產出中";
    resultUrl.href = "#";
  }
  if (resultSmsTitle) {
    resultSmsTitle.textContent = "文案產出中";
  }
  if (resultSmsBody) {
    resultSmsBody.textContent = tab === "line" ? "正在整理 LINE 欄位..." : "正在整理 SMS 欄位...";
  }
  if (resultSmsCta) {
    resultSmsCta.textContent = "文案產出中";
  }
  if (resultSmsUrl) {
    resultSmsUrl.textContent = "文案產出中";
    resultSmsUrl.href = "#";
  }
  renderGoogleAdsGroups(resultGoogleAdsGroups, [], []);
  if (resultCard) {
    resultCard.classList.add("empty");
  }
  resultCopyButtons.forEach((button) => {
    button.disabled = true;
  });
  updateCompactLabel();
}

function setActiveTab(tab, options = {}) {
  const { render = true } = options;
  activeTab = tab;

  resultTabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  if (!render) {
    return;
  }

  const output = currentRun?.outputs?.[tab];
  if (output) {
    renderResult(output);
    return;
  }

  renderEmptyResult(tab);
}

function getChannelDisplayName(tab) {
  if (tab === "meta_ad") {
    return "Meta 廣告";
  }

  if (tab === "google_ads") {
    return "Google Ads";
  }

  if (tab === "email") {
    return "Email";
  }

  if (tab === "line") {
    return "LINE";
  }

  if (tab === "sms") {
    return "SMS";
  }

  return "主要文案";
}

function saveLastRun(payload) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...payload,
        savedAt: Date.now()
      })
    );
  } catch {}
}

function loadLastRun() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function hydrateFromLastRun() {
  const lastRun = loadLastRun();
  if (!lastRun) {
    if (promptPreview && !form) {
      promptPreview.textContent = "先回到主頁送出一次表單，這裡就會顯示最近一次的 prompt。";
    }
    return;
  }

  if (!form) {
    if (lastRun.outputs?.primary) {
      renderResult(lastRun.outputs.primary);
    }

    if (lastRun.pageAnalysis) {
      renderPageAnalysis(lastRun.pageAnalysis);
    }

    if (lastRun.prompt) {
      renderPrompt(lastRun.prompt);
    }
  }
}

function buildRunState(result, input) {
  return {
    input: {
      ...input,
      stylePreset: result.stylePreset || input.stylePreset
    },
    mode: result.mode,
    prompt: result.prompt,
    pageAnalysis: result.pageAnalysis,
    masterDraft: result.masterDraft,
    outputs: {
      primary: result.output
    }
  };
}

async function checkHealth() {
  if (!modeBadge) {
    return;
  }

  try {
    const response = await fetch(getApiUrl("health"));
    const data = await response.json();
    const isLive = new Set(["live", "openclaw"]).has(data.mode || data.endpointMode || "mock");

    modeBadge.classList.remove("chip-secondary", "chip-live", "chip-mock");
    modeBadge.textContent = isLive ? "已連文案引擎" : "Mock 模式";
    modeBadge.classList.add(isLive ? "chip-live" : "chip-mock");
  } catch {
    modeBadge.classList.remove("chip-secondary", "chip-live");
    modeBadge.textContent = "Static Demo";
    modeBadge.classList.add("chip-mock");
  }
}

function getApiUrl(path) {
  const base = appConfig.apiBaseUrl || "./api/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return new URL(path, new URL(normalizedBase, window.location.href)).toString();
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const result = await response.json();
    return { response, result };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("請求等待太久，已自動停止。");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const data = getFormData();
  const errors = validate(data);
  renderErrors(errors);
  renderPrompt(data);

  if (Object.keys(errors).length) {
    if (statusEl) {
      statusEl.textContent = "欄位還沒填完整，先修正後再送出。";
    }
    return;
  }

  currentRun = null;
  setActiveTab("primary");
  renderEmptyResult("primary");
  setTabLoadingState(true);

  if (form) {
    const productUrlInput = form.querySelector("#productUrl");
    if (productUrlInput instanceof HTMLInputElement) {
      productUrlInput.value = data.productUrl;
    }
  }

  if (submitButton) {
    submitButton.disabled = true;
  }
  if (statusEl) {
    statusEl.textContent = "文案生成中，正在整理頁面資訊與產品線索...";
  }

  try {
    const { response, result } = await fetchJsonWithTimeout(
      getApiUrl("generate-copy"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      },
      GENERATE_COPY_TIMEOUT_MS
    );

    if (!response.ok || !result.ok) {
      throw new Error(getApiErrorMessage(result, "產生文案時發生錯誤。"));
    }

    currentRun = buildRunState(result, data);
    renderResult(currentRun.outputs.primary);
    renderPageAnalysis(result.pageAnalysis);
    renderPrompt(result.prompt);
    saveLastRun(currentRun);

    if (statusEl) {
      statusEl.textContent = getPrimaryStatusMessage(result);
    }
  } catch (error) {
    const fallback = buildMockPrimaryCopy(data);
    currentRun = {
      input: data,
      mode: "mock",
      prompt: buildPrompt(data),
      pageAnalysis: null,
      masterDraft: {
        hook: fallback.title,
        valueProp: fallback.body,
        cta: fallback.cta,
        url: fallback.url
      },
      outputs: {
        primary: fallback
      }
    };

    renderResult(fallback);
    clearPageAnalysis();
    renderPrompt(currentRun.prompt);
    saveLastRun(currentRun);

    if (statusEl) {
      statusEl.textContent = error instanceof Error && error.message ? error.message : "目前沒有可用後端，已先用 mock 產出主要文案。";
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
    setTabLoadingState(false);
  }
}

async function handleTabClick(tab) {
  if (tab === activeTab && currentRun?.outputs?.[tab]) {
    return;
  }

  setActiveTab(tab, { render: false });

  if (!currentRun?.outputs?.primary) {
    renderEmptyResult(tab);
    if (statusEl) {
      statusEl.textContent = "請先產出主要文案。";
    }
    return;
  }

  if (tab === "primary") {
    renderResult(currentRun.outputs.primary);
    return;
  }

  if (currentRun.outputs[tab]) {
    renderResult(currentRun.outputs[tab]);
    return;
  }

  renderLoadingResult(tab);
  setTabLoadingState(true);

  if (statusEl) {
      statusEl.textContent = `正在產出 ${getChannelDisplayName(tab)} 文案...`;
  }

  try {
    const { response, result } = await fetchJsonWithTimeout(
      getApiUrl("format-copy"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: currentRun.input.productName,
          productUrl: currentRun.input.productUrl,
          stylePreset: currentRun.input.stylePreset,
          tone: currentRun.input.tone,
          voiceBalance: currentRun.input.voiceBalance,
          complianceMode: currentRun.input.complianceMode,
          channel: tab,
          masterDraft: currentRun.masterDraft
        })
      },
      FORMAT_COPY_TIMEOUT_MS
    );

    if (!response.ok || !result.ok) {
      throw new Error(getApiErrorMessage(result, "產出渠道文案時發生錯誤。"));
    }

    currentRun.outputs[tab] = result.output;
    renderResult(result.output);
    saveLastRun(currentRun);

    if (statusEl) {
      statusEl.textContent = `${getChannelDisplayName(tab)} 文案已完成。`;
    }
  } catch (error) {
    const fallback = buildMockChannelCopy(tab, currentRun.input, currentRun.masterDraft);
    currentRun.outputs[tab] = fallback;
    renderResult(fallback);
    saveLastRun(currentRun);

    if (statusEl) {
      statusEl.textContent = error instanceof Error && error.message ? error.message : `目前先用 fallback 產出 ${getChannelDisplayName(tab)} 文案。`;
    }
  } finally {
    setTabLoadingState(false);
  }
}

function showCopySuccess(button) {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  if (copyFeedbackTimer) {
    window.clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = null;
  }

  if (activeCopyFeedbackButton instanceof HTMLButtonElement) {
    activeCopyFeedbackButton.classList.remove("is-success");
    const activeIcon = activeCopyFeedbackButton.querySelector("span[aria-hidden='true']");
    if (activeIcon) {
      activeIcon.textContent = "⧉";
    }
  }

  resultCopyButtons.forEach((item) => {
    if (!(item instanceof HTMLButtonElement)) {
      return;
    }

    const icon = item.querySelector("span[aria-hidden='true']");
    item.classList.remove("is-success");
    if (icon) {
      icon.textContent = "⧉";
    }
  });

  button.classList.add("is-success");
  const icon = button.querySelector("span[aria-hidden='true']");
  if (icon) {
    icon.textContent = "✓";
  }
  activeCopyFeedbackButton = button;

  copyFeedbackTimer = window.setTimeout(() => {
    button.classList.remove("is-success");
    if (icon) {
      icon.textContent = "⧉";
    }
    if (activeCopyFeedbackButton === button) {
      activeCopyFeedbackButton = null;
    }
    copyFeedbackTimer = null;
  }, 1200);
}

async function copyText(value, successMessage, button) {
  if (!value) {
    return;
  }

  await navigator.clipboard.writeText(value);
  showCopySuccess(button);

  if (statusEl) {
    statusEl.textContent = successMessage;
  }
}

async function handleCopyField(field, button) {
  if (!resultTitle || !resultBody || !resultCta || !resultUrl) {
    return;
  }

  const copyMap = {
    title: {
      value: getCopyValue(resultTitle),
      message: `${resultTitleLabel?.textContent || "標題"}已複製到剪貼簿。`
    },
    body: {
      value: getCopyValue(resultBody),
      message: `${resultBodyLabel?.textContent || "主文"}已複製到剪貼簿。`
    },
    description: {
      value: getCopyValue(resultDescription),
      message: `${resultDescriptionLabel?.textContent || "Description"}已複製到剪貼簿。`
    },
    cta: {
      value: getCopyValue(resultCta),
      message: `${resultCtaLabel?.textContent || "CTA"}已複製到剪貼簿。`
    },
    url: {
      value: resultUrl.textContent,
      message: "連結已複製到剪貼簿。"
    },
    sms: {
      value: buildSmsCopyText(),
      message: `${activeTab === "line" ? "LINE" : "SMS"} 文案已複製到剪貼簿。`
    }
  };

  const target = copyMap[field];
  if (!target) {
    return;
  }

  await copyText(target.value, target.message, button);
}

function buildSmsCopyText() {
  const title = getCopyValue(resultSmsTitle);
  const body = getCopyValue(resultSmsBody);
  const cta = getCopyValue(resultSmsCta);
  const url = resultSmsUrl?.textContent || "";

  return [
    title,
    body,
    [cta, url].filter((value) => value && value !== "-").join("\n")
  ]
    .filter((value) => value && value !== "-")
    .join("\n\n");
}

function updateCompactLabel(output) {
  if (!resultCompactLabel) {
    return;
  }

  if (activeTab === "sms") {
    const totalChars = [
      output?.title || resultSmsTitle?.textContent || "",
      output?.body || resultSmsBody?.textContent || "",
      output?.cta || resultSmsCta?.textContent || "",
      output?.url || resultSmsUrl?.textContent || ""
    ]
      .filter((value) => value && value !== "-" && value !== "尚未產出" && value !== "文案產出中")
      .join("")
      .length;

    resultCompactLabel.textContent = totalChars > 0 ? `SMS｜${totalChars}字` : "SMS";
    return;
  }

  resultCompactLabel.textContent = activeTab === "line" ? "LINE" : "SMS";
}

function truncateTextHard(value, maxLength) {
  return Array.from(String(value || "").trim()).slice(0, maxLength).join("");
}

function fitCompactFieldsToLimit(fields, maxChars) {
  const normalized = {
    title: String(fields?.title || "").trim(),
    body: String(fields?.body || "").replace(/\r/g, "").replace(/\n+/g, " ").trim(),
    cta: String(fields?.cta || "").trim()
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

function appendCtaAndUrlToMetaBody(body, cta, url) {
  const normalizedBody = String(body || "").trim().replace(/\n{3,}/g, "\n\n");
  const normalizedCta = String(cta || "").trim();
  const normalizedUrl = String(url || "").trim();

  return [
    normalizedBody,
    [normalizedCta, normalizedUrl].filter(Boolean).join("\n")
  ]
    .filter(Boolean)
    .join("\n\n");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeGoogleAdsPathSegment(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/[/?#&=]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return truncateTextHard(normalized || "highlights", 15);
}

function buildGoogleAdsHeadlineVariants(data, masterDraft) {
  const candidates = [
    masterDraft?.hook,
    `${data.productName}${data.benefits[0] ? `｜${data.benefits[0]}` : ""}`,
    `${data.productName}${data.benefits[1] ? `｜${data.benefits[1]}` : ""}`,
    `${data.productName}值得先看`,
    `${data.benefits[0] || data.productName}先看`
  ]
    .map((item) => truncateTextHard(item, 30))
    .filter(Boolean);

  return collectUniqueItems(candidates).slice(0, 3);
}

function buildGoogleAdsDescriptionVariants(data, masterDraft) {
  const candidates = [
    `${masterDraft?.valueProp || data.benefits.slice(0, 2).join("、")}。`,
    `${data.benefits[0] ? `先看 ${data.benefits[0]}` : data.productName}，重點更清楚。`,
    `${data.benefits[1] ? `${data.benefits[1]} 也一起整理好。` : `${data.productName} 的重點已整理好。`}`,
    `${data.productName}的重點一次看懂。`
  ]
    .map((item) => truncateTextHard(item, 90))
    .filter(Boolean);

  return collectUniqueItems(candidates).slice(0, 3);
}

function formatGoogleAdsVariantText(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function normalizeMetaAdBodyLength(textOrParagraphs, minChars = 120, maxChars = 150) {
  const sentences = Array.isArray(textOrParagraphs)
    ? textOrParagraphs.map((item) => String(item || "").trim()).filter(Boolean)
    : String(textOrParagraphs || "")
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
  const compact = sentences.join("");

  if (!compact) {
    return "";
  }

  if (compact.length <= maxChars) {
    if (compact.length >= minChars || sentences.length === 1) {
      return sentences.join("\n\n");
    }

    const filler = ensureSentence("也把閱讀重點排得更清楚，讓你更快掌握這次真正該先看的內容");
    return normalizeMetaAdBodyLength([...sentences, filler], minChars, maxChars);
  }

  const trimmed = [];
  let used = 0;
  for (const sentence of sentences) {
    if (!sentence) {
      continue;
    }
    if (used + sentence.length <= maxChars) {
      trimmed.push(sentence);
      used += sentence.length;
      continue;
    }
    const remain = maxChars - used;
    if (remain > 0) {
      trimmed.push(truncateText(sentence, remain));
    }
    break;
  }

  return trimmed.join("\n\n");
}

function collectUniqueItems(items) {
  return Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));
}

function parseGoogleAdsVariantText(value) {
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

function renderGoogleAdsGroups(container, headlineItems, descriptionItems) {
  if (!container) {
    return;
  }

  const headlineBlocks = headlineItems.slice(0, 3).map((value, index) => ({
    label: `headline ${index + 1}`,
    value
  }));
  const descriptionBlocks = descriptionItems.slice(0, 3).map((value, index) => ({
    label: `description ${index + 1}`,
    value
  }));
  const blocks = [...headlineBlocks, ...descriptionBlocks];

  if (!blocks.length || activeTab !== "google_ads") {
    container.innerHTML = "";
    container.classList.add("is-hidden");
    return;
  }

  container.innerHTML = blocks.map(({ label, value }) => `
    <div class="variant-item google-ads-variant-item">
      <div class="result-head">
        <span class="variant-index">${escapeHtml(label)}</span>
        <button class="icon-copy-button" type="button" data-copy-variant="${encodeURIComponent(value)}" data-copy-label="${escapeHtml(label)}" aria-label="複製 ${escapeHtml(label)}" ${value ? "" : "disabled"}>
          <span aria-hidden="true">⧉</span>
        </button>
      </div>
      <p class="variant-value">${escapeHtml(value || "待補欄位")}</p>
    </div>
  `).join("");
  container.classList.remove("is-hidden");
}

function setTextContent(element, value) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  const text = String(value || "");
  element.textContent = text;
  element.dataset.copyValue = text;
}

function getCopyValue(element) {
  if (!(element instanceof HTMLElement)) {
    return "";
  }

  return element.dataset.copyValue || element.textContent || "";
}

function shouldUseParagraphBodyLayout() {
  return activeTab === "primary" || activeTab === "meta_ad" || activeTab === "email";
}

function renderBodyContent(value) {
  if (!(resultBody instanceof HTMLElement)) {
    return;
  }

  const text = String(value || "");
  resultBody.dataset.copyValue = text;

  if (!shouldUseParagraphBodyLayout()) {
    resultBody.textContent = text;
    return;
  }

  const paragraphs = text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    resultBody.textContent = text;
    return;
  }

  resultBody.innerHTML = paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPageAnalysis(pageAnalysis) {
  if (!analysisCard || !analysisSummary || !analysisMeta || !analysisPrices || !analysisOcr) {
    return;
  }

  if (!pageAnalysis) {
    clearPageAnalysis();
    return;
  }

  analysisCard.classList.remove("empty");
  analysisSummary.textContent = pageAnalysis.inputMismatch?.isSuspicious
    ? `${pageAnalysis.inputMismatch.reason}。${pageAnalysis.summary || ""}`.trim()
    : pageAnalysis.summary || "這次沒有抓到可用的頁面摘要。";
  analysisMeta.textContent = [pageAnalysis.title, pageAnalysis.metaDescription].filter(Boolean).join(" / ") || "這次沒有抓到頁面標題或描述。";
  analysisPrices.textContent = Array.isArray(pageAnalysis.priceSignals) && pageAnalysis.priceSignals.length ? pageAnalysis.priceSignals.join(" / ") : "這次沒有抓到明確的價格或組合訊號。";

  const visualLines = [];

  if (pageAnalysis.visualEvidence) {
    const groups = [
      ["圖片品名 / 關鍵字", pageAnalysis.visualEvidence.productTerms],
      ["圖片優點", pageAnalysis.visualEvidence.claims],
      ["圖片規格 / 使用線索", pageAnalysis.visualEvidence.specs],
      ["OCR 備援", pageAnalysis.visualEvidence.ocrFallback]
    ];

    for (const [label, items] of groups) {
      if (Array.isArray(items) && items.length) {
        visualLines.push(`${label}：${items.join(" / ")}`);
      }
    }
  }

  if (!visualLines.length && Array.isArray(pageAnalysis.visualSignals) && pageAnalysis.visualSignals.length) {
    visualLines.push(...pageAnalysis.visualSignals.map((item, index) => `${index + 1}. ${item}`));
  }

  analysisOcr.textContent = visualLines.length ? visualLines.join("\n") : "這次沒有抓到可用的圖片文字或視覺線索。";
}

function clearPageAnalysis() {
  if (!analysisCard || !analysisSummary || !analysisMeta || !analysisPrices || !analysisOcr) {
    return;
  }

  analysisCard.classList.add("empty");
  analysisSummary.textContent = "本次沒有分析資料";
  analysisMeta.textContent = "本次沒有分析資料";
  analysisPrices.textContent = "本次沒有分析資料";
  analysisOcr.textContent = "本次沒有分析資料";
}

if (form) {
  form.addEventListener("submit", handleSubmit);
  form.addEventListener("input", schedulePromptRender);
  renderPrompt(getFormData());
  setActiveTab("primary");
  renderEmptyResult("primary");
}

resultTabButtons.forEach((button) => {
  button.addEventListener("click", () => handleTabClick(button.dataset.tab));
});

copyTitleButton?.addEventListener("click", () => handleCopyField("title", copyTitleButton));
copyBodyButton?.addEventListener("click", () => handleCopyField("body", copyBodyButton));
copyDescriptionButton?.addEventListener("click", () => handleCopyField("description", copyDescriptionButton));
copyCtaButton?.addEventListener("click", () => handleCopyField("cta", copyCtaButton));
copyUrlButton?.addEventListener("click", () => handleCopyField("url", copyUrlButton));
copySmsButton?.addEventListener("click", () => handleCopyField("sms", copySmsButton));
resultGoogleAdsGroups?.addEventListener("click", async (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-copy-variant]") : null;
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  await copyText(decodeURIComponent(button.dataset.copyVariant || ""), `${button.dataset.copyLabel || "Google Ads 文案"}已複製到剪貼簿。`, button);
});

if (refreshPromptButton) {
  refreshPromptButton.addEventListener("click", () => {
    const lastRun = loadLastRun();
    if (lastRun?.prompt) {
      renderPrompt(lastRun.prompt);
      return;
    }
    renderPrompt(getFormData());
  });
}

voiceBalanceInput?.addEventListener("input", () => {
  updateVoiceBalanceNote(voiceBalanceInput.value);
  schedulePromptRender();
});

stylePresetInput?.addEventListener("change", () => {
  updateStylePresetNote(stylePresetInput.value);
  schedulePromptRender();
});

domainPresetInput?.addEventListener("change", () => {
  syncDomainPresetIntoUrl();
  schedulePromptRender();
});

toggleUrlSettingsButton?.addEventListener("click", () => {
  // 空按鈕，什麼都不做
});

updateVoiceBalanceNote(voiceBalanceInput?.value || 3);
updateStylePresetNote(stylePresetInput?.value || RANDOM_STYLE_PRESET_KEY);
setUrlSettingsOpen(false);

hydrateFromLastRun();
checkHealth();
