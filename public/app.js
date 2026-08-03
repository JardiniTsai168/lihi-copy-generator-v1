const HEALTH_TIMEOUT_MS = 10000;
const GENERATE_TIMEOUT_MS = 600000;
const MAX_UPLOAD_EDGE = 1024;
const INITIAL_JPEG_QUALITY = 0.74;
const MIN_JPEG_QUALITY = 0.5;
const MAX_UPLOAD_DATA_URL_LENGTH = 760000;
const MAX_UPLOAD_FILES = 3;
const JOB_POLL_INTERVAL_MS = 2500;
const PENDING_JOB_STORAGE_KEY = "lihi-coloring-pending-job:v1";

const form = document.querySelector("#coloring-form");
const fileInput = document.querySelector("#photo-input");
const dropzone = document.querySelector("#upload-dropzone");
const sourcePreviewGrid = document.querySelector("#source-preview-grid");
const uploadPreview = document.querySelector("#upload-preview");
const removePhotoButton = document.querySelector("#remove-photo-button");
const statusEl = document.querySelector("#form-status");
const modeBadge = document.querySelector("#mode-badge");
const resultCard = document.querySelector("#result-card");
const resultGallery = document.querySelector("#result-gallery");
const emptyState = document.querySelector("#empty-state");
const emptyLoadingMessage = document.querySelector("#empty-loading-message");
const emptyLoadingBar = document.querySelector("#empty-loading-bar");
const emptyExampleCard = document.querySelector("#empty-example-card");
const modelName = document.querySelector("#model-name");
const costName = document.querySelector("#cost-name");
const modeName = document.querySelector("#mode-name");
const generatedAt = document.querySelector("#generated-at");
const submitButton = document.querySelector("#submit-button");
const errorPhoto = document.querySelector('[data-error-for="photo"]');

let currentPhotoDataUrls = [];
let currentGenerateStartedAt = 0;
let isGeneratingImages = false;
let activeJobPollTimer = 0;
let activePendingJob = null;
let isJobPollInFlight = false;
let coloringSessionToken = "";
let coloringSessionExpiresAt = 0;

boot();

function boot() {
  if (!form || !fileInput) {
    return;
  }

  fileInput.addEventListener("change", handleFileChange);
  form.addEventListener("submit", handleSubmit);
  dropzone.addEventListener("dragover", handleDragOver);
  dropzone.addEventListener("dragleave", handleDragLeave);
  dropzone.addEventListener("drop", handleDrop);
  removePhotoButton.addEventListener("click", handleRemovePhoto);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pageshow", handlePageShow);

  refreshHealth();
  ensureColoringSession().catch(() => {});
  restorePendingJob();
}

async function refreshHealth() {
  try {
    const response = await fetchWithTimeout("/health", { method: "GET", cache: "no-store" }, HEALTH_TIMEOUT_MS);
    const result = await response.json();
    modeBadge.textContent = result.ok ? (result.mode === "live" ? "live" : "mock") : "health failed";
    modeBadge.classList.toggle("chip-live", result.mode === "live");
    modeBadge.classList.toggle("chip-mock", result.mode !== "live");
    modelName.textContent = result.imageModel || result.model || "-";
    costName.textContent = "-";
    modeName.textContent = result.mode || "-";
    generatedAt.textContent = "-";
  } catch {
    modeBadge.textContent = "連線失敗";
    modeBadge.classList.remove("chip-live");
    modeBadge.classList.add("chip-mock");
  }
}

async function handleFileChange(event) {
  if (submitButton.disabled) {
    return;
  }

  const files = Array.from(event.target.files || []);
  await loadSelectedFiles(files);
}

async function handleDrop(event) {
  event.preventDefault();
  dropzone.classList.remove("is-dragover");

  if (submitButton.disabled) {
    return;
  }

  const files = Array.from(event.dataTransfer?.files || []);

  if (files.length === 0) {
    return;
  }

  const dt = new DataTransfer();
  for (const file of files.slice(0, MAX_UPLOAD_FILES)) {
    dt.items.add(file);
  }
  fileInput.files = dt.files;
  await loadSelectedFiles(Array.from(dt.files));
}

