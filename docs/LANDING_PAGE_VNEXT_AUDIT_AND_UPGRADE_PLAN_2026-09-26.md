# Landing Page VNext — Đánh giá chuyên sâu & Kế hoạch nâng cấp

**Ngày:** 2026-09-26
**Phạm vi:** route công khai `/` (và `/about` — xem §1.2)
**Phân loại task:** D2 — nhiều module UI công khai, chạm design-system, metadata, E2E contract. Không chạm ranh giới auth / tenancy / dữ liệu.
**Baseline đo:** commit `6284697` (branch `feat/cloudflare-worker-backend`)
**SSOT:** `src/index.css` → `00-tokens.css` (`@theme`) → `10-foundations.css` / `20-primitives.css` / `25-landing.css`

> **Trạng thái:** Phase 0, self-host font, Phase 1, Phase 2, Phase 3 và **Phase 4 đã triển khai và verify xanh** (§11, §14, §15, §16). Phần còn lại là **KẾ HOẠCH — chưa triển khai**.
> Tài liệu này là artifact quyết định, không thay thế SSOT hiện có.
> Bổ sung cho [`LANDING_PAGE_WORLD_CLASS_BENCHMARK_AND_UPGRADE_PLAN_2026-09-25.md`](./LANDING_PAGE_WORLD_CLASS_BENCHMARK_AND_UPGRADE_PLAN_2026-09-25.md) — xem §12 về các phần đã lệch (DRIFT).

---

## 0. Phương pháp & kỷ luật bằng chứng

Mọi khẳng định quan trọng đều có locator: `file:line`, ảnh chụp thật trong `test-results/`, hoặc kết quả test.

| Tình trạng | Ý nghĩa |
|---|---|
| `VERIFIED_OBSERVED` | Đọc code/đo được trong môi trường hiện tại |
| `VERIFIED_NORMATIVE` | Có quy định/tài liệu làm căn cứ |
| `ALIGNED` | Code và yêu cầu khớp |
| `DRIFT` | Hai nguồn hiện tại mâu thuẫn (đã ghi rõ bên nào đúng) |
| `HYPOTHESIS` | Có vẻ đúng nhưng chưa chứng minh |
| `UNKNOWN` | Chưa đủ bằng chứng |

**Nguyên tắc bất di bất dịch của landing:** không ghi business fact, không tạo writer mới, không đọc dữ liệu đoàn sinh. Landing là bề mặt công khai read-only. Test `landingPage.test.tsx:150-155` cấm `fetch`.

---

## 1. Current State

### 1.1 Kiến trúc

| Tầng | File | Quy mô |
|---|---|---|
| Orchestrator | `src/pages/LandingPage.tsx` | ~358 dòng |
| Component | `src/components/landing/*` | 10 file |
| Style | `src/styles/design-system/25-landing.css` | ~530 dòng, ~180 class |
| Token | `src/styles/design-system/00-tokens.css` | Tailwind v4 `@theme` — **không có `tailwind.config`** |
| Route | `src/router.tsx:125` | `/`, lazy + `PageSuspense`, **không guard** |
| Media gate | `src/components/landing/landingMedia.ts:15` | `export const landingMedia: LandingMedia = {}` |

**Không có thư viện motion nào** (`package.json`): không framer-motion, gsap, lenis, locomotive, react-intersection-observer, tailwindcss-animate. Motion = 1 rAF loop tự viết + CSS custom property + native View Transitions.

### 1.2 Thứ tự render

| # | Khối | Nội dung | Nền |
|---|---|---|---|
| 1 | Sticky header | Seal + "Xứ Đoàn Đức Mẹ Fatima" + 4 link + CTA | `parish-primary` |
| 2 | Hero (`LandingParishGlassCard`) | Ảnh tập thể 100vw + kicker + H1 + lead + 2 CTA + identity rail | ảnh + scrim navy |
| 3 | `LandingCommunityScene` | *"Một hành trình đức tin. Ba cách đồng hành."* + panel sticky + 3 chương | gradient navy |
| 4 | `#san-pham` | *"Một nền tảng. Ba cách đồng hành."* + preview pinned + 3 story | **nhảy sáng↔navy theo scroll** |
| 5 | `LandingStatsStrip` | 5 / 3 / 2 / 1 | `surface-app` |
| 6 | `LandingBranchJourney` | 5 ngành, `constants/branches.ts` | sáng |
| 7 | `LandingTrustStrip` | 4 trụ cột | sáng |
| 8 | `LandingAccessPaths` | 2 cổng + verify + onboarding 3 bước | navy |
| 9 | `LandingFAQ` | 6 câu | sáng |
| 10 | Footer | Logo + 3 nút + ownership | sáng |

`/about` (`router.tsx:442-450`) **render y hệt `LandingPage`** → nút "Giới thiệu" ở footer là một lần tải lại vô nghĩa. `routePolicy` đặt `mobileTitle: 'Giới Thiệu Catevia'` mà trang không bao giờ đọc.

### 1.3 Visual concept hiện tại

**"Editorial navy + glass + pinned product demo."** Nền tảng: ảnh thật của giáo xứ + navy sâu + gold nhạt + 3 mockup sản phẩm được ghim, đổi nền theo vị trí scroll. Ý tưởng cốt lõi — *một tấm ảnh thật, ba góc nhìn sản phẩm* — là ý đúng và đã thực thi cẩn thận.

### 1.4 Strengths — giữ nguyên, phát triển tiếp

| # | Điểm mạnh | Bằng chứng |
|---|---|---|
| S1 | **Ảnh thật của giáo xứ** — hình ảnh duy nhất không phải gradient | `public/images/xu-doan-tap-the-original.jpg` 2480×1772 |
| S2 | **CTA session-aware** + `viewTransitionName` liên tục logo→portal | `LandingPage.tsx:124`; `router.tsx:494` |
| S3 | **Tablist a11y hoàn chỉnh** — roving tabindex, Arrow/Home/End | `LandingHeroPreview.tsx:97-120` |
| S4 | **Trung thực demo**: "Số liệu demo, không phải dữ liệu thật" | `LandingHeroPreview.tsx:75` |
| S5 | **Dữ liệu thật, không bịa**: `academicYearStore`, `constants/branches.ts` (5 ngành, màu khăn quàng, châm ngôn sống) | `LandingParishGlassCard.tsx:14-16` |
| S6 | **Scene API có thể test**: 12 `data-landing-scene` + `data-active-scene` + focus line `0.47` | `LandingPage.tsx:57` |
| S7 | **Video lifecycle guard production-grade** (saveData, in-view, visibility, autoplay-reject) — chỉ chưa có asset | `LandingHeroMedia.tsx:16-54` |
| S8 | **0 thư viện motion ngoài** — ràng buộc cứng, đồng thời là lợi thế perf thật | `package.json` |
| S9 | **"Structure felt not seen"** đã xuất hiện: `gap:0` + `border-left` ở branches, `border-collapse` ở trust | `25-landing.css:342-343, 347-350` |
| S10 | Hero có `srcset` + `width/height` tường minh + `fetchpriority=high` | `LandingHeroMedia.tsx:58-68` |

### 1.5 Weaknesses

#### A. Lỗi chặn chất lượng — **đã xử lý ở Phase 0, xem §11**

W1 font không tải · W2 hero không có animation vào · W3 `animate-in`/`fade-in` là class không tồn tại · W4 reduced-motion nhận layout khác và hỏng · M6 `scroll-padding-top` (hoá ra **đã có sẵn** — báo cáo ban đầu sai).

#### B. Lỗi bố cục & thị giác (còn mở)

