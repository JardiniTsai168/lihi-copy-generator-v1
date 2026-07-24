const APP_VERSION = "2026-07-24-domain-preset-v1";
const STORAGE_KEY = `lihi-copy-last-run:${APP_VERSION}`;
const appConfig = window.APP_CONFIG || {};
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
const resultTitleVariants = document.querySelector("#result-title-variants");
const resultBodyVariants = document.querySelector("#result-body-variants");
const resultDescription = document.querySelector("#result-description");
const resultCta = document.querySelector("#result-cta");
const resultUrl = document.querySelector("#result-url");
const resultTitleLabel = document.querySelector("#result-title-label");
const resultBodyLabel = document.querySelector("#result-body-label");
const resultDescriptionLabel = document.querySelector("#result-description-label");
const resultCtaLabel = document.querySelector("#result-cta-label");
const resultUrlLabel = document.querySelector("#result-url-label");
const resultDescriptionBlock = document.querySelector("#result-description-block");
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
const domainPresetInput = document.querySelector("#domainPreset");
const productUrlInput = document.querySelector("#productUrl");
const productUrlPreview = document.querySelector("#product-url-preview span");

const errorEls = {
  productName: document.querySelector('[data-error-for="productName"]'),
  benefits: document.querySelector('[data-error-for="benefits"]'),
  productUrl: document.querySelector('[data-error-for="productUrl"]'),
  tone: document.querySelector('[data-error-for="tone"]')
};

let promptRenderTimer = null;
let activeTab = "primary";
let currentRun = null;

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
    domainPreset: normalizeDomainPreset(formData.get("domainPreset")),
    productUrl: normalizeProductUrl(formData.get("productUrl"), formData.get("domainPreset")),
    tone: String(formData.get("tone") || "").trim(),
    voiceBalance: normalizeVoiceBalance(formData.get("voiceBalance"))
  };
}

function normalizeDomainPreset(value) {
  const normalized = String(value || "").trim();
  return Object.hasOwn(DOMAIN_PRESET_BASES, normalized) ? normalized : "copy.bktsai.link";
}

function getDomainPresetBase(value) {
  return DOMAIN_PRESET_BASES[normalizeDomainPreset(value)] || "";
}