function handleDragOver(event) {
  if (submitButton.disabled) {
    return;
  }

  event.preventDefault();
  dropzone.classList.add("is-dragover");
}

function handleDragLeave() {
  dropzone.classList.remove("is-dragover");
}

async function loadSelectedFiles(files) {
  clearPhotoError();

  if (!files || files.length === 0) {
    resetSelectedPhoto();
    return;
  }

  const limitedFiles = files.slice(0, MAX_UPLOAD_FILES);
  if (files.length > MAX_UPLOAD_FILES) {
    setPhotoError("一次最多只能上傳 3 張照片");
    return;
  }

  try {
    const invalidFile = limitedFiles.find((file) => !file.type.startsWith("image/"));
    if (invalidFile) {
      setPhotoError("請上傳圖片檔");
      return;
    }

    currentPhotoDataUrls = await Promise.all(limitedFiles.map((file) => fileToCompressedDataUrl(file)));
    renderSourcePreviews(currentPhotoDataUrls);
    dropzone.classList.add("is-hidden");
    uploadPreview.classList.remove("is-hidden");
    form.classList.add("has-selected-photos");
    setStatus(`${currentPhotoDataUrls.length} 張照片已就緒，可以直接產圖。`);
  } catch (error) {
    setPhotoError(error instanceof Error ? error.message : "照片處理失敗");
  }
}

function handleRemovePhoto() {
  resetSelectedPhoto();
}

async function handleSubmit(event) {
  event.preventDefault();
  clearPhotoError();

  if (currentPhotoDataUrls.length === 0) {
    setPhotoError("請先上傳照片");
    return;
  }

  setPending(true);
  isGeneratingImages = true;
  currentGenerateStartedAt = Date.now();
  updateResultPlaceholderVisibility();
  setStatus(`正在把 ${currentPhotoDataUrls.length} 張照片重畫成著色圖，請耐心等候`);

  try {
    await ensureColoringSession();
    const job = await createColoringJobRequest({
      photoDataUrls: currentPhotoDataUrls,
      model: "openai/gpt-5.4-image-2",
      quality: "low"
    });

    activePendingJob = {
      jobId: job.jobId,
      jobToken: job.jobToken,
      photoCount: currentPhotoDataUrls.length,
      startedAt: Date.now()
    };
    persistPendingJob(activePendingJob);
    pollColoringJob({ immediate: true });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "產圖失敗");
    isGeneratingImages = false;
    currentGenerateStartedAt = 0;
    updateResultPlaceholderVisibility();
    setPending(false);
  }
}

function setPending(isPending) {
  submitButton.disabled = isPending;
  removePhotoButton.disabled = isPending;
  fileInput.disabled = isPending;
}

function setStatus(message) {
  if (!statusEl) {
    return;
  }

  const nextMessage = String(message || "").trim();
  statusEl.textContent = nextMessage;
  statusEl.classList.toggle("is-hidden", nextMessage.length === 0);
}

function formatCostLabel(value) {
  const cost = Number(value);
  if (!Number.isFinite(cost) || cost < 0) {
    return "-";
  }

  if (cost === 0) {
    return "$0.00 USD";
  }

  return `$${cost.toFixed(cost >= 0.01 ? 4 : 5)} USD`;
}

function sumResultCosts(results) {
  const costs = results
    .map((result) => Number(result?.costUsd))
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (costs.length === 0) {
    return null;
  }

  return Number(costs.reduce((sum, value) => sum + value, 0).toFixed(6));
}

function formatElapsedSeconds(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return "-";
  }

  const seconds = (endMs - startMs) / 1000;
  return `${seconds.toFixed(1)} 秒`;
}

function setPhotoError(message) {
  errorPhoto.textContent = message;
}

function clearPhotoError() {
  errorPhoto.textContent = "";
}