| ID | Vấn đề | Bằng chứng |
|---|---|---|
| **W5** | **Đổi nền full-viewport theo scroll = nháy màn hình.** `data-active-story='organization'` lật nền navy; 3 chuyển trạng thái nền chồng lên nhau | `25-landing.css:205, 211-215, 490-493` |
| **W6** | **Khoảng trống dọc lớn.** `min-height: 82svh/83svh` + `justify-content:center` nhưng khối copy chỉ ~330px → ~200px trống trên + dưới | `25-landing.css:195, 223` |
| **W7** | **Preview pinned không ngang hàng copy.** `top: 5.5rem` → preview ~180px, copy ~295px, lệch 115px | `25-landing.css:239`; `desktop-academic.png` |
| **W8** | **Ngắt dòng H1 vỡ.** `max-width:17ch` + 2 span → desktop cắt đứt "Thiếu Nhi"; 320px thành 4 dòng | `LandingParishGlassCard.tsx:40-45`; `320-hero.png` |
| **W9** | **Crop ảnh hero kém.** Biển ngữ nhà thờ chiếm phần trên; `object-position: 50% 42%` | `LandingHeroMedia.tsx:67`; `25-landing.css:176` |
| **W10** | **`.landing-community__visual-mark` không đọc được** — absolute `top/left 1.5rem` đè lên biển ngữ trong ảnh | `25-landing.css:187`; `desktop-community-gather.png` |
| **W11** | **5 ngành vỡ ở 768px.** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5` — 5 không chia hết cho 2 → ô trống, Hiệp Sĩ mồ côi | `LandingBranchJourney.tsx:51`; `768-branches.png` |
| **W12** | **TSX và CSS nói hai ngôn ngữ.** `gap-3.5 sm:gap-4` bị `25-landing.css:342` `gap:0` vô hiệu (unlayered CSS thắng Tailwind `@layer utilities`). `LandingTrustStrip.tsx:57` khai `card-interactive hover:-translate-y-1` rồi bị `25-landing.css:350` hủy | đã verify bằng ảnh |
| **W13** | `.landing-access__eyebrow { margin-top: 2.3rem }` → ~60px trống lơ lửng | `25-landing.css:361` |
| **W14** | `<ul>` access thành dòng thụt lề không marker — Tailwind preflight `list-style:none` + còn `padding-left:1rem` | `25-landing.css:364` |
| **W15** | Trang trí không lý do: `i` 2px cam dưới số liệu; hard-shadow `1rem 1rem 0`; macOS 3-dot topbar | `25-landing.css:281, 248, 259-262` |
| **W16** | **Ảnh LCP 800 KB**, không preload, không AVIF/WebP. `landingPage.test.tsx:161-164` hard-assert nên không sửa được nếu không cập nhật test | `LandingHeroMedia.tsx:59` |

#### C. Lỗi trải nghiệm (một cái **đã fix** ở Phase 0)

| ID | Vấn đề | Trạng thái |
|---|---|---|
| ~~W17~~ | **Tên Xứ Đoàn bị `truncate` thành "..."** trên mobile — 320px hiện `"XỨ ĐOÀN..."` | **Mở** — `LandingPage.tsx:141-146` |
| **W18** | 9/10 chuyển tiếp bằng `gap: clamp(4rem,8vw,8rem)` — tức khoảng trắng | Mở |
| **W19** | Không scrollspy ở header dù `data-active-scene` đã có | Mở |
| **W20** | Mobile không có affordance "đang ở chặng nào" | Mở |
| ~~W21~~ | **`/about` render y hệt `LandingPage`** | Mở — `router.tsx:442-450` |
| **W22** | **BUG THẬT — menu mobile làm scroll overshoot.** Menu nằm trong normal flow của header sticky (65px → 326px → 65px). `handleNavClick` gọi `setIsMobileMenuOpen(false)` + `scrollIntoView` cùng tick → scroll đo đích khi header cao, menu unmount, mọi thứ bị kéo lên ~261px, h2 landing ở **y=8px — bị header 64px che**. Đo thật, đã fix bằng 2× `requestAnimationFrame` | ✅ **ĐÃ FIX** |

### 1.6 Code health

| Vấn đề | Bằng chứng |
|---|---|
| `LandingFaithMoment.tsx` — **0 importer** (orphan) | grep toàn repo |
| `src/assets/hero.png` (13 KB) — **orphan Vite template leftover, tím neon**. Tôi đã mở xem: 3 lớp hình vuông glow tím. **LỆCH HOÀN TOÀN — tuyệt đối không dùng** | mở file |
| `app-logo.png` **1,26 MB** orphan; `logo-gia-ton.jpg/128/256/512.png`, `react.svg`, `vite.svg`, `public/sw.js`, `favicon-32x32.png` orphan | ~1,85 MB thu hồi được |
| **Không có video nào** → toàn bộ `.landing-hero-video` / `.landing-video-control` chết lúc runtime | `landingMedia.ts:15` |
| Class chết: `scrolly-story-rail`, `landing-cinematic__stage`, `scene-hero-stage/content/bg`, `preview-panel-fade`, `branch-track-animated` | không định nghĩa ở đâu |

---

## 2. Core Identity

### 2.1 Điều gì làm trang này KHÔNG phải template SaaS

| ID | Yếu tố | Vì sao không template được | Đang bị dùng ra sao |
|---|---|---|---|
| I1 | **Ảnh thật 30+ em + GLV + cha sứ** | Không thể fake | Làm **background phủ scrim**. Bị giấu. |
| I2 | **Mặt dấu Giáo Xứ Gia Tôn** | | Header 40px — hợp lệ |
| I3 | **5 màu khăn quàng chuẩn TNTT** | Chuẩn phục việc, không phải lựa chọn thiết kế | **3px viền trên + 1 chấm tròn**. Đang là màu trang trí. |
| I4 | **5 châm ngôn sống**: "Hiền lành", "Ngoan", "Hy sinh", "Chinh phục", "Dấn thân" | Văn hóa Gia đình chúa Giêsu thật | **Chữ xám 12px** trong card |
| I5 | **Bổn mạng Đức Mẹ Fatima 13/5 · 4 Tôn Chỉ TNTT** | | **12px** trong figcaption hero |
| I6 | **Niên khóa sống** từ `academicYearStore` | Dữ liệu thật, đổi theo năm | Chỉ ở glass rail + 3 demo |
| I7 | **Từ vựng Công Giáo VN**: chuyên cần, chi đoàn, đoàn sinh, niên khóa, GLV, Huynh Trưởng, Ban Điều Hành | | Dùng đúng — điểm mạnh thật |
| I8 | **"Dữ liệu thuộc về Xứ Đoàn"** | Không SaaS nào dám viết | Footer 12px |
| I9 | **"Số liệu demo, không phải dữ liệu thật"** | | 10px footnote |
| I10 | **Phạm vi nhỏ & cụ thể**: MỘT giáo xứ, MỘT xứ đoàn, MỘT linh mục | Đây là câu chuyện, không phải thị trường | Không được tận dụng |

### 2.2 Bảo tồn bắt buộc

1. Ảnh tập thể thật làm **chủ thể trung tâm**, không phải texture nền.
2. 5 màu khăn quàng là **hình ảnh chính**, không phải accent.
3. 5 châm ngôn sống phải **typographically nổi bật**.
4. Bổn mạng + 4 Tôn Chỉ ở **tầm đọc thứ nhật**, không phải footnote.
5. Niên khóa sống từ store.
6. **Mọi câu chữ mục vụ phải được Ban Giáo Lý duyệt.**
7. "Số liệu demo" + "Dữ liệu thuộc về Xứ Đoàn" phải còn và nên **nâng thành hệ thống**.
8. Tiếng Việt, một ngôn ngữ. Không i18n.
9. Zero fetch, zero thư viện motion ngoài.
10. **Tuyệt đối không** bịa testimonial, số liệu vận hành, hay quote phụ huynh.

---

## 3. UX & Visual Diagnosis

### 3.1 Hierarchy

- **H1 quá to, quá nặng, sai giống** — `font-black` + `tracking-tight` + `letter-spacing:-0.055em`. Ở 1440px chiếm 3 dòng × 72px giữa ảnh. Giọng **startup**, không phải giọng **sở đoàn**.
- **Ba cấp tiêu đề cùng giọng** — H1, `.landing-product-intro h2` (clamp 6rem, 900), `.landing-access__intro h2` (clamp 5.6rem). Cùng `font-weight:900`, cùng `letter-spacing:-0.055em`. Chỉ khác kích thước → không có phân cấp thị giác.
- **4 CTA cạnh tranh ngang hàng** — hero 2, header 1, access 2 (1 primary + 1 secondary nhưng cùng full-width, cùng cỡ). Không tín hiệu nào cho biết phụ huynh hay người phục vụ là đường chính.
- **Headline "01 / 03" lặp 2 lần không phân biệt** — cùng style, cùng gold, ở Story A lẫn Story B.

### 3.2 Composition

- **Hai narrative cạnh tranh, không nối tiếp.** Story A *"Một hành trình đức tin. **Ba cách đồng hành**"* (gather/learn/family) và Story B *"Một nền tảng. **Ba cách đồng hành**"* (academic/organization/parent). Cùng công thức, cùng số 3, cùng motif đếm. Chương `community-learn` và story `academic` phủ **cùng một lãnh thổ**, cách nhau ~1.5 màn hình, bằng hai ngôn ngữ thị giác khác nhau, **không có gì thừa nhận sự lặp lại**.
- **"Ba" xuất hiện 4 lần** + `LandingStatsStrip` kể lại "3 không gian làm việc".
- **768px vỡ** (W11) · **hai cột lệch 115px** (W7) · **3 lần đổi nền full-viewport** (W5) · **3 khối giữa trang chỉ cách nhau bằng khoảng trắng**.

### 3.3 Typography

- **Sau Phase 0: font đã tải thật.** Inter + Playfair Display đã render (verify bằng ảnh: Didone letterform trên tên 5 ngành và số `5 3 2 1`; Inter trên heading/body). *Trước đó toàn bộ 9 bề mặt serif rơi về Georgia.*
- **Phân bổ ngược hợp lý:** serif bị đẩy xuống số nhỏ (`09`, `5 3 2 1`, tên ngành); **toàn bộ tiêu đề lớn dùng sans nặng**. Một trang Công Giáo VN sẽ nổi bật hơn nhiều nếu serif giữ **giọng display** còn sans giữ **giọng giao diện**.
- **3 giá trị tracking khác nhau cho cùng một vai trò eyebrow** (`.05em` vs `.13em` vs `.16em`).
- **`font-weight: 850` / `750`** — trọng số không tồn tại trong stack trước đây → browser synthesize. Lưu ý: **sau khi self-host font variable (M1 còn mở) thì 750/850 sẽ hợp lệ**; nếu giữ Google Fonts thì vẫn sai.
- Cỡ chữ demo **0.6–0.68rem** (9.6–10.9px) ở nhiều chỗ.

### 3.4 Color

| Vấn đề | Chi tiết |
|---|---|
| **Header cắt ngang trang** | `bg-parish-primary` (#1E3A8A) xanh royal sáng ngay dưới hero navy sâu. Nên là navy. |
| **Token ở 2 vị trí** | `--landing-navy/--landing-deep/--landing-gold` định nghĩa **cục bộ trên `.landing-page`** chứ không trong `@theme` → phải patch `.dark .landing-page` thủ công. `25-landing.css:72-79` |
| **Gold vừa accent vừa màu chữ display cỡ lớn** | `--landing-gold` = `#FEF3C7` (kem nhạt), dùng cho `& Thiếu Nhi Thánh Thể` 40–72px **trên ảnh**. Axe **không kiểm được** chữ trên nền ảnh (báo "incomplete", không phải violation) → **rủi ro chưa đo**. |
| **3 full-viewport background flips** | W5 |

### 3.5 Spacing

- **3 hệ gutter khác nhau** trên cùng trang: community `clamp(1.25rem,5vw,5rem)` vs header/footer `px-4 sm:px-8 lg:px-12 2xl:px-16` vs final-sequence `px-3.5 ...`.
- `gap: 0` ở branches/trust là kỹ thuật "felt not seen" **tốt**, nhưng TSX vẫn khai gap → người đọc code sẽ sửa sai (W12).

### 3.6 Imagery

- **Chỉ một ảnh thật** trên toàn trang, dùng lại 3 lần.
- 2 bản 1600w (269 KB) + 2480w (800 KB). Không AVIF/WebP, không `<picture>`, `sizes="100vw"` (W16).
- `saturate(0.85)` + `filter` trên community panel → **lấy đi sự sống** khỏi tài nguyên thật duy nhất. Hướng ngược lại đúng.
- `hero.png` tím neon là orphan — **xoá để tránh bị dùng nhầm**.

### 3.7 Responsive

| Width | Hành vi | Vấn đề |
|---|---|---|
| ≥1024 | 2 cột A + B, preview pinned | W5, W6, W7 |
| **768** | `lg:hidden` → hamburger; `sm:grid-cols-2` | **W11 — ô trống, Hiệp Sĩ mồ côi** |
| 390 | Sequential, demo inline | W17 header truncate |
| **320** | Sequential | Header chỉ còn `"XỨ ĐOÀN..."`; H1 4 dòng |
| **Desktop + reduced-motion** | ~~layout mobile~~ | ✅ **ĐÃ FIX ở Phase 0** |

Không có tầm trung 3–4 cột; nhịp 1→2→5 là một cú nhảy.

### 3.8 Accessibility

**Tốt:** skip link · `aria-labelledby` mọi section · một `<figure>` duy nhất · phân cấp h1/h2/h3 test-lock · tablist roving-tabindex · FAQ `aria-expanded`/`aria-controls` · `role=region` có nhãn · target ≥44px @320 · axe-zero 3 viewport × 2 theme · không overflow ngang @320 · `scroll-padding-top` đã có.

**Còn lại cần sửa:**
- **W17** — truncate phá ý nghĩa nhận diện chính (WCAG 1.3.1).
- **Chữ trên ảnh chưa được đo** — axe không kiểm được; cần đo tay ≥4.5:1.
- `.skip-link` dùng `:focus` không phải `:focus-visible`, không transition.
- W14 — `<ul>` mất marker.

### 3.9 Perceived quality

Khoảnh khắc mạnh nhất: `desktop-community-learn.png` — thẻ trắng nổi trên navy, viền gold. Hình ảnh duy nhất cảm thấy *đắt*.
Khoảnh khắc yếu nhất: `desktop-academic.png` — nền `#F7F8FB` phẳng, hai cột lệch nhau, giữa trang trống.

**Chẩn đoán gốc:** trang có **một** khoảnh khắc cảm xúc (ảnh thật ở hero) và dùng **80% độ dài còn lại để không có khoảnh khắc nào**. Với sản phẩm tồn tại vì cộng đoàn của trẻ em thật, đây là điểm yếu **chiến lược**, không chỉ thẩm mỹ.

---

## 4. Motion & Interaction Diagnosis

### 4.1 Motion **đang chạy**

| Chuyển động | Cơ chế | Ghi chú |
|---|---|---|
| Hero parallax `scale(1→1.055)`, copy shift, scrim ramp | rAF ghi `--hero-photo-scale` / `--hero-copy-shift` / `--hero-scrim-opacity` | Chạy trên compositor |
| Community panel cross-fade `opacity` + `scale(1.045→1)` 650/900ms | `data-active-scene` | 3 panel |
| Copy drift `--scene-shift: 28px→0` | rAF, gate viewport | community + 3 story |
| `landingPreviewEnter` 450ms | CSS keyframe | ổn |
| Route View Transition + `viewTransitionName` | Native API | tốt |
| **Hero entrance stagger 0.05→0.46s** | ✅ **Phase 0** | `25-landing.css`, hữu hạn |
| **`.animate-in` / `.fade-in`** | ✅ **Phase 0** | 11 chỗ trong repo trở nên hoạt động |

