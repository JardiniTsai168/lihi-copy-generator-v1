# MEMORY.md

## 2026-08-01 Creative Branch Reset

- `lihi-copy-generator-v1` 這一版已完成正式 deploy，並已交付工程師；`copy.bktsai.link` 為已交付版主線。
- 已建立下一版獨立 GitHub repo：`JardiniTsai168/lihi-copy-generator-creative-v1`
- 新 repo URL：<https://github.com/JardiniTsai168/lihi-copy-generator-creative-v1>
- 新 repo 本機路徑：`/Users/tonytsai/.openclaw/workspace-lihi-copy-generator-creative-v1`
- 切 repo 的目的：讓下一版 creative 開發不污染已交付的 `lihi-copy-generator-v1`
- `creative.bktsai.link` 已用 live 主機上的 `beck-v1` 正式內容完整同步，保留 `creative-v1` 自己的 `.env`
- 同步後已驗證：
  - `https://creative.bktsai.link/health` 正常
  - `creative.bktsai.link` 與 `copy.bktsai.link` 首頁內容一致
  - `bridge-server.js`、`public/app.js`、`public/index.html`、`public/styles.css` 在 `beck-v1` 與 `creative-v1` 的 hash 一致
- 後續開發原則：
  - 舊版維護走 `lihi-copy-generator-v1` / `copy.bktsai.link`
  - 新功能與下一版迭代走 `lihi-copy-generator-creative-v1` / `creative.bktsai.link`
