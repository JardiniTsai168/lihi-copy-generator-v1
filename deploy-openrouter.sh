#!/bin/bash
# 切換到 OpenRouter Qwen3.5-plus 的部署腳本

echo "=== 切換到 OpenRouter Qwen3.5-plus ==="

# 連上伺服器並更新 .env
ssh root@157.245.151.126 << 'ENDSSH'
cd /var/www/beck-v1

# 備份原本的 .env
cp .env .env.backup.$(date +%Y%m%d-%H%M%S) 2>/dev/null || true

# 更新 .env 設定
cat > .env << 'EOF'
BRIDGE_PORT=3456
BRIDGE_API_KEY=
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-…48ec
OPENAI_MODEL=qwen/qwen3.5-plus-02-15
OPENAI_TIMEOUT_MS=90000
PAGE_FETCH_TIMEOUT_MS=15000
IMAGE_FETCH_TIMEOUT_MS=15000
OCR_IMAGE_LIMIT=3
OCR_MAX_IMAGE_BYTES=4194304
OCR_LANG=chi_tra+eng
PAGE_TEXT_CHAR_LIMIT=6000
MAX_PRODUCT_IMAGES=10
OCR_ALL_IMAGES=false
VISION_IMAGE_LIMIT=2
SCREENSHOT_VISION_LIMIT=1
SCREENSHOT_OCR_LIMIT=1
SCREENSHOTONE_ACCESS_KEY=
SCREENSHOTONE_API_BASE_URL=https://api.screenshotone.com/take
SCREENSHOTONE_ENABLED=false
SCREENSHOTONE_VIEWPORT_WIDTH=1440
SCREENSHOTONE_VIEWPORT_HEIGHT=1800
SCREENSHOTONE_FULL_PAGE_MAX_HEIGHT=20000
SCREENSHOTONE_SLICE_HEIGHT=4000
SCREENSHOTONE_USE_SLICES=false
VISION_ENABLED=true
EOF

echo "✓ .env 已更新"

# 重啟服務
pm2 restart beck-v1
echo "✓ 服務已重啟"

# 等待服務啟動
sleep 3

# 驗證
echo "=== 驗證服務狀態 ==="
curl -s https://copy.bktsai.link/health | python3 -m json.tool || curl -s https://copy.bktsai.link/health

ENDSSH

echo "=== 部署完成 ==="