### 4.2 Motion **đáng lẽ có nhưng đã thiếu**

| Mất | Trạng thái |
|---|---|
| Hero entrance stagger | ✅ **ĐÃ THÊM** (Phase 0) |
| FAQ open/close, mobile menu | ✅ **ĐÃ THÊM** (Phase 0) |
| Reveal cho branches / trust / access / FAQ | **Mở** |
| Scrollspy ở header | **Mở** (W19) |
| Hover feedback ở trust cards | **Mở** — bị CSS hủy (W12) |

### 4.3 Chỗ motion nên cải thiện

1. **Đo lại `read-then-write` trong rAF.** `getBoundingClientRect()` trên **12 scene mỗi frame không điều kiện** (vòng `nearest` không gate viewport), rồi `style.setProperty` ngay sau. An toàn (custom property → compositor) nhưng vẫn 12 forced-layout read/frame. Nên cache rect trong `IntersectionObserver`.
2. **Hai cột phải trục căn** theo cùng `focusLine` → mất W7.
3. **Giảm 82svh/83svh** → cột bám nội dung có nhịp thở (W6). Motion hay nhất là **khoảng lặng có chủ đích**, không phải khoảng trống do min-height sinh ra.
4. **Reveal 1-shot, hữu hạn** cho 4 section cuối: `opacity 0→1` + `translateY(12px→0)`, 400ms, token `--motion-standard`/`--motion-ease-out`, `IntersectionObserver` + `once`.
5. **Đổi nền → thay màu có chủ đích** (W5).
6. **Progress rail ở header** bằng `transform: scaleX()` (compositor, không layout shift) — dùng `data-active-scene` đã có sẵn.
7. **Header đổi trạng thái khi cuộn** — rẻ, hiệu quả cao trên mobile dài 4 màn.

### 4.4 Animation **không** nên dùng

- ❌ Parallax phần đuôi (branches/trust/access) — W6 đã là khoảng trống.
- ❌ Reveal lặp lại khi scroll ngược.
- ❌ Stagger dài >600ms tổng ở hero — LCP phải là **ảnh**, không phải chữ.
- ❌ Bất kỳ thư viện motion nào (Q14 = 0, hard requirement).
- ❌ Bất kỳ animation vô hạn nào trên scroll (Q13 ≤ 3 vùng).
- ❌ `scroll-jacking`, `ViewTimeline` phụ thuộc, WebGL, 3D.
- ❌ `will-change` thường trú.

> **Kinh nghiệm Phase 0:** thêm animation vào hero làm axe đo **giữa animation** và báo contrast sai (pattern R-02 đã ghi ở plan 2026-09-25). Đã sửa bằng `settleFiniteAnimations` trong `openLanding`. **Mọi axe scan mới phải settle trước khi scan.**

---

## 5. Storytelling & Page Flow

### 5.1 Hành trình `arrival → impression → identity → story → discovery → trust → action`

| Bước | Kỳ vọng | Thực tế |
|---|---|---|
| **arrival** | Ghi nhận "đây là của Xứ Đoàn tôi" | Header đúng tên nhưng bị truncate trên mobile (W17) |
| **first impression** | Cảm xúc, ký ức | ✅ Mạnh — ảnh thật. Nhưng bị scrim 0.72→0.97 làm phẳng |
| **identity** | "Tôi là ai trong câu chuyện này" | Bổn mạng + 4 Tôn Chỉ **đẩy xuống 12px**. Yếu nhất, dù quan trọng nhất. |
| **product story** | "Catevia làm gì cho tôi" | Story A rồi Story B — **trùng lặp, không nối** |
| **feature discovery** | "Tính năng cụ thể" | 3 demo ổn nhưng **không tính năng nào được giải thích cụ thể** |
| **trust** | "Tin được không" | 4 trụ cột đúng nội dung, trình bày như 4 card trắng. **Không testimonial, không ảnh thật, không số** — và không được phép bịa. |
| **action** | "Làm gì tiếp" | 2 cổng + verify + onboarding, nhưng **đặt ở vị trí 8/10, bị kẹp giữa hai khối tham chiếu** |

### 5.2 Đoạn flow yếu

| Đoạn | Vấn đề |
|---|---|
| hero → community | ✅ Xử lý tốt nhất (`scene-hero-bottom-veil`) |
| community → cinematic | Đổi nền full-viewport đột ngột; hai cột trống (W5, W6) |
| cinematic → stats | `landing-afterglow` hợp lý, nhưng stats chỉ là 4 con số không kể chuyện |
| **stats → branches → trust → access → FAQ** | **4 chuyển tiếp bằng khoảng trắng** |
| branches @768 | Vỡ bố cục (W11) |
| trust | 4 card trắng, hover bị hủy, 0 reveal |
| access | 2 navy liền nhau; W13, W14 |
| FAQ → footer | Khối **template nhất** trên trang — accordion số + chevron, không có tính cách |

### 5.3 Đề xuất nối section

1. **Bỏ nhân bản số 3.** Hợp nhất Story A + Story B thành **một trục 3 chặng**, mỗi chặng = cảnh Xứ Đoàn + màn hình Catevia tương ứng. Ràng buộc: `data-landing-scene` là **test API** → ưu tiên **đổi nội dung** giữ đủ 12 id; sửa test là task riêng có kiểm soát.
2. **Lưới "gold hairline" làm đường may** — 1px dưới mọi eyebrow, nối liền section. Chi phí ~0, hiệu ứng "một trang, một câu chuyện" rất mạnh.
3. **`LandingStatsStrip` thành proof rail** chèn giữa product story và trust (đúng vị trí Stripe đặt proof).
4. **Một khoảnh khắc "Chúa nhật" duy nhất** giữa product story và access — nơi duy nhất được phép chậm lại.
5. **Access = đỉnh.** Navy đậm nhất dành riêng cho CTA, đặt **ngay trước** FAQ; **chuyển branches + trust xuống dưới FAQ** hoặc gộp thành khối reference gọn ở chân trang. Lý do: hiện người dùng phải đi qua 2 khối tham chiếu trước khi tới quyết định.
6. **Gộp FAQ + Trust** thành một Q&A ba tầng.

---

## 6. Upgrade Direction

> ### **"MỘT GIÁO XỨ, MỘT CĂN NHÀ THỜ"**
> *Không phải landing page của sản phẩm. Là một lời mời bước vào một sân nhà thờ cụ thể, vào một Chúa nhật cụ thể, để gặp 30 đứa trẻ đang lớn lên ở đó.*

**Vì sao hợp với Catevia.** Sản phẩm không có thị trường, không đối thủ, không pricing. Nó có **một giáo xứ, một xứ đoàn, một linh mục, vài chục GLV, vài trăm gia đình**. Toàn bộ lợi thế cạnh tranh nằm ở **mức độ tin cậy và mức độ thuộc về**. Hướng này cũng **ràng buộc** tốt: nó cấm neon, gradient mesh, glassmorphism quá tay, bịa testimonial — tức là tự bảo vệ khỏi trôi về generic.

**Cảm giác mong muốn:** ấm · chậm · có thẩm quyền · như bước vào nhà thờ mùa Chúa nhật.

### Sáu nguyên tắc thị giác

**V1 — Ảnh là một nơi, không phải một nền.** Bỏ scrim nặng; tone ấm hơn (đang `saturate(0.85)` — hãy tăng); chữ đặt trên vùng tối có dựng; caption rail thật sự. `landing-hero-identity` là một `<figcaption>` 12px **đúng chỗ** — chỉ cần đưa lên tầm đọc identity chính.

**V2 — Khăn quàng là xương sống.** 5 màu chuẩn thành **hình ảnh chính**: dải khăn quàng liên tục (desktop ngang / mobile dọc), 5 chặng là 5 lớp màu, tên + châm ngôn sống trên dải. Dải cũng **là** đường may nối section.

**V3 — Sáng làm chính, navy làm đỉnh.** Navy đậm dành cho **đúng ba** chỗ: hero, khoảnh khắc "Chúa nhật", khối CTA cuối. Bỏ các cú nhảy nền full-viewport. Lợi ích ba lớp: ấm hơn, đọc dễ trên điện thoại rẻ trong nhà thờ sáng, repaint rẻ hơn.

**V4 — Serif giữ giọng display.** Sau khi font tải đúng: serif cho tên Xứ Đoàn, tiêu đề section, châm ngôn sống, số lớn; sans cho UI chrome, mockup, body.

**V5 — Chiều sâu đến từ phân lớp, không từ hiệu ứng.** Nền giấy trắng · một họ shadow mềm · hairline `surface-border` · **một gold hairline** làm motif liên tục. Kỹ thuật "felt not seen" đã có ở branches và trust — **phổ biến ra toàn trang**.

**V6 — Trung thực là thành phần thị giác.** Chip "minh họa" nhỏ, cùng vị trí, cùng cỡ trên mọi mockup; tuyên bố sở hữu dữ liệu nâng thành dải riêng.

### Một interaction, thực thi thật

Giữ và làm **một** ý tưởng: **tablist + preview pinned + scene sync**. Nó tốt. Bổ sung: tab click → cuộc tới story (đã có), phím tắt, **progress rail ở header**. Không thêm scrolly thứ hai.

### Những gì tuyệt đối không làm

❌ neon/cyberpunk · gradient mesh · tím (`hero.png` orphan phải **xoá**) · glassmorphism quá tay
❌ thư viện motion ngoài (Q14 = 0) · scroll-jacking · WebGL/3D
❌ video cho tới khi giáo xứ duyệt clip thật (giữ gate `landingMedia`)
❌ **bịa testimonial / số liệu vận hành / quote phụ huynh**
❌ palette mới — làm việc trong `00-tokens.css` và **bổ sung** vào đó
❌ redesign riêng cho dark mode — sửa token, tái dùng layout
❌ analytics

---

## 7. Detailed Upgrade Plan

### Phase 0 — Khôi phục hiện thực ✅ **ĐÃ XONG** (xem §11)

### Phase 1 — Trục thị giác & hệ thống

| | |
|---|---|
| **Mục tiêu** | Đặt nền token/typographic/color để các phase sau chỉ lắp ghép |
| **Phạm vi** | `00-tokens.css`, `10-foundations.css`, `25-landing.css`, `LandingBranchJourney`, `LandingTrustStrip`, `LandingAccessPaths`, `LandingStatsStrip` |
| **Vấn đề** | §3.3 (serif ngược), §3.4 (token 2 nơi), §3.5 (3 gutter), §3.1 (3 tiêu đề cùng giọng), W11, W12, W13, W14 |
| **Hướng thiết kế** | 1) Nâng `--landing-*` vào `@theme`, xoá `.dark .landing-page` patch. 2) Một giá trị tracking eyebrow. 3) Một hệ gutter. 4) Cân nhắc bỏ `font-weight` 850/750 hoặc chờ self-host variable font. 5) Header navy thay vì primary. 6) Bỏ margin 2.3rem; thay `<ul>` access bằng pattern có marker thật. 7) Xoá `gap` chết trong TSX **hoặc** khai lại đúng. 8) Thêm bậc 3–4 cột cho branches. 9) Áp lại hover affordance cho trust, hoặc bỏ `card-interactive` khỏi JSX và dùng primitive đúng cách |
| **Motion** | Reveal 1-shot cho 4 section cuối (`IntersectionObserver` + `once`, 400ms, token có sẵn) |
| **Kỹ thuật** | Ưu tiên `.typography-*` sẵn có ở `10-foundations.css` thay vì `clamp()` riêng. `25-landing.css` unlayered → muốn Tailwind utility thắng phải bọc trong `@layer` |
| **A11y** | axe-zero; re-verify contrast sau khi đổi gutter/màu |
| **Perf** | Không tăng CSS bundle quá baseline (Q12) |
| **Impact** | Cao. Trang trông "có hệ thống" thay vì "ghép từ nhiều ý tưởng" |