function looksLikeHostnamePath(value) {
  return /^[^/\s]+\.[^/\s]+(?:[/:?#]|$)/.test(String(value || "").trim());
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

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }

  if (looksLikeHostnamePath(raw)) {
    return `https://${raw}`;
  }

  const presetBase = getDomainPresetBase(domainPreset);
  if (presetBase) {
    return joinBaseAndPath(presetBase, raw);
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

function validate(data) {
  const errors = {};

  if (!data?.productName || data.productName.length > 80) {
    errors.productName = "產品名稱必填，且需在 80 字內。";
  }

  if (!Array.isArray(data?.benefits) || data.benefits.length < 3 || data.benefits.length > 5) {
    errors.benefits = "請提供 3 到 5 個產品優點。";
  } else if (data.benefits.some((item) => item.length > 60)) {
    errors.benefits = "每個優點需在 60 字內。";
  }

  try {
    new URL(normalizeProductUrl(data?.productUrl || ""));
  } catch {
    errors.productUrl = "請輸入有效網址。";
  }

  if (!["brand", "conversion"].includes(data?.tone || "")) {
    errors.tone = "請選擇文案風格。";
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
- 導流網域：${getDomainPresetBase(data.domainPreset) || "自填完整網址"}
- 產品頁連結：${data.productUrl || "{{product_url}}"}
- 文案風格：${data.tone || "{{tone}}"}
- 感性 / 理性強度：${normalizeVoiceBalance(data.voiceBalance)}

風格規則：
- ${getTonePromptText(data.tone)}
- ${getVoiceBalancePromptText(data.voiceBalance)}

生成規則：
1. 先整理成結構化母稿，再產出一篇完整、可直接閱讀的基礎文案。
2. 必須結合使用者提供的產品名稱、產品優點與產品頁資訊。
3. 不要輸出多個版本，不要輸出分析、備註、前言、後記。
4. 不要捏造未提供的具體數字、成效、保證。
5. 廣告文案內不要提及任何價格、售價、原價、折扣、優惠價或金額。`;
}

function buildMockPrimaryCopy(data) {
  const [primary, secondary, tertiary] = data.benefits;
  const voiceBalance = normalizeVoiceBalance(data.voiceBalance);

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

function renderProductUrlPreview() {
  if (!productUrlPreview) {
    return;
  }

  const currentPreset = domainPresetInput?.value || "copy.bktsai.link";
  const currentValue = productUrlInput?.value || "";
  const normalizedUrl = normalizeProductUrl(currentValue, currentPreset);
  productUrlPreview.textContent = normalizedUrl || getDomainPresetBase(currentPreset) || "尚未設定";
}

function syncDomainPresetIntoUrl() {
  if (!(productUrlInput instanceof HTMLInputElement) || !(domainPresetInput instanceof HTMLSelectElement)) {
    return;
  }

  const raw = productUrlInput.value.trim();
  const presetBase = getDomainPresetBase(domainPresetInput.value);

  if (!presetBase) {
    renderProductUrlPreview();
    return;
  }

  if (!raw) {
    productUrlInput.value = `${presetBase}/`;
    renderProductUrlPreview();
    return;
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !raw.startsWith("//") && !looksLikeHostnamePath(raw)) {
    productUrlInput.value = joinBaseAndPath(presetBase, raw);
  }

  renderProductUrlPreview();
}

function buildMockChannelCopy(tab, data, masterDraft) {
  if (tab === "sms") {
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
    const cta = "點開看看";
    return {
      title: truncateText(masterDraft?.hook || `${data.productName}值得你打開看看`, 28),
      body: [truncateText(
        `${masterDraft?.valueProp || data.benefits.slice(0, 2).join("、")}。${data.benefits[0] ? `這次想先跟你分享 ${data.benefits[0]}，也順手把重點整理得更清楚。` : ""}`,
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
  return {
    title: truncateText(masterDraft?.hook || `${data.productName}，先把重點說清楚`, 12),
    body: appendCtaAndUrlToMetaBody(
      truncateText(`${masterDraft?.valueProp || data.benefits.slice(0, 2).join("、")}。\n\n重點優點：${data.benefits.slice(0, 2).join("、")}。`, 90),
      metaCta,
      data.productUrl
    ),
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
    if (button.dataset.tab === "primary") {
      button.disabled = false;
      return;
    }

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
  resultTitle.textContent = output?.title || "尚未產出";
  resultBody.textContent = output?.body || "尚未產出";
  if (resultDescription) {
    resultDescription.textContent = output?.description || (activeTab === "meta_ad" || activeTab === "google_ads" || activeTab === "email" ? "待補欄位" : "-");
  }
  resultCta.textContent = output?.cta || "-";
  resultUrl.textContent = output?.url || "-";
  resultUrl.href = output?.url || "#";
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
    resultSmsUrl.textContent = output?.url || "-";
    resultSmsUrl.href = output?.url || "#";
  }
  renderGoogleAdsVariants(resultTitleVariants, googleHeadlineVariants, "Headline");
  renderGoogleAdsVariants(resultBodyVariants, googleDescriptionVariants, "Description");
  resultTitle.classList.toggle("is-hidden", activeTab === "google_ads" && googleHeadlineVariants.length > 0);
  resultBody.classList.toggle("is-hidden", activeTab === "google_ads" && googleDescriptionVariants.length > 0);
  resultCard.classList.toggle("empty", !output);
  resultBody.classList.toggle("placeholder", !output?.body);

  resultCopyButtons.forEach((button) => {
    button.disabled = !output;
  });

  if (copyTitleButton) {
    copyTitleButton.disabled = !output || (activeTab === "google_ads" && googleHeadlineVariants.length > 0);
  }

  if (copyBodyButton) {
    copyBodyButton.disabled = !output || (activeTab === "google_ads" && googleDescriptionVariants.length > 0);
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
    resultTitle.textContent = "尚未產出";
    resultTitle.classList.remove("is-hidden");
  }
  if (resultBody) {
    resultBody.textContent = tab === "primary" ? "送出表單後，會在這裡顯示完整廣告文案。" : "點擊上方 tab 後，會在這裡顯示對應渠道版本。";
    resultBody.classList.add("placeholder");
    resultBody.classList.remove("is-hidden");
  }
  if (resultDescription) {
    resultDescription.textContent = "-";
  }
  if (resultCta) {
    resultCta.textContent = "-";
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
  renderGoogleAdsVariants(resultTitleVariants, [], "Headline");
  renderGoogleAdsVariants(resultBodyVariants, [], "Description");
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
    resultTitle.textContent = "文案產出中";
    resultTitle.classList.remove("is-hidden");
  }
  if (resultBody) {
    resultBody.textContent = tab === "meta_ad" ? "正在整理 Meta 廣告欄位..." : tab === "google_ads" ? "正在整理 Google Ads 欄位..." : tab === "email" ? "正在整理 Email 欄位..." : tab === "line" ? "正在整理 LINE 欄位..." : "正在整理 SMS 欄位...";
    resultBody.classList.add("placeholder");
    resultBody.classList.remove("is-hidden");
  }
  if (resultDescription) {
    resultDescription.textContent = tab === "meta_ad" || tab === "google_ads" || tab === "email" ? "文案產出中" : "-";
  }
  if (resultCta) {
    resultCta.textContent = "文案產出中";
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
  renderGoogleAdsVariants(resultTitleVariants, [], "Headline");
  renderGoogleAdsVariants(resultBodyVariants, [], "Description");
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
    input,
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
    const response = await fetch(getApiUrl("generate-copy"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "產生文案時發生錯誤。");
    }

    currentRun = buildRunState(result, data);
    renderResult(currentRun.outputs.primary);
    renderPageAnalysis(result.pageAnalysis);
    renderPrompt(result.prompt);
    saveLastRun(currentRun);

    if (statusEl) {
      statusEl.textContent = result.mode === "live" || result.mode === "openclaw" ? "已完成主要文案。點擊右側 tab 可產出渠道版本。" : "目前為 mock 模式，已先完成主要文案。";
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
      statusEl.textContent = "目前沒有可用後端，已先用 mock 產出主要文案。";
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
    const response = await fetch(getApiUrl("format-copy"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productName: currentRun.input.productName,
        productUrl: currentRun.input.productUrl,
        tone: currentRun.input.tone,
        voiceBalance: currentRun.input.voiceBalance,
        channel: tab,
        masterDraft: currentRun.masterDraft
      })
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "產出渠道文案時發生錯誤。");
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
      statusEl.textContent = `目前先用 fallback 產出 ${getChannelDisplayName(tab)} 文案。`;
    }
  } finally {
    setTabLoadingState(false);
  }
}

async function copyText(value, successMessage) {
  if (!value) {
    return;
  }

  await navigator.clipboard.writeText(value);

  if (statusEl) {
    statusEl.textContent = successMessage;
  }
}

async function handleCopyField(field) {
  if (!resultTitle || !resultBody || !resultCta || !resultUrl) {
    return;
  }

  const copyMap = {
    title: {
      value: resultTitle.textContent,
      message: `${resultTitleLabel?.textContent || "標題"}已複製到剪貼簿。`
    },
    body: {
      value: resultBody.textContent,
      message: `${resultBodyLabel?.textContent || "主文"}已複製到剪貼簿。`
    },
    description: {
      value: resultDescription?.textContent || "",
      message: `${resultDescriptionLabel?.textContent || "Description"}已複製到剪貼簿。`
    },
    cta: {
      value: resultCta.textContent,
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

  await copyText(target.value, target.message);
}

function buildSmsCopyText() {
  const title = resultSmsTitle?.textContent || "";
  const body = resultSmsBody?.textContent || "";
  const cta = resultSmsCta?.textContent || "";
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

function collectUniqueItems(items) {
  return Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));
}

function parseGoogleAdsVariantText(value) {
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

function renderGoogleAdsVariants(container, items, label) {
  if (!container) {
    return;
  }

  if (!items.length || activeTab !== "google_ads") {
    container.innerHTML = "";
    container.classList.add("is-hidden");
    return;
  }

  container.innerHTML = items
    .map((item, index) => `
      <div class="variant-item">
        <div class="result-head">
          <span class="variant-index">${label} ${index + 1}</span>
          <button class="icon-copy-button" type="button" data-copy-variant="${encodeURIComponent(item)}" data-copy-label="${label} ${index + 1}" aria-label="複製 ${label} ${index + 1}">
            <span aria-hidden="true">⧉</span>
          </button>
        </div>
        <p class="variant-value">${escapeHtml(item)}</p>
      </div>
    `)
    .join("");
  container.classList.remove("is-hidden");
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
  analysisSummary.textContent = pageAnalysis.summary || "這次沒有抓到可用的頁面摘要。";
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
  renderProductUrlPreview();
}

resultTabButtons.forEach((button) => {
  button.addEventListener("click", () => handleTabClick(button.dataset.tab));
});

copyTitleButton?.addEventListener("click", () => handleCopyField("title"));
copyBodyButton?.addEventListener("click", () => handleCopyField("body"));
copyDescriptionButton?.addEventListener("click", () => handleCopyField("description"));
copyCtaButton?.addEventListener("click", () => handleCopyField("cta"));
copyUrlButton?.addEventListener("click", () => handleCopyField("url"));
copySmsButton?.addEventListener("click", () => handleCopyField("sms"));
resultTitleVariants?.addEventListener("click", async (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-copy-variant]") : null;
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  await copyText(decodeURIComponent(button.dataset.copyVariant || ""), `${button.dataset.copyLabel || "Headline"}已複製到剪貼簿。`);
});
resultBodyVariants?.addEventListener("click", async (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-copy-variant]") : null;
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  await copyText(decodeURIComponent(button.dataset.copyVariant || ""), `${button.dataset.copyLabel || "Description"}已複製到剪貼簿。`);
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

domainPresetInput?.addEventListener("change", () => {
  syncDomainPresetIntoUrl();
  schedulePromptRender();
});

productUrlInput?.addEventListener("input", () => {
  renderProductUrlPreview();
});

updateVoiceBalanceNote(voiceBalanceInput?.value || 3);
renderProductUrlPreview();

hydrateFromLastRun();
checkHealth();
