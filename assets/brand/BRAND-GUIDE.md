# ViJJI Brand Guide
> Single source of truth. Never recreate the logo — always use these files.

---

## Logo Files

| File | Use For |
|------|---------|
| `vijji-logo-wordmark.svg` | Web (inline SVG), print, any scalable use |
| `vijji-logo-wordmark-360w.png` | Email signatures, small web use |
| `vijji-logo-wordmark-720w.png` | High-res web, presentations |
| `vijji-logo-social-640.png` | WhatsApp profile pic, social avatars |
| `vijji-logo-social-1080.png` | Social media posts, banners |
| `vijji-favicon.svg` | Browser favicon (modern browsers) |
| `vijji-favicon-32.png` | Browser favicon (legacy) |
| `vijji-favicon-180.png` | Apple touch icon |
| `vijji-favicon-192.png` | Android PWA icon |
| `vijji-favicon-512.png` | Android PWA splash, Play Store |

---

## Logo Rules

1. **NEVER recreate the logo** with CSS, fonts, or design tools
2. **ALWAYS use these source files** — copy the SVG or use a PNG
3. "Vi" = white (#e8eaf0), "JJI" = blue gradient (#4d8ef7 → #7db4ff)
4. **No space** between "Vi" and "JJI" — it's one continuous word
5. Font: DM Sans Bold 700 (fallback: Helvetica Neue, Arial)
6. Minimum clear space: half the height of the logo on all sides

---

## Brand Colors

### Primary
| Name | Hex | Use |
|------|-----|-----|
| Vijji Blue | `#4d8ef7` | Primary brand, buttons, links, JJI start |
| Vijji Blue Light | `#7db4ff` | JJI gradient end, hover states |
| White | `#e8eaf0` | "Vi" text, primary text on dark |

### UI (Dark Theme)
| Token | Hex | Use |
|-------|-----|-----|
| `--bg-root` | `#0f1117` | Page background |
| `--bg-panel` | `#13151d` | Sidebar, panels |
| `--bg-elevated` | `#181b25` | Cards, modals |
| `--bg-input` | `#1c1f2b` | Input fields |
| `--bg-hover` | `#212533` | Hover states |
| `--border` | `#262a36` | All borders |
| `--t1` | `#e8eaf0` | Primary text |
| `--t2` | `#8a8d9a` | Secondary text |
| `--t3` | `#5c5e6a` | Muted text |
| `--green` | `#4ade80` | Success, stock, WhatsApp |

### CSS Variables (copy into any project)
```css
:root {
  --brand: #4d8ef7;
  --brand-hover: #6fa8ff;
  --brand-glow: rgba(77,142,247,0.15);
  --brand-grad: linear-gradient(135deg, #4d8ef7 0%, #7db4ff 100%);
  --bg-root: #0f1117;
  --bg-panel: #13151d;
  --bg-elevated: #181b25;
  --bg-input: #1c1f2b;
  --bg-hover: #212533;
  --border: #262a36;
  --t1: #e8eaf0;
  --t2: #8a8d9a;
  --t3: #5c5e6a;
  --green: #4ade80;
}
```

---

## Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Logo | DM Sans | 700 (Bold) | — |
| Headings | DM Sans | 600 (Semibold) | 22-32px |
| Body | DM Sans | 400 (Regular) | 14-15px |
| Small/Labels | DM Sans | 500 (Medium) | 11-13px |

Google Fonts import:
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

---

## Inline SVG Logo (copy-paste ready)

### Sidebar / Small (110×28)
```html
<svg width="110" height="28" viewBox="0 0 90 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="jji-blue" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4d8ef7"/><stop offset="100%" stop-color="#7db4ff"/></linearGradient></defs>
  <text x="0" y="23" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-size="26" font-weight="700" fill="#e8eaf0" letter-spacing="-0.5">Vi</text>
  <text x="27" y="23" font-family="'DM Sans','Helvetica Neue',Arial,sans-serif" font-size="26" font-weight="700" fill="url(#jji-blue)" letter-spacing="-0.5">JJI</text>
</svg>
```

### Hero / Large (160×44)
```html
<svg width="160" height="44" viewBox="0 0 90 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- same content, just larger width/height -->
</svg>
```

Scale by changing `width` and `height` — the `viewBox` stays the same.

---

## Where Each File Goes

| Platform | Files Needed |
|----------|-------------|
| **vijji.ai (Vercel/Dokku)** | Inline SVG for logo, favicon-32.png, favicon.svg |
| **chat.vijji.ai** | Inline SVG, favicon |
| **Mobile app (Capacitor)** | favicon-192.png, favicon-512.png for app icon; inline SVG in WebView |
| **Play Store listing** | vijji-logo-social-1080.png for feature graphic |
| **WhatsApp Business** | vijji-logo-social-640.png as profile picture |
| **Admin dashboard** | Inline SVG, favicon |
| **Email/docs** | vijji-logo-wordmark-720w.png |

---

## Storage

Keep these files in your repo at:
```
/assets/brand/
  vijji-logo-wordmark.svg
  vijji-logo-wordmark-360w.png
  vijji-logo-wordmark-720w.png
  vijji-logo-social-640.png
  vijji-logo-social-1080.png
  vijji-favicon.svg
  vijji-favicon-32.png
  vijji-favicon-180.png
  vijji-favicon-192.png
  vijji-favicon-512.png
  BRAND-GUIDE.md   ← this file
```