### Phase 2 — Cấu trúc narrative & dải khăn quàng ⭐

| | |
|---|---|
| **Mục tiêu** | Chấm dứt trùng lặp "Ba cách đồng hành"; biến 5 ngành thành hình ảnh chính |
| **Phạm vi** | `LandingCommunityScene`, `LandingWorkspaceStories`, `LandingBranchJourney`, `LandingPage.tsx`, `25-landing.css` |
| **Vấn đề** | W5, W6, W7, W8, W11, W18, §3.2, §5.2 |
| **Hướng thiết kế** | 1) Hợp nhất A+B thành một trục 3 chặng, giữ đủ 12 `data-landing-scene`. 2) Dải khăn quàng thay 5 card trắng. 3) Căn preview theo cùng `focusLine`. 4) Bỏ `min-height: 82/83svh`. 5) Sửa ngắt dòng H1. 6) Thay nhảy nền bằng **chuyển màu liên tục** |
| **Motion** | Giữ panel cross-fade. Thêm chuyển màu nền theo tiến độ chặng; dải "keo" khi cuộn; reveal 1-shot mỗi chặng |
| **Kỹ thuật** | `landing-cinematic.spec.ts` assert: hero↔community **flush ≤1px**; preview **64–160px** @1440; shell parent **<80%** academic; tablist+shell vừa **64–720px** @1280×720. **Mọi thay đổi cao tới đây là thay đổi hợp đồng test.** Cân nhắc `@supports (animation-timeline: view())` cho dải |
| **A11y** | Copy luôn `opacity: 1` khi reduced-motion; **đo thật** contrast nền tối/sáng |
| **Perf** | Ribbon bằng gradient + border thuần CSS, **không SVG filter, không ảnh** |
| **Impact** | **Cao nhất** — biến trang từ "tập hợp section" thành "một câu chuyện" |

### Phase 3 — Ảnh thật, khoảnh khắc Chúa nhật, CTA crescendo ⭐

| | |
|---|---|
| **Mục tiêu** | Tạo khoảnh khắc cảm xúc duy nhất; sửa ảnh hero; làm CTA thành đỉnh |
| **Phạm vi** | `LandingHeroMedia`, `LandingParishGlassCard`, `LandingFaithMoment` (**orphan — hồi sinh thay vì viết mới**), `LandingAccessPaths`, `public/images/*` |
| **Vấn đề** | W9, W10, W16, W17, W20, W21, §3.6, §5.1 |
| **Hướng thiết kế** | 1) Crop ảnh có chủ đích. 2) Bỏ scrim nặng; bỏ `saturate(0.85)`. 3) Bổn mạng + 4 Tôn Chỉ + Niên khóa lên tầm đọc identity. 4) `.landing-community__visual-mark` đổi chỗ. 5) **Hồi sinh `LandingFaithMoment`** làm khoảnh khắc Chúa nhật. 6) **CTA crescendo** + microcopy "Tài khoản do Xứ Đoàn cấp — không cần tự đăng ký". 7) Header: 2 dòng wrap thay vì ellipsis ở ≤640px. 8) Ảnh: AVIF/WebP + `srcset` 640/828/1280/1600, `sizes` theo khung thật, giữ `width/height` |
| **Motion** | Khoảnh khắc Chúa nhật: reveal rất chậm, 1-shot, không lặp |
| **Kỹ thuật** | Hero CTA ≥44px @320; mọi button `#cong-dang-nhap` ≥44px; `img[...][width=2480][height=1772][fetchpriority=high]` + alt khớp regex — nhưng `src` **được đổi** nếu đổi ảnh LCP. Cân nhắc `sharp` devDependency (D-03) |
| **A11y** | **Đo contrast thật cho chữ trên ảnh** ≥4.5:1 (axe không làm được). Kiểm 2.4.11 |
| **Perf** | Hero mobile ≤70KB, desktop ≤150KB (Q10) |
| **Impact** | Cao |

### Phase 4 — Tương tác & consolidation phần đuôi

| | |
|---|---|
| **Mục tiêu** | Một interaction thật; nửa sau trang có nhịp |
| **Phạm vi** | `LandingPage.tsx`, `LandingTrustStrip`, `LandingFAQ`, `LandingStatsStrip`, `25-landing.css` |
| **Vấn đề** | W12, W19, W20, §5.2, W21 |
| **Hướng thiết kế** | 1) Progress rail header bằng `transform: scaleX()`. 2) Header đổi trạng thái khi cuộn. 3) Mobile: affordance "đang ở chặng nào". 4) Gộp Trust + FAQ; Stats thành proof rail. 5) `/about`: route riêng hoặc bỏ nút. 6) Sticky CTA mobile **chỉ khi** chưa có giải pháp tốt hơn |
| **Motion** | FAQ mở/đóng bằng `grid-template-rows: 0fr→1fr` (không đo height bằng JS). Rail 120–180ms. Không animation vô hạn |
| **Kỹ thuật** | `landingPage.test.tsx` khóa **đúng 6** câu FAQ. Sticky CTA phải tôn trọng `env(safe-area-inset-bottom)` và **không che focus** |
| **A11y** | `aria-expanded` round-trip là hợp đồng test |
| **Impact** | Trung bình–cao |

### Phase 5 — Thị giác có kiểm soát

Đo LCP/INP/CLS thật (chưa từng đo). Nếu tốt rồi mới thử: `@supports (animation-timeline: view())` cho hero; grain/paper rất nhẹ; **video tour chỉ khi giáo xứ duyệt clip thật**. Ràng buộc: Q13 ≤ 3 vùng vô hạn, Q14 = 0, không palette ngoài `00-tokens.css`.

---

## 8. Priority

### Must improve — **đã xong ở Phase 0**

| | Task | Kết quả |
|---|---|---|
| M1 | Font Inter + Playfair tải thật | ✅ **XONG — self-host** (§11.1) |
| ~~M2~~ | Reduced-motion = cùng layout, chỉ bỏ motion | ✅ xong |
| ~~M3~~ | Khai báo `hero-enter-*` + `animate-in`/`fade-in` | ✅ xong |
| ~~M6~~ | `scroll-padding-top` | ✅ **đã có sẵn** — báo cáo ban đầu sai |
| M7 | Đo baseline perf trước khi đặt mục tiêu | **Mở** |
| M8 | Chốt D-01 (kênh hỗ trợ + proof nào được công bố) | **Mở** — BLOCKING về thẩm quyền |

### High impact

H1 Hợp nhất Story A + B, bỏ trùng lặp · H2 Dải khăn quàng (V2) · H3 Bỏ 3 cú nhảy nền (V3) · H4 Giảm khoảng trống + căn 2 cột · H5 Sửa ngắt dòng H1 + crop ảnh · H6 Ảnh responsive thật · H7 Identity rail lên tầm đọc · H8 Hồi sinh `LandingFaithMoment` · H9 Gộp Trust+FAQ, stats thành proof rail, CTA crescendo · H10 Progress rail + header state · H11 Token vào `@theme`, thống nhất type ladder + gutter

### Nice to have

Thanh tiến trình trong hero demo · Reveal 1-shot phần đuôi · Gold hairline đường may · Chip "minh họa" thống nhất · Phím tắt tabs · `/about` gọn hoặc bỏ · Chấm ngành dạng texture

### Experimental

`@supports (animation-timeline: view())` thay rAF cho parallax hero · Video tour (**chỉ khi giáo xứ duyệt clip thật**) · Scroll-snap nhẹ cho dải khăn quàng · 2–3 `object-position` có chủ đích · Grain/paper texture

> ⚠️ **Không cái nào ở Experimental được đi trước khi Phase 0–1 xong.**

---

## 9. Risks

| # | Rủi ro | Mức | Kiểm soát |
|---|---|---|---|
| **R1** | **Phá hợp đồng test** | 🔴 Cao | `landing-cinematic.spec.ts` khóa: hero↔community flush ≤1px; preview 64–160px @1440; shell parent <80%; tablist+shell vừa 64–720px @1280×720; 12 `data-landing-scene` + `data-active-scene` + `data-motion-ready`; focus line `0.47`; axe 0 violation 3 viewport × 2 theme. `landingPage.test.tsx` khóa h1 "quản lý giáo lý", `<figure>` duy nhất, 5 nhánh, 6 FAQ, 4 label stats, `innerHTML` không hex, **zero fetch**, src/width/height ảnh hero |
| **R2** | **Phân mảnh design system** | 🔴 Cao | ~180 class landing lặp token đã có (`.landing-eyebrow` vs `.typography-label`…). `LandingTrustStrip` dùng `.card-interactive` rồi bị CSS hủy. Token landing ở `.landing-page` thay vì `@theme`. → Ưu tiên primitive có sẵn |
| **R3** | **Visual over-design** | 🟠 TB–Cao | Trang đã ở mức "nhiều motif". → **Tối đa 1 interaction mới + 1 reveal mới mỗi phase.** Dừng nếu không phục vụ V1–V6 |
| **R4** | **Mobile regression** | 🟠 TB | Đã có guard: overflow @320, CTA 44px, demo vừa viewport, tab bấm phải cuộn tới `#tieu-de-san-pham`. Dải khăn quàng dọc là thay đổi bố cục mobile thật sự → nguy cơ overflow mới |
| **R5** | **Performance regression** | 🟠 TB | Rủi ro chính **không phải JS** (zero-dep) mà là: nền chuyển động repaint diện tích lớn, nhiều gradient/filter, `will-change` thường trú |
| **R6** | **Accessibility** | 🟠 TB | Đã sửa xong reduced-motion. Còn: chữ trên ảnh **axe không kiểm được** → phải đo tay. Bất kỳ `!important` mới trong 4 lớp kill-list sẽ âm thầm phá motion của người KHÔNG bật reduced-motion |
| **R7** | **Maintenance complexity** | 🟡 Thấp–TB | 5 class chết trong TSX + `gap` chết + `LandingFaithMoment` orphan + 1,85 MB asset orphan (`hero.png` tím neon là **bẫy**) |
| **R8** | **Nội dung mục vụ chưa duyệt** | 🟠 TB | Bổn mạng, Tôn Chỉ, châm ngôn sống, tên chi đoàn. **Copy mới phải qua Ban Giáo Lý.** Không hứa quy trình không tồn tại |
| **R9** | **Ước lượng sai** | 🟡 Thấp | Baseline perf **chưa từng đo**. Mọi ngưỡng là CANDIDATE. Lab ≠ field |
| **R10** | **Làm việc song song** | 🔴 Cao | **Đã xảy ra:** có session khác sửa `server/`, `.github/workflows/`, `deploymentSecurityContract.test.ts` trong lúc Phase 0 chạy. Phải commit/branch trước khi bắt đầu phase mới |
| **R11** | **Axe đo giữa animation** | 🟡 Thấp | Đã xảy ra ở Phase 0. Mọi axe scan mới **phải settle trước** |

---

## 10. Recommended Execution Order

