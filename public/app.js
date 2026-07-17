const form = document.querySelector("#copy-form");
const statusEl = document.querySelector("#form-status");
const submitButton = document.querySelector("#submit-button");
const copyButton = document.querySelector("#copy-button");
const promptPreview = document.querySelector("#prompt-preview");
const refreshPromptButton = document.querySelector("#refresh-prompt-button");
const modeBadge = document.querySelector("#mode-badge");
const resultCard = document.querySelector("#result-card");
const appConfig = window.APP_CONFIG || {};

const resultTitle = document.querySelector("#result-title");
const resultBody = document.querySelector("#result-body");
const resultCta = document.querySelector("#result-cta");
const resultUrl = document.querySelector("#result-url");
const resultModeChip = document.querySelector("#result-mode-chip");
const resultMetaText = document.querySelector("#result-meta-text");
let promptRenderTimer = null;

const errorEls = {
  productName: document.querySelector('[data-error-for="productName"]'),
  benefits: document.querySelector('[data-error-for="benefits"]'),
  productUrl: document.querySelector('[data-error-for="productUrl"]'),
  tone: document.querySelector('[data-error-for="tone"]')
};

function getFormData() {
  const formData = new FormData(form);
  const benefits = formData
    .getAll("benefit")
    .map((item) => String(item).trim())
    .filter(Boolean);

  return {
    productName: String(formData.get("productName") || "").trim(),
    benefits,
    productUrl: String(formData.get("productUrl") || "").trim(),
    tone: String(formData.get("tone") || "").trim()
  };
}

function validate(data) {
  const errors = {};

  if (!data.productName || data.productName.length > 80) {
    errors.productName = "產品名稱必填，且需在 80 字內。";
  }

  if (data.benefits.length < 3 || data.benefits.length > 5) {
    errors.benefits = "請提供 3 到 5 個優點。";
  } else if (data.benefits.some((item) => item.length > 60)) {
    errors.benefits = "每個優點需在 60 字內。";
  }

  try {
    new URL(data.productUrl);
  } catch {
    errors.productUrl = "請輸入有效網址。";
  }

  if (!["warm", "aggressive"].includes(data.tone)) {
    errors.tone = "請選擇文案風格。";
  }

  return errors;
}

function renderErrors(errors) {
  Object.entries(errorEls).forEach(([key, el]) => {
    el.textContent = errors[key] || "";
  });
}

function buildPrompt(data) {
  const toneText =
    data.tone === "warm"
      ? "語氣偏溫和、專業、可信任，強調價值、理解使用者需求、降低壓迫感。"
      : "語氣偏直接、強烈、促動行動，強調機會、差異、效率與立即行動，但不能低俗、浮誇或不實承諾。";

  const benefitLines = data.benefits.map((item, index) => `${index + 1}. ${item}`).join("\n");

  return `你是「貝克 v1」，擅長整合行銷策略、受眾洞察、轉換導向寫作經驗，以及既有知識庫中的行銷相關資料，產出可直接使用的廣告文案。

任務：
根據使用者提供的產品資訊，產出 1 則可直接使用的廣告文案。

輸入資料：
- 產品名稱：${data.productName || "{{product_name}}"}
- 產品優點：
${benefitLines || "1. {{benefit_1}}\n2. {{benefit_2}}\n3. {{benefit_3}}"}
- 產品頁連結：${data.productUrl || "{{product_url}}"}
- 文案風格：${data.tone || "{{tone}}"}

風格規則：
- ${toneText}

生成規則：
1. 必須結合使用者提供的產品名稱、產品優點、產品頁資訊，以及貝克 v1 的既有行銷知識與過往餵入的行銷資料脈絡。
2. 優先考慮清楚、可用、具說服力，避免空泛形容詞堆疊。
3. 不要輸出多個版本，不要解釋思考過程，不要輸出分析、備註、前言、後記。
4. 不要捏造未提供的具體數字、成效、保證。

請嚴格按照以下格式輸出：
標題：{title}
主文：{body}
CTA：{cta}
連結：{product_url}`;
}

