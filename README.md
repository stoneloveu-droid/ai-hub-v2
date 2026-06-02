# AI Account Hub v2

Quản lý tập trung tài khoản AI cá nhân — PWA, offline-first, GitHub Gist sync.

## Cấu trúc thư mục

```
ai-account-hub/
├── index.html          # Shell HTML + tất cả modal
├── style.css           # Toàn bộ CSS (dark/light/system theme)
├── app.js              # Orchestrator — import các module, expose window.App
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker (offline-first)
├── icon-192.png        # PWA icon (bạn tự thêm)
├── icon-512.png        # PWA icon (bạn tự thêm)
└── js/
    ├── constants.js    # Hằng số, config, AI providers
    ├── utils.js        # Helpers: uid, timeAgo, crypto, debounce, logger
    ├── storage.js      # IndexedDB (Dexie.js) + migrate từ localStorage
    ├── settings.js     # Settings + mã hóa token AES-256-GCM
    ├── accounts.js     # Business logic: CRUD, validate, filter, stats
    ├── ui.js           # DOM rendering: cards, stats, toast, skeleton
    ├── sync.js         # GitHub Gist: push / pull / conflict detection
    ├── browserLauncher.js  # Lệnh terminal Chrome/Edge/Brave/Firefox
    └── rateLimit.js    # Countdown, rotation, notification
```

---

## Deploy lên GitHub Pages (miễn phí)

### Bước 1 — Tạo repo

```bash
git init
git add .
git commit -m "feat: AI Account Hub v2"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ai-account-hub.git
git push -u origin main
```

### Bước 2 — Bật GitHub Pages

Repo → **Settings** → **Pages** → Source: `Deploy from branch` → Branch: `main` → `/root`

App sẽ live tại: `https://YOUR_USERNAME.github.io/ai-account-hub`

### Bước 3 — Thêm PWA icons (tùy chọn)

Tạo 2 file PNG:
- `icon-192.png` (192×192)
- `icon-512.png` (512×512)

Dùng tool online: [realfavicongenerator.net](https://realfavicongenerator.net)

---

## Cấu hình GitHub Gist Sync

### Tạo Personal Access Token

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. **Generate new token** → tick quyền **`gist`** → Copy token

### Tạo Gist để lưu data

1. Vào [gist.github.com](https://gist.github.com)
2. Tạo **secret gist** mới, filename: `ai-hub-data.json`, nội dung: `[]`
3. Copy **Gist ID** từ URL: `gist.github.com/username/[GIST_ID]`

### Cấu hình trong app

App → **⚙️ Cài đặt** → **Đồng bộ GitHub Gist** → nhập Token + Gist ID → **Kiểm tra kết nối**

> **Bảo mật:** Token được mã hóa bằng AES-256-GCM (Web Crypto API) trước khi lưu vào localStorage. Không có gì được commit lên repo.

---

## Tìm Chrome Profile name

1. Mở Chrome → gõ `chrome://version`
2. Xem dòng **Profile Path** → lấy phần cuối

```
/home/user/.config/google-chrome/Profile 3
                                  ^^^^^^^^^ ← đây là profile name
```

Ví dụ lệnh terminal được sinh ra:

```bash
# Linux/macOS
google-chrome --profile-directory="Profile 3" https://claude.ai

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --profile-directory="Profile 3" https://claude.ai

# Firefox
firefox -P "work-profile" https://claude.ai
```

---

## Tính năng v2

| Tính năng | Mô tả |
|-----------|-------|
| **IndexedDB** | Lưu trữ bền vững, không mất khi clear cache |
| **Auto migrate** | Tự động chuyển data cũ từ localStorage |
| **AES-256-GCM** | Mã hóa GitHub token trước khi lưu |
| **Dark / Light / System** | 3 chế độ theme |
| **Pin & Favorite** | Ghim, đánh dấu yêu thích tài khoản |
| **Archive** | Ẩn tài khoản không dùng thay vì xóa |
| **Duplicate** | Nhân bản nhanh một tài khoản |
| **Multi-select + Bulk** | Chọn nhiều → đổi trạng thái / gán tag / archive / xóa |
| **Rate limit countdown** | Đếm ngược realtime, tự reset trạng thái |
| **Auto rotation** | Gợi ý tài khoản thay thế khi hết limit |
| **Full-text search** | Tìm theo tên, email, tag, ghi chú, profile |
| **Sort 7 kiểu** | Ghim trước, gần dùng, dùng nhiều, tên, loại AI, trạng thái, cũ nhất |
| **Gist sync** | Push / Pull / Conflict detection |
| **PWA offline** | Dùng được khi mất mạng |
| **Skeleton loading** | UI không bị trống khi load |
| **Activity log** | Lưu lịch sử mọi thao tác vào IndexedDB |
| **Export / Import JSON** | Backup và restore dữ liệu |
| **ES Modules** | Code tách module, dễ bảo trì |

---

## Roadmap v3 (SaaS)

Để nâng lên multi-user SaaS, cần thêm:

```
Tech stack:
├── Frontend: Vite + React (hoặc giữ Vanilla JS)
├── Backend:  Supabase (Auth + PostgreSQL + Realtime)
├── Deploy:   Vercel hoặc Cloudflare Pages
└── CI/CD:    GitHub Actions
```

Các bước:
1. `npm create vite@latest` → chuyển code sang Vite build
2. Tạo Supabase project → thêm bảng `accounts`, `workspaces`, `activity`
3. Thay `storage.js` bằng Supabase client (interface giữ nguyên)
4. Thêm Supabase Auth (Google/GitHub OAuth)
5. E2E encryption: sinh key từ master password, encrypt trước khi INSERT

---

## Dev locally

```bash
# Không cần build step — chạy thẳng với bất kỳ static server
npx serve .
# hoặc
python3 -m http.server 3000
```

> **Lưu ý:** ES Modules yêu cầu chạy qua HTTP server (không mở file:// trực tiếp).