| Bước | Nội dung | Gate trước khi sang bước sau |
|---|---|---|
| **0. Đóng băng** | Commit/branch worktree | `git status` sạch |
| **1. Đo baseline** (M7) | Lighthouse mobile + desktop; LCP/INP/TBT/CLS + LCP element + payload; đo contrast tay cho chữ trên ảnh. Chốt D-01 | Artifact đo kèm commit + ngày |
| ~~2. M1 — Font self-host~~ | ✅ ĐÃ XONG (§11.1) — vendor 6 WOFF2 variable, `@font-face`, preload 2 file, PWA precache, gỡ Google, + regression test | axe xanh; **đo CLS còn mở** |
| **3. P1 — Trục thị giác** | Token `@theme`; type ladder; gutter; spacing/`<ul>`; bỏ `gap` chết; tracking; 1 hệ | axe + CSS không vượt baseline |
| **4. P2 — Narrative + dải khăn quàng** ⭐ | Hợp nhất A+B; dải; căn 2 cột; bỏ khoảng trống; bỏ nhảy nền; sửa ngắt dòng H1 | **`landing-cinematic.spec.ts` 6/6** + cập nhật test có kiểm soát + axe + 3 viewport không overflow |
| **5. P3 — Ảnh + khoảnh khắc + CTA** ⭐ | Crop; bỏ scrim; identity rail; hồi sinh `LandingFaithMoment`; CTA crescendo; `srcset` AVIF/WebP | LCP ≤ baseline + CLS = 0 + contrast tay ≥4.5:1 |
| **6. P4 — Tương tác + đuôi trang** | Progress rail; header state; gộp Trust+FAQ; stats thành proof rail; `/about` | axe + không che focus + không animation vô hạn mới |
| **7. Tổng hợp tài liệu** | Cập nhật `03_DESIGN_SYSTEM.md`; đánh dấu phần stale của plan 2026-09-25 (§12) | Truth matrix cập nhật |
| **8. P5 — Experimental** | Chỉ sau khi đo thật | Số đo cho thấy cải thiện |

**Ưu tiên tuyệt đối:** bước **2 (font)** có tỉ lệ cảm nhận/công sức cao nhất. Đừng sửa thị giác trước khi sửa font.

---

## 11. Phase 0 — Đã triển khai

**Kết quả verify:** `lint` 0 · `lint:ds` 0/188 · `tsc -b` 0 · unit **44/44** · `landing.spec.ts` + `landing-cinematic.spec.ts` **13/13** · `a11y.spec.ts` **31/31** · axe 0 violation (light 1440/390 + dark 1440).

### 11.1 M1 — Font: **ĐÃ SELF-HOST, XONG**

**Vấn đề gốc:** Inter + Playfair Display khai trong `00-tokens.css` nhưng **không bao giờ được tải**. `<link>` Google Fonts nằm trong `<noscript>`; `loadInterFontAsync()` không có call site. Mọi trang âm thầm render bằng system/Georgia — và **không có gì fail**, vì thiếu `@font-face` không phải lỗi, chỉ là glyph khác.

**Đã làm:**

| Bước | Nội dung |
|---|---|
| Vendor | 6 file WOFF2 **variable** vào `public/fonts/` — Inter latin+vn, Playfair Display roman latin+vn, Playfair Display italic latin+vn. Tổng **163 KB**; ~114 KB tải ở lượt xem thường (italic 48 KB lazy, chưa có gì render serif italic) |
| Khai báo | `src/styles/design-system/05-fonts.css` — 6 `@font-face` với `unicode-range` chính xác của Google, `font-weight: 100 900` (Inter) / `400 900` (Playfair) |
| Nối | `src/index.css` import đúng thứ tự ordinal; **`designSystemCssGraph.test.ts` thêm `'05-fonts.css'`** (guard này hard-code danh sách — đã bị cắn một lần ở §11.7) |
| Preload | `index.html`: preload `inter-latin.woff2` + `playfair-latin.woff2` (`crossorigin`) |
| Gỡ Google | Xoá 2 `<preconnect>`, `<noscript>` link trong `index.html`; xoá `src/lib/fontLoader.ts` + `src/__tests__/fontLoader.test.ts` + lời gọi trong `main.tsx` |
| PWA | `vite.config.ts` `includeAssets` += 6 file. **Bẫy:** `injectManifest` glob mặc định **không có `.woff2`** — dùng `includeAssets` (additive) thay vì `globPatterns` (thay thế) để không phá coverage sẵn có |
| SW | Xoá route CacheFirst `fonts.googleapis.com` 死 trong `src/sw.ts:54-63`; gỡ `CacheFirst` khỏi import |

**Verify (không phải bằng mắt):** thêm `e2e/font-delivery.spec.ts` làm regression guard. Nó assert 4 file **thật sự được fetch qua mạng**, 4 face roman báo `loaded`, 2 face italic **giữ `unloaded`** (đúng lazy), và **chiều rộng render khác fallback** — chứng minh glyph đến từ webfont:

```text
font requests: inter-latin, playfair-latin, inter-vietnamese, playfair-vietnamese
faces:         Inter|normal|loaded ×2 · Playfair Display|normal|loaded ×2 · italic|unloaded ×2
widths:        inter 357.97 · playfair 349.86 · monospace-fallback 351.88
```

Đã chạy 3/3 xanh. Test này có giá trị vì bug "font khai báo nhưng không tải" đã tồn tại **im lặng hàng tháng** ở repo này mà không test nào bắt được; so sánh screenshot thì không đủ vì serif fallback rất dễ bị nhầm là font thật.

**Lợi ích đạt được:** 0 origin bên thứ ba cho font · `font-src 'self'` là đủ · **font có mặt khi offline** (6/6 file đã vào SW precache — kiểm chứng trong `dist/sw.js`) · **trọng số 750/850 trong `25-landing.css` hết là sai** vì font variable có đủ trục 100–900.

**Còn mở (ngoài phạm vi đợt này):** siết CSP. `vercel.json`, `nginx.conf`, `server/src/middleware/security.ts` vẫn còn `https://fonts.gstatic.com` trong `font-src` và `https://fonts.googleapis.com` trong `style-src`/`connect-src`. Cần sửa 2 file test đang *cố ý* assert chúng (`deploymentSecurityContract.test.ts:53,73`, `nginx-csp.test.ts:37`) → **PR riêng**, vì đó là thay đổi giảm bề mặt tấn công.

**Ghi chú về `size-adjust`:** cố tình **không** dùng. Nó cần metric ascent/descent thật đọc từ bảng `hhea`/`OS2` trong woff2; giá trị đoán sai làm text **dịch chuyển** khi swap thay vì ngăn điều đó. Dùng `swap` + preload 2 file quan trọng. Cần đo CLS lại sau khi có baseline.

### 11.2 M2 — Reduced-motion = cùng layout

- `LandingPage.tsx:31,52` — `sequentialScenes` chỉ phụ thuộc width.
- `25-landing.css:421` — tách `(prefers-reduced-motion: reduce)` khỏi `@media (max-width: 1023px)`.
- `20-primitives.css` — **xoá** `.scrolly-pinned-preview { position: static !important }`. Đây mới là thứ *thực sự* phá layout: giữ layout 2 cột mà bỏ sticky thì preview trôi mất.
- Bỏ `transform: none !important` blanket (xoá cả offset tĩnh hợp lệ như `translateY(-0.4rem)` của device organization), thay bằng reset có chọn lọc cho `.landing-hero-photo` / `.landing-hero-content`.
- **Verify:** screenshot reduced-motion 1440px giờ hiện đúng bố cục 2 cột + phone mockup có viền notch, thay cho 1 cột ~1250px trống trước đó. Test `landing-cinematic.spec.ts` cập nhật từ `toBeHidden()` → `toBeVisible()` + assert `position: sticky` + `.landing-community__visual` visible + hero `transform: none`.

### 11.3 M3 — Animation khai báo

- `25-landing.css` — khai `hero-enter-1..5` (stagger 0.05→0.46s, 500ms, `cubic-bezier(0.16,1,0.3,1)`, hữu hạn, `backwards`). Animate `opacity`+`transform` trên **con**, còn parallax rAF nhắm `.landing-hero-content`/`.landing-hero-photo` (cha/anh em) → không tranh nhau.
- `20-primitives.css` — khai `.animate-in` + `.fade-in` (`@keyframes catevia-enter-fade`), thời lượng lấy từ `--motion-standard`.
- **Lưu ý:** `duration-*` là utility cho `transition-duration`, **không** chạm `animation-duration`. 11 chỗ dùng `animate-in fade-in` trong repo giờ hoạt động; `duration-*` còn lại là vô nghĩa nhưng vô hại.

### 11.4 M6 — `scroll-padding-top`: **báo cáo ban đầu SAI**

`10-foundations.css:6` **đã có** `html { scroll-padding-top: 4.5rem }` (72px > header 64px). Kèm `scroll-mt-16`/`scroll-mt-20` trên các section, tổng offset 136–152px. **Không cần sửa gì.**

### 11.5 Bug thật: menu mobile làm scroll overshoot (W22)

Test `landing-cinematic.spec.ts:98` đỏ. **Không phải flake — là bug sản phẩm.** Đo thật:

| trạng thái | chiều cao header | vị trí doc của h2 |
|---|---|---|
| menu đóng | 65px | 4048 |
| **menu mở** | **326px** | **4309** |
| sau khi bấm (settled) | 65px | scrollY 4040 → **h2 ở y=8px** |

Menu nằm trong **normal flow của header sticky**. `handleNavClick` gọi `setIsMobileMenuOpen(false)` + `scrollIntoView` cùng một tick → smooth scroll đo đích khi header còn cao 326px, menu unmount, header co về 65px, mọi section bị kéo lên ~261px, scroll vẫn chạy tới vị trí cũ.

**Kết quả:** h2 ở **8px — bị header 64px che hoàn toàn**. Người dùng bấm mục menu trên mobile là tới sai chỗ. Đây là lỗi thuộc họ WCAG 2.4.11.

**Sửa:** `requestAnimationFrame` hai lần trước khi scroll (`LandingPage.tsx:126-143`). Đo lại: h2 về **269px** — đúng bằng 261px menu height bị thu hồi.

### 11.6 Axe đo giữa animation

Sau khi thêm `hero-enter-*`, 2 test axe đỏ. Đây là **false positive**: hero fade 500ms, axe quét **không settle** nên bắt frame đang fade.

**Bằng chứng:** `a11y.spec.ts` chạy axe trên `/` ở 6 tổ hợp viewport/theme và **xanh 31/31 với animation đang bật** — vì nó dùng `runAxeStable` có settle. `landing-cinematic.spec.ts` có `openLanding` riêng và bỏ qua settle.

**Sửa:** thêm `settleFiniteAnimations(page)` vào `openLanding`, đúng kỷ luật `design-system-matrix.ts:102,147,155` đã áp dụng cho mọi lần mở observation. Không phải che lỗi — trạng thái settled mới là trạng thái render thật.

### 11.7 Sửa lỗi có sẵn: `designSystemCssGraph` đỏ

`expectedImports` thiếu `25-landing.css`. **Chứng minh là lỗi có sẵn:** `src/index.css` không đổi so với baseline, `25-landing.css` đã được import từ baseline, guard từ baseline đã thiếu entry. Lỗi chặn `verify:ci` và pre-push.

### 11.8 Bài học quy trình

Tôi đã **báo sai** hai lần trong quá trình này. Cả hai đều cùng một nguyên nhân: **kết luận từ bằng chứng yếu**.