function buildMockCopy(data) {
  const [primary, secondary, tertiary] = data.benefits;

  return {
    title:
      data.tone === "warm"
        ? `${data.productName}，把${primary}說得更清楚`
        : `${data.productName}，現在就用${primary}搶下注意力`,
    body:
      data.tone === "warm"
        ? `${data.productName} 把 ${primary}、${secondary} 和 ${tertiary} 整理成更容易被理解的產品訊息，讓行銷人不用反覆重寫，也能更快產出一則能溝通價值的廣告文案。`
        : `別再讓產品亮點被模糊帶過。${data.productName} 直接把 ${primary}、${secondary}、${tertiary} 推到前面，讓受眾更快理解價值，也更容易立刻採取行動。`,
    cta: data.tone === "warm" ? "立即了解更多" : "現在就立刻查看",
    url: data.productUrl
  };
}

function renderPrompt() {
  promptPreview.textContent = buildPrompt(getFormData());
}

function schedulePromptRender() {
  window.clearTimeout(promptRenderTimer);
  promptRenderTimer = window.setTimeout(() => {
    renderPrompt();
  }, 120);
}

function renderResult(output) {
  resultTitle.textContent = output.title;
  resultBody.textContent = output.body;
  resultCta.textContent = output.cta;
  resultUrl.textContent = output.url;
  resultUrl.href = output.url;
  resultCard.classList.remove("empty");
  copyButton.disabled = false;
}

function renderResultMode(mode, warning) {
  const normalizedMode = mode === "live" || mode === "openclaw" ? "live" : "mock";
  resultModeChip.classList.remove("chip-live", "chip-mock", "chip-secondary");
  resultModeChip.classList.add(normalizedMode === "live" ? "chip-live" : "chip-mock");

  if (normalizedMode === "live") {
    resultModeChip.textContent = "本次結果：Live";
    resultMetaText.textContent = "這一筆結果是從真實 agent 回來的，不是本地 mock 模板。";
    return;
  }

  resultModeChip.textContent = warning === "live_endpoint_failed" ? "本次結果：Mock Fallback" : "本次結果：Mock";
  resultMetaText.textContent =
    warning === "live_endpoint_failed"
      ? "這次原本嘗試走 live，但中途失敗，已自動退回 mock fallback。"
      : "這一筆不是 live agent 產出，而是 mock / demo fallback。";
}

async function checkHealth() {
  try {
    const response = await fetch(getApiUrl("health"));
    const data = await response.json();
    const liveModes = new Set(["live", "openclaw"]);
    modeBadge.textContent = liveModes.has(data.endpointMode) ? "已連真實 agent" : "Mock 模式";
    modeBadge.classList.add(liveModes.has(data.endpointMode) ? "chip-live" : "chip-mock");
  } catch {
    modeBadge.textContent = "Static Demo";
    modeBadge.classList.add("chip-mock");
  }
}

function getApiUrl(path) {
  const base = appConfig.apiBaseUrl || "./api/";
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

async function handleSubmit(event) {
  event.preventDefault();
  const data = getFormData();
  const errors = validate(data);
  renderErrors(errors);
  renderPrompt();

  if (Object.keys(errors).length) {
    statusEl.textContent = "欄位還沒填完整，先修正後再送出。";
    return;
  }

  submitButton.disabled = true;
  copyButton.disabled = true;
  statusEl.textContent = "文案生成中，正在整理給貝克 v1 的任務...";

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

    renderResult(result.output);
    renderResultMode(result.mode, result.warning);
    promptPreview.textContent = result.prompt;
    statusEl.textContent =
      result.mode === "live" || result.mode === "openclaw"
        ? "已使用真實 agent 完成產出。"
        : "目前為 mock 模式，已用本地 fallback 先完成產出。";
  } catch (error) {
    const fallback = buildMockCopy(data);
    renderResult(fallback);
    renderResultMode("mock");
    promptPreview.textContent = buildPrompt(data);
    statusEl.textContent = "目前沒有可用後端，已切到 static demo mock 模式。";
  } finally {
    submitButton.disabled = false;
  }
}

async function handleCopy() {
  const text = `標題：${resultTitle.textContent}\n主文：${resultBody.textContent}\nCTA：${resultCta.textContent}\n連結：${resultUrl.textContent}`;
  await navigator.clipboard.writeText(text);
  statusEl.textContent = "文案已複製到剪貼簿。";
}

form.addEventListener("submit", handleSubmit);
copyButton.addEventListener("click", handleCopy);
refreshPromptButton.addEventListener("click", renderPrompt);
form.addEventListener("input", schedulePromptRender);

renderPrompt();
checkHealth();