function resetSelectedPhoto() {
  currentPhotoDataUrls = [];
  fileInput.value = "";
  sourcePreviewGrid.innerHTML = "";
  resultGallery.innerHTML = "";
  resultGallery.classList.add("is-hidden");
  uploadPreview.classList.add("is-hidden");
  dropzone.classList.remove("is-hidden");
  form.classList.remove("has-selected-photos");
  isGeneratingImages = false;
  costName.textContent = "-";
  modeName.textContent = "-";
  modelName.textContent = modelName.textContent || "-";
  generatedAt.textContent = "-";
  updateResultPlaceholderVisibility();
  setStatus("");
}

function updateResultPlaceholderVisibility() {
  const hasResults = resultGallery.innerHTML.trim().length > 0;
  const shouldHidePlaceholder = hasResults;

  emptyState.classList.toggle("is-hidden", shouldHidePlaceholder);
  resultCard.classList.toggle("empty", !shouldHidePlaceholder);

  if (emptyLoadingMessage) {
    emptyLoadingMessage.classList.toggle("is-hidden", !isGeneratingImages);
  }

  if (emptyLoadingBar) {
    emptyLoadingBar.classList.toggle("is-hidden", !isGeneratingImages);
  }

  if (emptyExampleCard) {
    emptyExampleCard.classList.toggle("is-hidden", isGeneratingImages);
  }
}

function renderSourcePreviews(photoDataUrls) {
  sourcePreviewGrid.innerHTML = photoDataUrls
    .map(
      (photoDataUrl, index) => `
        <figure class="source-preview-item">
          <img src="${photoDataUrl}" alt="上傳照片預覽 ${index + 1}" />
        </figure>
      `
    )
    .join("");
}

function renderResultGallery(outputs) {
  resultGallery.innerHTML = outputs
    .map((output, index) => {
      const imageDataUrl = String(output?.imageDataUrl || "").trim();
      const filename = `lihi-coloring-image-${index + 1}.png`;
      return `
        <figure class="result-item">
          <img class="result-image" src="${imageDataUrl}" alt="AI 生成的著色圖 ${index + 1}" />
          <a class="ghost-button result-download-button" href="${imageDataUrl}" download="${filename}">下載第 ${index + 1} 張</a>
        </figure>
      `;
    })
    .join("");
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible" && activePendingJob) {
    pollColoringJob({ immediate: true });
  }
}

function handlePageShow() {
  if (activePendingJob) {
    pollColoringJob({ immediate: true });
  }
}

function clearPendingJob() {
  activePendingJob = null;
  isJobPollInFlight = false;

  if (activeJobPollTimer) {
    window.clearTimeout(activeJobPollTimer);
    activeJobPollTimer = 0;
  }

  try {
    window.localStorage.removeItem(PENDING_JOB_STORAGE_KEY);
  } catch {}
}

function persistPendingJob(job) {
  try {
    window.localStorage.setItem(PENDING_JOB_STORAGE_KEY, JSON.stringify(job));
  } catch {}
}