**(a) Gọi bug thật là "flake môi trường".** Test `landing-cinematic.spec.ts:98` đỏ, tôi A/B thấy 4/4 fail ở HEAD nên dừng lại. Sai — tôi **dừng sớm quá** thay vì đo để tìm cơ chế. Nếu chạy thêm một vòng đo, sẽ thấy con số 261px và tìm ra bug thật ở §11.5.

**(b) Kết luận "font đã render" chỉ bằng mắt.** Tôi nhìn screenshot thấy chữ serif và nói Playfair đang chạy. Thực tế: browser **không truy cập được `fonts.googleapis.com`** (`ERR_ABORTED`), nên `loadInterFontAsync()` không thể hoạt động; `desktop-branches.png` trước và sau khi bật loader **trùng khớp từng byte (88 963)** — tức font không đổi. Tôi đã nhầm Georgia với Playfair. Chỉ khi tự đo `fetch` mới biết: browser tới được `fonts.gstatic.com` (200, 48 KB) nhưng **không** tới được `fonts.googleapis.com`; PowerShell thì ngược lại.

**Hai quy tắc rút ra:**

1. Phân biệt *"test đỏ ở HEAD"* với *"không phải do tôi"* là **hai kết luận khác nhau**. Test đỏ ở HEAD vẫn là lỗi cần tìm root cause.
2. **Đừng bao giờ kết luận trạng thái render từ screenshot.** Một font fallback trông rất giống font thật. Phải đo: so chiều rộng render với fallback, kiểm `document.fonts` status, hoặc kiểm request thật. Bài test `e2e/font-delivery.spec.ts` (§11.1) sinh ra chính vì lỗi này.

---

## 12. Quan hệ với plan 2026-09-25 (DRIFT)

`docs/LANDING_PAGE_WORLD_CLASS_BENCHMARK_AND_UPGRADE_PLAN_2026-09-25.md` là audit/plan trước đó. So với code hiện tại:

| Mã | Claim của plan 09-25 | Thực tế 09-26 | Trạng thái |
|---|---|---|---|
| **F2** | `initDB()` tĩnh trong `main.tsx`, cần dynamic import | `main.tsx` đã gọi `initDB()` **sau** `createRoot().render()` → đã non-blocking | **DRIFT** — T11 không còn cần như mô tả |
| **G2** | Không có `robots.txt`, `sitemap.xml`, `canonical` | **Đã có cả 3** (`public/robots.txt`, `public/sitemap.xml`, `index.html:11`) | **DRIFT** |
| **G1** | `og:image` là đường dẫn tương đối | Vẫn còn (`index.html:18,23`) | Còn đúng |
| **G3** | Không có JSON-LD | Vẫn không có | Còn đúng |
| **I1** | `LandingStatsStrip` 0 usage | Đã được render trong `LandingPage.tsx` | **DRIFT** — đã xong |
| **E1/E2** | ~10 animation vô hạn, `will-change` thường trú | Đã bị loại khỏi code trong lúc redesign | **DRIFT** — đã xong |
| **H1** | `#gioi-thieu-tieu-de` đã bị xoá | Đã gắn lại vào hero H1 | Đã xong (ghi nhận trong chính plan 09-25) |
| **Q13** | baseline ~10 animation vô hạn | Hiện ~0 | Đã xong |
| **T15** | self-host font | **ĐÃ XONG** — xem §11.1 | Đã xong |

**Kết luận:** plan 09-25 đã được triển khai phần lớn ở working tree trước Phase 0. Khi tổng hợp tài liệu (bước 7), cần đánh dấu F2/G2/I1/E1/E2 là **STALE** để người sau không làm lại.

---

## 13. Truth Matrix

| Claim | Quan sát | Chuẩn | Trạng thái | Bằng chứng |
|---|---|---|---|---|
| Font Inter + Playfair không tải | Đúng trước Phase 0 | Phải dùng token font | ĐÃ SỬA | `index.html:33-35` + `main.tsx` |
| Hero không có animation vào | Đúng trước Phase 0 | — | ĐÃ SỬA | `hero-enter-*` trước đó chỉ có trong kill-list |
| `animate-in`/`fade-in` là class chết | Đúng | — | ĐÃ SỬA | không `tailwindcss-animate`, không `@plugin` |
| Reduced-motion nhận layout mobile | Đúng, ảnh chứng minh | 2.4.11 | ĐÃ SỬA | `test-results/.../desktop-reduced-parent.png` |
| Menu mobile gây scroll overshoot | Đúng, đo được 261px | 2.4.11 | ĐÃ SỮA | số đo §11.5 |
| Axe đo giữa animation | Đúng | — | ĐÃ SỬA | `a11y.spec.ts` xanh 31/31 nhờ settle |
| `designSystemCssGraph` thiếu 25-landing | Đúng từ baseline | Chặn verify:ci | ĐÃ SỬA | diff so với `6284697` |
| 5 ngành vỡ ở 768px | Đúng | — | **ĐÃ SỮA** | Phase 1 — span 2 cột cho chặng cuối, xem `LandingBranchJourney.tsx` |
| Header truncate tên Xứ Đoàn | Đúng | 1.3.1 | **MỞ** | `320-hero.png` |
| Chữ kem trên ảnh đủ contrast | **UNKNOWN** | ≥4.5:1 | **ĐÃ ĐO — có lỗi thật, đã sửa** | `e2e/hero-image-contrast.spec.ts`; số đo §15.1 |
| LCP/INP/CLS | **UNKNOWN** | Q5–Q8 | **UNKNOWN** | chưa từng đo |
| Proof nào được công bố | **BLOCKING** | D-01 | **UNKNOWN** | cần Ban Giáo Lý chốt |
| `/about` trùng `/` | Đúng | — | **MỞ** | `router.tsx:442-450` |
| Hero LCP 800KB, không AVIF/WebP | Đúng | Q10 | **ĐÃ SỬA** | `tools/generate-landing-media.mjs`; số đo §15.3 |
| Biển ngữ nhà thờ chiếm phần trên ảnh | Đúng (mobile) | — | **ĐÃ SỬA** | crop 5% trong script; §15.3 |
| `visual-mark` đè lên biển ngữ | Đúng | — | **ĐÃ SỬA** | chuyển xuống đáy trái + plate |
| Tên Xứ Đoàn bị `truncate` ở 320px | Đúng | 1.3.1 | **ĐÃ SỮA** | wrap dưới `sm`, xem §15.4 |

---

## 14. Phase 1 & Phase 2 — Đã triển khai và verify

### 14.1 W6 — Bỏ `min-height` khóa viewport

`min-height: 82svh` (community) và `83svh` (product) tạo khoảng trống chết: tại 1440×900, block copy chỉ ~330px nằm giữa ~400px trống trên và dưới. Đổi sang sàn nhịp điệu bằng `rem` (`.landing-community__chapter` 30rem, `.landing-product-story` 34rem) — phân giải độc lập, vẫn đủ dành cho pinned column di chuyển. Đo được: chapter 747px → 661px.

### 14.2 W7 — Căn hai cột theo cùng một đường tâm

Hai lỗi thật, **không cái nào do thay đổi của Phase 2 gây ra**:

**(a) `scroll-margin-top: 5.5rem` làm lệch mọi chapter.** Không có anchor nào trỏ tới từng story (nav trỏ `#san-pham`), nhưng margin vẫn nằm trong alignment box, nên `scrollIntoView({ block: 'center' })` căn theo **margin box** chứ không phải story — lệch ~88px. Đã gỡ.

**(b) Pinned column cao hơn grid area của nó sẽ bị đẩy LÊN, trượt dưới header.** Đo được: preview `y=9.5`, community visual `y=46.3`, header 77px. Cơ chế: sticky bị ràng buộc bởi cạnh dưới containing block, nên khi không còn chỗ nó đẩy phần tử ra khỏi đỉnh thay vì cho nó cuộn đi.

Sửa bằng cách đặt đuôi (`padding-bottom`) trên **rail** (`landing-story-rail`, `landing-community__chapters`) chứ không phải trên grid container — padding trên container nằm *dưới* row nên không mở rộng grid area. Đây là bản sửa đầu tiên của tôi **không có tác dụng**, phải đo mới thấy.

**Sai lầm metric đáng ghi nhất:** tôi đang so **đỉnh** của hai cột. Preview cao 805px, copy cao 488px — đỉnh không bao giờ khớp được. Metric đúng là **tâm**. Sau khi sửa, chênh tâm đo được: product −20.2 / +3.3px, community −0.3 / −0.3px. Offset sticky của community giải được về 0.3px bằng `max(5.25rem, calc(50svh - min(38svh, 380px) + var(--header-clearance)/2))` — số hạng `+ clearance/2` chính là nửa padding mà `10-foundations.css` đặt vào `scroll-padding-top`.

**Không test nào bắt được lỗi (b)**. Đã thêm `both pinned columns stay clear of the header and hold one centre line` phủ cả hai stage.

### 14.3 W5 — Cố ý LỆCH khỏi plan: "chuyển màu liên tục" không khả thi về WCAG

Plan (mục Phase 2, hướng 6) yêu cầu thay nhảy nền bằng *chuyển màu liên tục theo tiến độ chặng*. **Không làm được.** Chữ tối cần nền sáng, chữ trắng cần nền tối; không có trạng thái giữa nào thỏa cả hai, nên **mọi ramp đều đi qua một vùng hỏng contrast** — giống hệt cái lỗi 1.04:1 tôi đo được ở header Phase 1.

Thay bằng **chapter card navy có giới hạn** thay vì phủ cả viewport: hết nháy, không có lỗ hổng contrast, và **trùng đúng cách layout mobile đã làm sẵn** (`25-landing.css` mobile block). Lỗi phát sinh khi làm: `landing-cinematic__preview-heading` đổi gold nằm ở cột phải, **ngoài** card → gold `#fef3c7` trên `#f7f8fb` = **1.04:1, vô hình**. Đã bỏ override gold ở đó; gold chỉ còn trên navy.

### 14.4 W8 — Ngắt dòng H1

Nguyên nhân: `max-width: 17ch` **hẹp hơn cả một dòng** "Nền tảng quản lý Giáo lý" (24 ký tự), nên dòng bị bẻ vỡ đúng chỗ đó. Thay bằng ngắt dòng tường minh từ `sm` lên, `white-space: nowrap` cho "Giáo lý" và "Thiếu Nhi". Đo: ở 1024–1920px mỗi dòng vừa trong khung (cần 643px @1440, có 1024px); 320/390px gộp thành 3 dòng.

### 14.5 Dải khăn quàng — 5 lớp màu liền nhau

`gap: 0` + 5 band màu tiếp xúc + mỗi ô tự nhuộm token ngành (15% → 6% → `--color-surface-app`) + bỏ hairline dọc = một dải liền mạch, ngang ở desktop và dọc dưới `sm`. Chỉ gradient + border, không SVG filter, không ảnh. Màu lấy qua `--chapter-color: var(--color-branch-*)`; class `border-t-branch-*` vẫn là nguồn màu cho band nên wash và band không thể lệch nhau.

Đã gỡ chấm tròn trang trí và `BRANCH_BADGE_BORDER` (class chết). Hover chỉ còn lift: swap `background` trên một gradient đọc ra nháy, mà các chapter này không interactive.

**Sửa test bắt buộc:** `landingPage.test.tsx` dùng `getByText('Thiếu Nhi')` không scope, và span `__keep` của H1 tạo ra phần tử thứ hai cùng chuỗi. Đã scope vào `#tieu-de-nganh` — test nói về ngành thì phải hỏi đúng chỗ.

### 14.6 W18 — Đường may dưới mọi eyebrow

`.landing-eyebrow::after` là flex item trên dòng riêng (`flex-wrap: wrap` + `flex-basis: 100%`), màu lấy từ `currentColor` nên hai eyebrow trên navy vẫn gold còn bốn trên giấy vẫn parish blue — không cần override theo section.

### 14.7 Khoảng trống kiểm chứng bị bỏ sót

Section `branches` **chưa từng được quét contrast** (`landing-cinematic.spec.ts` chỉ scan `hero`/`organization`/`access`), mà Phase 2 lại đổi màu chính section đó. Đã thêm `branches` vào danh sách scene.

### 14.8 Sai lầm quy trình trong Phase 2

Bổ sung quy tắc 3 cho §11.8: **đừng kết luận từ metric tự viết mà chưa kiểm nó ở một case biết-đúng.**

1. Script đo của tôi sơ suất bỏ `chapter()` khỏi vòng lặp, nên mọi số đo đều ở `scrollY: 0` — và tôi suýt "sửa" layout đúng dựa trên số đo vô nghĩa.
2. Metric `lineBoxes` của tôi đếm `getClientRects()` ở cấp `h1`, hấp thụ luôn rect của span lồng, nên báo **4 dòng** cho một layout **2 dòng đúng**. Suýt sửa tiếp một thứ không hỏng. Số thật nằm ở `renderedLines` từng span.

### 14.9 Kết quả verify

`lint` 0 · `lint:ds` 0/188 · `lint:architecture-inventory` 0 · `tsc -b` 0 · unit **3264/3264** (434 file) · landing E2E **18/18** · `a11y.spec.ts` **31/31** · `build:frontend` xong. `landing-cinematic.spec.ts` 8 → **10** test (thêm hero-title và pinned-column).

---

## 15. Phase 3 — Ảnh thật, khoảnh khắc Chúa nhật

### 15.1 Đo contrast thật cho chữ trên ảnh — UNKNOWN → có lỗi thật

`e2e/hero-image-contrast.spec.ts` mới: axe **không** đo được trường hợp này (nó dò nền bằng DOM, mà nền ở đây là ảnh raster dưới scrim), nên bài test chụp ảnh thật rồi tính contrast trên pixel. Chạy trên 2 theme × 2 bề rộng × 7 phần tử.

**Kết quả baseline có lỗi thật, không phải giả định:**

| phần tử | light @390 | dark @390 | ngưỡng |
|---|---|---|---|
| identity rail chips | **1.11** | **3.34** | 4.5 |
| scroll cue | **1.25** | **1.16** | 4.5 |
| parish kicker | 8.77 | **4.35** | 4.5 |

Nguyên nhân gốc: mobile có `object-cover` nên **luôn lộ hết chiều cao ảnh**, đúng vùng áo trắng các em và bậc thang sáng. Tác giả cũ bù bằng cách dành scrim — và vẫn không đủ.

Đã sửa: plate tối thật cho identity chips + scroll cue (không phụ thuộc ảnh), token `--landing-cream-on-media` cho kem trên media (brand-gold **đổi theo theme**: `#FEF3C7` ở light, `#F0C36A` ở dark — chênh 0.89 vs 0.59 luminance), và top band của scrim đậm hơn. Chặt nhất còn lại là kicker **4.61** và lead **4.73** ở dark @1440.

### 15.2 Sai lầm phép đo — 5 vòng đều do tôi, không phải do trang

Bài test điển hình về việc đo sai còn tệ hơn không đo:

1. **Parse màu sai không gian màu.** `text-white/95` được Chrome serialize thành `oklab(L a b / alpha)`; tôi đọc 3 số đó như R/G/B. `text-white/70` ra luminance 0.005 và **báo pass 13.75:1**. Sửa: raster qua canvas.
2. **Bounding box không phải vùng đã sơn.** "Pixel sáng nhất trong box" ra 1.11:1 cho identity rail vì tính cả khe giữa các chip trên mobile, và 1.56:1 cho scroll cue vì `rounded-full` không sơn góc.
3. **Inset theo border-radius sập về 0.** `rounded-full` trên hộp thấp cho radius = chiều cao/2, vùng lấy mẫu rỗng → 5 mục tiêu biến mất khỏi bảng mà tôi không biết. Sửa: lấy mẫu vùng giữa 60%.
4. **CSS injection không thắng Tailwind.** `.wcag-probe * { color: transparent !important }` bị `text-white` trên thẻ con giữ nguyên — `<a>` trong suốt còn `<span>` bên trong vẫn trắng. Nghĩa là **"nền" đo được chứa cả chữ**; các số "pass" như H1 chỉ đúng vì H1/lead không có phần tử con.
5. **`transition-colors` làm phép đo chụp đúng giữa fade.** Đổi màu chạy mượt 150ms, ảnh chụp ra giữa chừng → 0.93 cho vùng thực ra render tối đen. Sửa: tắt `transition` khi blank.

Sau khi sửa cả 5, phép đo khớp với mắt thấy: scroll cue render trên navy tối, đo **19:1**.

### 15.3 Ảnh thật — `tools/generate-landing-media.mjs`

Thêm `sharp` (devDependency, D-03 đã duyệt) + script sinh ảnh. **W9 không thể sửa bằng CSS**: mobile luôn lộ hết chiều cao ảnh nên `object-position` không ẩn được biển ngữ — phải crop ở asset.

Crop **5% trên** (bỏ biển ngữ ngang). Hai biển ngữ dọc **giữ lại**: chúng nằm ngoài nhóm người, crop 18% mỗi bên sẽ cắt mất người trong một bức ảnh mà toàn bộ ý nghĩa là "tất cả đều ở đây".

Kích thước đo được (in ra từ script, không ước lượng) — KB:

| | 640w | 828w | 1280w | 1600w | 2480w |
|---|---|---|---|---|---|
| AVIF | 25.4 | 38.2 | 74.4 | **104.2** | 210.3 |
| WebP | 37.0 | 53.4 | 99.6 | 135.9 | 243.0 |
| JPEG | 34.0 | 50.6 | 99.9 | **140.9** | 277.8 |

Budget LCP (Q10): mobile 828w **50.6KB ≤ 70KB** ✓ · desktop 1600w **140.9KB ≤ 150KB** ✓. JPEG hạ từ 76 → 62 vì ở 76 file 1600w là 189KB, vượt budget, mà ảnh nằm dưới scrim dày nên chất lượng dư không lộ.

`<picture>` + `srcset` 640/828/1280/1600/2480, `sizes="100vw"` (hero tràn viền nên 100vw **là** khung thật). `width/height` phải là **2480×1674** — kích thước *đã crop*, không phải 1772 của ảnh gốc.

### 15.4 W10, W17, item 2

- **W10**: `visual-mark` chuyển từ góc trên-trái (đè lên biển ngữ in trên ảnh) xuống đáy trái + plate tối.
- **W17**: header bỏ `truncate` dưới `sm` — chữ wrap thay vì thành "XỨ ĐOÀN…". Trên `sm` vẫn giữ một dòng.
- **Item 2 "bỏ scrim nặng" — LỆCH, có số đo và đã thử cả hai hướng.** Bề tặng thật của ảnh này: **điểm sáng nhất nằm đúng giữa** (áo trắng các em), mà H1 cũng nằm đúng giữa. Nên chỉ có ba lựa chọn, không có thứ tư:

  | | Cách làm | Đánh đổi |
  |---|---|---|
  | A | Tối **đều** toàn khung | Ảnh tối hơn, **không có viền** |
  | B | Tối **cục bộ** sau khối chữ | Ảnh sáng, nhưng **luôn có vệt** |
  | C | Khối chữ đặt trên **nền đặc** | Viền sắc, có chủ đích, nhưng che khuôn mặt và là đổi thiết kế lớn |

  Tôi đã triển khai **B** (pool tối sau `.landing-hero-content`), làm mượt hơn hai vòng, và **đã gỡ**. Nguyên nhân không phải chỉnh tham số: một radial rộng 132% chạm mép khung ở ~38% bán kính của chính nó — quá sớm để tắt hẳn, nên **viền luôn lộ**. Gradient thuần dọc cũng không cứu được, vì đỉnh-giữa và hai bên-giữa cách nhau gần như bằng nhau. Cần một lựa chọn C mới sạch, và đó là đổi thiết kế cần duyệt.

  Kết quả cuối: quay về **A**, và bản này **nhẹ hơn bản gốc** ở những chỗ không cần thiết — gỡ lớp wash 90deg (tối sầm bên trái, nơi không có chữ), hạ veil đáy từ 416px xuống còn 112px, bỏ `saturate(0.85)`. H1 đo 6.99:1, lead 6.98:1 ở light@1440.

### 15.5 Hồi sinh `LandingFaithMoment`

Component tồn tại sẵn nhưng không nơi nào render (orphan). Đưa vào sau chặng "Một hành trình đức tin", **nguyên văn** không viết lại chữ. Cố ý **không** gắn `data-landing-scene`/`data-landing-reveal`: đây là điểm dừng cảm xúc, không phải chặng trong trục 3 chặng, nên không được lọt vào chuỗi scene mà `25-landing.css` và test đang khoá. Gỡ div `hero-caustic-glow` — class này **không tồn tại** trong repo.

**Trùng lặp cần lưu ý:** nó lặp lại Bổn mạng / 4 Tôn Chỉ / Niên khóa đã nằm ở identity rail của hero — cùng vấn đề trùng lặp mà Phase 2 cải thiện ở Story A+B, và **vẫn blocked** chờ Ban Giáo Lý.

### 15.6 CTA crescendo — CHƯA LÀM, cần quyết định

Microcopy plan chỉ định ("Tài khoản do Xứ Đoàn cấp — không cần tự đăng ký") **đã có sẵn** ở `LandingAccessPaths.tsx:13` và `:58` — thêm nữa là trùng. Nhãn CTA thì plan không chỉ định, và trang có **hai** đối tượng (Phụ huynh / GLV & Huynh Trưởng), nên một CTA đóng trang không có đích rõ ràng. Không tự viết chữ.

### 15.7 Sai lầm quy trình: tôi làm hỏng gate của người khác

**Sai lầm 6 — lặp lại đúng §11.8, lần này là bỏ sót lỗi nội dung.** Sau khi sửa W8, test hero-title vẫn xanh, nhưng ở mobile H1 hiện ra là `Giáo lý& Thiếu Nhi` — **mất dấu cách**. Nguyên nhân: JSX bỏ khoảng trắng ở ranh giới hai span, và dưới `sm` hai dòng chạy inline nên dính liền. Test chỉ đếm **số dòng dựng được**, không kiểm **nội dung chữ**, nên không bắt được. Sửa bằng `{' '}` (non-breaking, vừa sống sót qua collapse vừa cấm ngắt dòng trước dấu `&`).

Bài học: **một test hình học không bảo chứng cho nội dung**. Khi sửa typography, phải có một assertion đọc lại `textContent`.

Làm `.animate-in`/`.fade-in` sống (Phase 0) kích hoạt 11 chỗ dùng ngủ đồng, trong đó có dashboard. Hệ quả: `settleFiniteAnimations` chụp danh sách animation **một lần**, nên animation do scroll-story bắt đầu *sau* lúc chụp không được chờ, và axe quét đúng giữa lúc fade → `#60A5FA` ở opacity một phần đo thành `#5188ce` trên `#1b2537`, **4.21:1**. Flake ~50% trên `/dashboard` dark compact.

Tôi **không** giả định là do người khác: tạm revert 5 file CSS của tôi → test xanh; khôi phục → đỏ rồi xanh. Bằng chứng, không phải suy luận. Vá đúng chỗ: `settleFiniteAnimations` lặp tới khi không còn animation hữu hạn nào chạy (tối đa 6 vòng). 3/3 chạy sạch sau khi vá.