function restorePendingJob() {
  try {
    const raw = window.localStorage.getItem(PENDING_JOB_STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    if (!parsed?.jobId || !parsed?.jobToken) {
      clearPendingJob();
      return;
    }

    activePendingJob = {
      jobId: String(parsed.jobId),
      jobToken: String(parsed.jobToken),
      photoCount: Number(parsed.photoCount) || 1,
      startedAt: Number(parsed.startedAt) || Date.now()
    };
    currentGenerateStartedAt = activePendingJob.startedAt;
    isGeneratingImages = true;
    updateResultPlaceholderVisibility();
    setPending(true);
    setStatus(`正在接續查詢 ${activePendingJob.photoCount} 張著色圖，請稍候`);
    pollColoringJob({ immediate: true });
  } catch {
    clearPendingJob();
  }
}

function scheduleNextJobPoll(delayMs = JOB_POLL_INTERVAL_MS) {
  if (!activePendingJob) {
    return;
  }

  if (activeJobPollTimer) {
    window.clearTimeout(activeJobPollTimer);
  }

  activeJobPollTimer = window.setTimeout(() => {
    pollColoringJob({ immediate: true });
  }, delayMs);
}

async function pollColoringJob({ immediate = false } = {}) {
  if (!activePendingJob || isJobPollInFlight) {
    return;
  }

  if (!immediate && document.visibilityState === "hidden") {
    scheduleNextJobPoll();
    return;
  }

  isJobPollInFlight = true;

  try {
    await ensureColoringSession();
    const response = await fetchColoringJob(activePendingJob.jobId, activePendingJob.jobToken);
    const job = response?.job;
    if (!job) {
      throw new Error("找不到產圖任務");
    }

    if (job.status === "queued" || job.status === "running") {
      isGeneratingImages = true;
      updateResultPlaceholderVisibility();
      setPending(true);
      setStatus(`正在把 ${activePendingJob.photoCount} 張照片重畫成著色圖，請耐心等候`);
      scheduleNextJobPoll();
      return;
    }

    if (job.status === "failed") {
      throw new Error(job.error || "產圖失敗");
    }

    if (job.status === "succeeded") {
      applyColoringResult(job.result, activePendingJob.photoCount);
      clearPendingJob();
      return;
    }

    throw new Error("產圖任務狀態不明");
  } catch (error) {
    const message = error instanceof Error ? error.message : "產圖失敗";
    setStatus(message);
    isGeneratingImages = false;
    currentGenerateStartedAt = 0;
    updateResultPlaceholderVisibility();
    setPending(false);
    clearPendingJob();
  } finally {
    isJobPollInFlight = false;
  }
}

function applyColoringResult(result, fallbackPhotoCount = 0) {
  const outputs = Array.isArray(result?.outputs)
    ? result.outputs.filter((output) => output && typeof output.imageDataUrl === "string")
    : [];

  if (outputs.length === 0) {
    throw new Error("模型沒有回圖片");
  }

  modelName.textContent = result?.imageModel || result?.model || "-";
  costName.textContent = formatCostLabel(result?.costUsd);
  modeName.textContent = result?.mode || "-";
  generatedAt.textContent = formatElapsedSeconds(currentGenerateStartedAt, Date.now());
  renderResultGallery(outputs);
  resultGallery.classList.remove("is-hidden");
  isGeneratingImages = false;
  currentGenerateStartedAt = 0;
  updateResultPlaceholderVisibility();
  setPending(false);
  setStatus(`${outputs.length || fallbackPhotoCount} 張著色圖已產生，可以直接下載。`);
}

async function fileToCompressedDataUrl(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const { width, height } = fitWithinBounds(image.naturalWidth, image.naturalHeight, MAX_UPLOAD_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("瀏覽器不支援圖片處理");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  let quality = INITIAL_JPEG_QUALITY;
  let compressedDataUrl = canvas.toDataURL("image/jpeg", quality);

  while (compressedDataUrl.length > MAX_UPLOAD_DATA_URL_LENGTH && quality > MIN_JPEG_QUALITY) {
    quality = Math.max(MIN_JPEG_QUALITY, quality - 0.08);
    compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  if (compressedDataUrl.length > MAX_UPLOAD_DATA_URL_LENGTH) {
    throw new Error("照片檔案太大，請改用較小張或先裁切後再上傳");
  }

  return compressedDataUrl;
}

function fitWithinBounds(width, height, maxEdge) {
  if (width <= maxEdge && height <= maxEdge) {
    return { width, height };
  }

  const ratio = width / height;
  if (ratio >= 1) {
    return { width: maxEdge, height: Math.round(maxEdge / ratio) };
  }

  return { width: Math.round(maxEdge * ratio), height: maxEdge };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("讀取照片失敗"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("載入照片失敗"));
    image.src = src;
  });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function requestColoringImage(payload) {
  await ensureColoringSession();
  const response = await fetchWithTimeout(
    "/generate-coloring-card",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-coloring-session": coloringSessionToken
      },
      body: JSON.stringify(payload)
    },
    GENERATE_TIMEOUT_MS
  );

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const rawText = await response.text();
  const isJson = contentType.includes("application/json");
  const result = isJson ? safeJsonParse(rawText) : null;

  if (!response.ok || !result?.ok) {
    const parsedMessage = Array.isArray(result?.errors) && result.errors.length > 0
      ? result.errors.join("，")
      : result?.message || extractHtmlErrorMessage(rawText) || `產圖失敗 (${response.status})`;
    const message = normalizeRequestErrorMessage(parsedMessage, response.status);
    throw new Error(message);
  }

  return result;
}