**Quy tắc bổ sung (§11.8):** khi một thay đổi có blast radius rộng hơn trang đang sửa, phải **đo** xem nó có phá gate ở nơi khác không — đừng chỉ chạy test của trang mình.

---

## 16. Issue #1 (header mobile) + Phase 4

### 16.1 Issue #1 — header cao 128.5px ở 320px

Đo trước khi sửa: ở 320px cột tên chỉ rộng **74.8px** (nút "Đăng nhập" + hamburger chiếm hết phần còn lại) → tên 3 dòng, meta **5 dòng**, header **128.5px**. Ở 390px là 81px, ở 639px là 77px.

Không bỏ nút "Đăng nhập": menu mobile chỉ cuộn tới section, nút đó là lối vào portal thật. Không rút gọn chuỗi: cần duyệt copy.

Chọn: **ẩn dòng giáo hạt/giáo phận ở ≤639px**. Đây là quyết định ưu tiên hiển thị, không phải xoá copy — thông tin đó vẫn có ngay dưới ở identity rail của hero và ở khoảnh khắc Chúa nhật. Kết quả: header **77px ở cả 320 / 390 / 639**, khớp đúng bằng desktop.

### 16.2 Phase 4 — làm gì, không làm gì

| Hạng mục | Trạng thái |
|---|---|
| Progress rail header (`scaleX`) | **Xong.** Ghi thẳng ra DOM bằng ref, không đưa vào state — setState mỗi frame sẽ render lại cả landing 60 lần/giây để dịch một thanh 2px. `will-change: transform`, bắt đầu ở `scaleX(0)` để không nháy full-width trước frame đầu. |
| "Đang ở chặng nào" (W19/W20) | **Xong, dạng sr-only.** Rail là `aria-hidden`; tên chặng nằm trong `role="status"`. **Không** hiện thị bằng mắt: dòng thứ ba sẽ phá đúng thứ issue #1 vừa sửa, và rail đã giao tiếp tiến độ bằng thị giác rồi. Mọi nhãn lấy từ H2 sẵn có của từng section, không hứa hẹn mới. |
| FAQ `0fr→1fr` | **Xong.** Panel luôn mounted, `inert` khi đóng. |
| W21 `/about` trùng `/` | **Xong nửa.** Xoá nút chân trang dẫn tới trang trùng. Route giữ lại (đang public-guard đúng, `landingPage.test.tsx` khoá); dựng `/about` thật cần copy mới → chờ Ban Giáo Lý. |
| Gộp Trust + FAQ, Stats thành proof rail | **CHƯA — cần quyết định.** Gộp làm giảm thông tin trên trang, và `data-landing-scene` + reveal test đang khoá đúng các id hiện tại. Không tự làm. |
| Sticky CTA mobile | **KHÔNG LÀM, có lý do.** Plan tự nói "chỉ khi chưa có giải pháp tốt hơn". CTA crescendo ở §15.6 đã là đỉnh, và rail + `role="status"` đã cho biết đang ở đâu. |

### 16.3 FAQ: đổi hợp đồng test, và nói thẳng điều đó

Plan yêu cầu `0fr→1fr` nhưng `landingPage.test.tsx` lại khoá "câu trả lời đang đóng **không có trong document**" — chỉ đúng được vì panel cũ unmount. Accordion muốn animate thì bắt buộc phải mounted, nên hai thứ này không thể cùng đúng.

Tôi **không nới lỏng** test: đổi sang hợp đồng mà plan nêu là `aria-expanded`, cộng `inert` — thứ thật sự giữ câu trả lời đang đóng ra khỏi cây a11y và khỏi tab order, **mạnh hơn** việc vắng mặt do unmount. Và vì jsdom không nạp stylesheet, `visibility` không kiểm được ở unit test, nên tôi bổ sung cùng kiểm tra đó ở `landing.spec.ts` (nơi có trình duyệt thật): panel đóng phải `inert` **và** không visible.

Hai chỗ khác cùng nguyên nhân: FAQ trả lời về bảo mật dữ liệu lặp gần như nguyên văn dòng cam kết ở chân trang. Panel giữ mounted làm các query theo đoạn đó **trùng 2 phần tử**. Sửa bằng cách khoá đúng câu chân trang (`Dữ liệu thuộc **về**…` — bản FAQ thiếu chữ "về"), tức **mạnh hơn** chứ không phải né.

### 16.4 Sai lầm 7 — tin nhầm một thay đổi của người khác là của mình

Rail và nhãn chặn tôi viết hiển thị bằng mắt; khi chạy thì nhãn không hiện, và markup đã thành `sr-only`. Tôi suýt sửa tiếp theo hướng "nhãn bị ghi đè". Kiểm tra lại thì đó **không phải thay đổi của tôi** — và hướng `sr-only` lại đúng hơn, vì giữ header ở 77px. Tôi giữ `sr-only`, xoá CSS chết của mình, và đổi `aria-live` thô thành `role="status"` để có hook ổn định mà không cần class chỉ-cho-test.

### 16.5 Kết quả verify

`lint` 0 · `lint:ds` 0/188 · `tsc` 0 lỗi ở landing/e2e · unit landing 16/16 · **E2E 52/52** (landing 7 + cinematic 11 + hero-contrast 2 + font 1 + a11y 31) · `vite build` xong. `landing-cinematic.spec.ts` 10 → **11** test.

Trong lúc chạy còn gặp "Cổng E2E đang được dùng": process Playwright sót từ một lần chạy bị huỷ. Đã dọn đúng cây process của tôi; **không** đụng tới dev server của session khác (PID 25852).

---

## 17. Session 2026-09-29 — SEO, LCP và khử trùng lặp

> Đợt tiếp nối sau Phase 4, vẫn trong phạm vi D2 (public UI, không chạm auth/tenancy/sync). Toàn bộ số đo dưới đây là đo thật trên `vite preview` (production build), viewport IAB, DPR môi trường đo không ổn định — coi các con số là lab, không phải field.

### 17.1 Social sharing hỏng hoàn toàn — ĐÃ SỬA

`index.html` trỏ `og:image`/`twitter:image` vào `/images/xu-doan-tap-the.jpg` — file **đã bị xoá** (git status: `D`), và URL **tương đối** nên crawler vốn resolve theo origin của nó. Mọi share card (Facebook/Zalo/X) render trống.

- `tools/generate-landing-media.mjs` phát sinh thêm **`public/images/og/catevia-og.jpg` 1200×630, 90.6KB** từ chính frame hero đã crop (lệch tâm 35% để giữ khuôn mặt). Card được sinh bởi script, không bao giờ làm tay.
- `index.html`: og:image **absolute**, kèm `og:image:width/height/alt` (Zalo/Facebook bỏ preview nếu thiếu kích thước), `og:locale=vi_VN`, **JSON-LD `WebApplication`** (G3 của plan 09-25 đóng). Không bịa rating/offers — `offers.price=0` đã bị tự xóa vì đó là business claim không kiểm chứng được.
- `<title>` tĩnh giờ trùng khớp `document.title` động (`Catevia — Quản lý Giáo lý & Thiếu Nhi Thánh Thể | Xứ Đoàn Đức Mẹ Fatima`) — trước đây crawler thấy tiêu đề khác hẳn người dùng.

### 17.2 LCP: đo baseline lần đầu (M7) → phát hiện fetch kép → ĐÃ SỬA

Baseline chưa từng có. Đo được (production build, 1440×900):

| | Trước | Sau |
|---|---|---|
| LCP | **2068ms** (localhost!) | **1032ms** |
| Ảnh hero tải | 1600.avif @1103ms **rồi 2480.avif @1934ms** — 322KB | 1600.avif @427ms — 104KB |
| CLS | 0 | 0 |

Nguyên nhân gốc: `sizes="100vw"` khiến lựa chọn ứng viên dao động **trong lúc route mount** — bằng chứng: một `<img>` giống hệt chèn vào cùng container **sau** khi layout ổn định luôn chọn 1600w, còn phần tử thật chọn 2480w; tải lạnh đôi khi fetch cả hai. Con số 2.07s trên **localhost** nghĩa là chuỗi entry→router→LandingPage→mới phát hiện ảnh.

Sửa hai lớp:
1. `sizes="(max-width: 828px) 100vw, 1600px"` (cả 2 `<source>` lẫn `<img>`) — lựa chọn là hàm thuần của viewport, **không thể bị re-select**. Đánh đổi có chủ đích: màn >1600px upscale 1600w 1.2–1.6× dưới scrim tối — không mắt thường nào thấy được; 2480w vẫn nằm trong srcset (test lock) nhưng không còn được chọn.
2. `<link rel="preload" as="image" imagesrcset imagesizes fetchpriority=high>` trong `index.html` —preload chọn đúng ứng viên mà img sẽ chọn (cùng `sizes`, cùng DPR của thiết bị — DPR thật không đổi giữa parse và mount), nên fetch ảnh bắt đầu từ HTML parse thay vì sau chuỗi JS.

Đo lại ảnh logo: `logo-gia-ton.png` 56→15KB, `app-logo-192.png` 62→16KB (palette quantization, xác nhận bằng mắt vẫn nét ở 40–80px/DPR2) — tiết kiệm 87KB trên mọi lần tải đầu.

### 17.3 Khử trùng lặp theo đúng tinh thần Phase 2

- **`LandingFaithMoment`**: bỏ hàng chip lặp "4 Tôn Chỉ + Niên khóa" và khối tên/địa chỉ Giáo Xứ (sticky header hiển thị vĩnh viễn + hero rail một màn hình phía trên). Card giờ là đúng một khoảnh khắc: huy hiệu, eyebrow, **lời Bổn mạng** (nguyên văn), attribution. Eyebrow chip trở thành chính nó là `<h2>` của section (tránh section không tiêu đề — heading navigation sẽ bỏ qua). `"hy sinh"` chèn U+00A0 chặn ngắt dòng giữa từ ghép.
- **Preview heading**: bỏ "01 / 03" thứ hai trên màn hình (story copy đã đếm); nhãn "Không gian Học vụ" đứng một mình trên card demo.
- `.skip-link` đổi `:focus` → `:focus-visible` (pointer click không triệu hồi link).

### 17.4 Dọn tài sản mồ côi — ~2.2MB khỏi repo

Đã xoá sau khi grep xác nhận 0 tham chiếu: `src/assets/hero.png` (bẫy tím neon), `app-logo.png` (1.26MB), `app-logo-512.png`, `logo-gia-ton-{128,256,512}.png`, `logo-gia-ton.jpg`, `react.svg`, `vite.svg`, `public/favicon-32x32.png`. **Giữ**: `logo-tntt.png` (mock string trong HeaderBar.test), `public/sw.js` (SW dev-mode của `registerServiceWorkerOnly`), `xu-doan-tap-the-original.jpg` (source của pipeline).

### 17.5 Verify

`oxlint` 0 · `tsc -b` 0 · `lint:ds` 0/188 · `lint:architecture-inventory` 0 · unit landing+cssGraph 20/20 · **E2E 52/52** (landing 7 + cinematic 11 + a11y 31 + font 1 + hero-contrast 2, Chromium) · `vite build` xong · og image 200 trên preview. Full unit suite chạy riêng cuối session.

Còn mở: DPR của môi trường đo (IAB) tự flip 1↔2 giữa các run gây nhiễu cho phép đo candidate — trên thiết bị thật DPR ổn định nên preload và img luôn đồng ứng viên.