async function createColoringJobRequest(payload) {
  await ensureColoringSession();
  const response = await fetchWithTimeout(
    "/generate-coloring-card-job",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-coloring-session": coloringSessionToken
      },
      body: JSON.stringify(payload)
    },
    GENERATE_TIMEOUT_MS
  );

  return parseBridgeJsonResponse(response, "建立產圖任務失敗");
}

async function fetchColoringJob(jobId, jobToken) {
  const response = await fetchWithTimeout(
    `/coloring-jobs/${encodeURIComponent(jobId)}?token=${encodeURIComponent(jobToken)}`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        "x-coloring-session": coloringSessionToken
      }
    },
    HEALTH_TIMEOUT_MS
  );

  return parseBridgeJsonResponse(response, "查詢產圖任務失敗");
}

async function parseBridgeJsonResponse(response, fallbackMessage) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const rawText = await response.text();
  const isJson = contentType.includes("application/json");
  const result = isJson ? safeJsonParse(rawText) : null;

  if (!response.ok || !result?.ok) {
    const parsedMessage = Array.isArray(result?.errors) && result.errors.length > 0
      ? result.errors.join("，")
      : result?.message || result?.error || extractHtmlErrorMessage(rawText) || `${fallbackMessage} (${response.status})`;
    throw new Error(normalizeRequestErrorMessage(parsedMessage, response.status));
  }

  return result;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractHtmlErrorMessage(value) {
  const text = String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text || "";
}

function normalizeRequestErrorMessage(message, status) {
  const raw = String(message || "").trim();
  if (status === 413 || /request entity too large/i.test(raw)) {
    return "照片太大，已超過上傳限制，請換小一點的照片後重試";
  }

  if (raw === "job_not_found") {
    return "先前的產圖任務已失效，請重新上傳照片再試一次";
  }

  if (raw === "forbidden_job_access") {
    return "這個產圖任務無法再存取，請重新上傳照片再試一次";
  }

  if (raw === "forbidden_origin") {
    return "請從 coloring.bktsai.link 正常開啟頁面後再試一次";
  }

  if (raw === "missing_device_cookie") {
    return "頁面驗證還沒準備好，請重新整理後再試一次";
  }

  if (raw === "invalid_session_token") {
    return "頁面驗證已過期，請重新整理後再試一次";
  }

  if (raw === "daily_limit_reached") {
    return "這台裝置今天的產圖次數已用完，請明天再試";
  }

  if (raw === "job_already_running") {
    return "這台裝置目前已有產圖任務進行中，請等這批完成後再試";
  }

  if (raw === "ip_rate_limited" || raw === "ip_temporarily_blocked") {
    return "目前這個網路來源請求太頻繁，請稍後再試";
  }

  if (raw === "suspicious_client") {
    return "請從 coloring.bktsai.link 正常開啟頁面後再試一次";
  }

  return raw || `產圖失敗 (${status})`;
}

async function ensureColoringSession({ forceRefresh = false } = {}) {
  if (!forceRefresh && coloringSessionToken && coloringSessionExpiresAt - Date.now() > 15000) {
    return coloringSessionToken;
  }

  const response = await fetchWithTimeout("/coloring-session", { method: "GET", cache: "no-store" }, HEALTH_TIMEOUT_MS);
  const result = await parseBridgeJsonResponse(response, "建立頁面驗證失敗");
  coloringSessionToken = String(result?.token || "").trim();
  coloringSessionExpiresAt = Number(result?.expiresAt) || 0;

  if (!coloringSessionToken) {
    throw new Error("頁面驗證失敗，請重新整理後再試一次");
  }

  return coloringSessionToken;
}
