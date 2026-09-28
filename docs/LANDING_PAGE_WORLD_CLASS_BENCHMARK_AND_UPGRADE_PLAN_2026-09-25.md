# Landing Page — Nghiên cứu chuẩn quốc tế, Đánh giá hiện trạng & Kế hoạch nâng cấp (2026-09-25)

> **Loại tài liệu:** Research + Audit (current-truth) + Upgrade Plan (change-impact).
> **Phân loại task:** D2 — nhiều module UI công khai, ảnh hưởng metadata/hiệu năng/E2E
> contracts; không chạm ranh giới auth/tenancy/dữ liệu (không phải D3).
> **Trạng thái:** KẾ HOẠCH — chưa triển khai. Tài liệu này là artifact quyết định,
> không phải văn bản normative thay thế SSOT hiện có.
> **Phạm vi:** route công khai `/` — `src/pages/LandingPage.tsx`,
> `src/components/landing/*` (9 file), primitives CSS landing trong
> `src/styles/design-system/20-primitives.css`, `index.html`, build/asset pipeline,
> `e2e/landing.spec.ts`, `src/__tests__/landingPage.test.tsx`.
> **Revision kiểm tra:** branch `feat/cloudflare-worker-backend`, HEAD `e6e24fb`
> ("feat(landing): Apple-grade cinematic scrollytelling…") **+ working tree**
> (các tinh chỉnh landing chưa commit trong `LandingPage.tsx`,
> `src/components/landing/*`, `20-primitives.css`).

---

## 0. Phương pháp & quy ước bằng chứng

Nguyên tắc current-truth được áp dụng tách bạch:

- **Observed truth** — hành vi thực tế (đọc source, chạy test, đọc artifact build `dist/`).
- **Normative truth** — yêu cầu đến từ tài liệu/repo contract (design system, E2E matrix, invariants).
- **Inference / UNKNOWN** — chưa đủ bằng chứng tại revision này (ví dụ: điểm Core Web Vitals
  ngoài thực địa, trạng thái CI sau commit landing).

Mọi khẳng định vật chất trong tài liệu đều kèm **evidence locator** (file/line, kết quả lệnh,
artifact build). Số liệu nghiên cứu bên ngoài kèm URL nguồn ở §8. Chỉ các nguồn đã được
đọc trực tiếp mới được trích dẫn (Vercel/Notion không được viện dẫn vì không xác minh trực tiếp
trong nghiên cứu này — tránh khẳng định suông).

Trạng thái dùng trong Gap Matrix / Truth Matrix:

```text
VERIFIED_OBSERVED   — đã kiểm chứng trong code/test/build tại revision này
VERIFIED_NORMATIVE  — yêu cầu chuẩn từ SSOT/hợp đồng repo
ALIGNED             — quan sát khớp chuẩn
DRIFT               — code/chuẩn/test lệch nhau, đã xác định cơ chế
HYPOTHESIS          — suy luận hợp lý, chưa đo
UNKNOWN             — thiếu bằng chứng; nêu rõ cách giải
```

Bằng chứng đã thu thập tại revision:

| Lệnh / artifact | Kết quả |
|---|---|
| `npx vitest run src/__tests__/landingPage.test.tsx` | **13/13 PASS** (15.26s, 2026-09-25 22:36) |
| `dist/` build lúc 22:30 ngày 2026-09-25 | Landing chunk 68 419 B; CSS toàn app `index-*.css` **283 871 B**; entry `index-*.js` 193 371 B; `router-*.js` 148 022 B; `db-*.js` 103 274 B; `authStore-*.js` 77 663 B; `parishLogo-*.js` 83 608 B; ảnh hero `public/images/xu-doan-tap-the.jpg` **269 030 B** (1600×1143, JPEG duy nhất, không có WebP/AVIF/srcset) |
| `e2e/landing.spec.ts`, `e2e/design-system-matrix.ts`, `e2e/design-system-visual.spec.ts`, `e2e/a11y.spec.ts` | Đọc trực tiếp; phát hiện drift anchor (xem §2.4) |
| `npx playwright test e2e/a11y.spec.ts --project=chromium --grep "/ · desktop · light"` | **FAIL thật** (2026-09-25): `locator('main:has(#gioi-thieu-tieu-de)')` không tồn tại, timeout 15s tại `design-system-matrix.ts:189` (gọi từ `a11y.spec.ts:133`) — xác nhận runtime cho drift H1 |
| Sau khắc phục R-01..R-03 (cùng ngày) | `a11y.spec.ts --grep "/ · "` → **6/6 PASS**; `design-system-visual.spec.ts --grep "public routes"` → **6/6 PASS**; `landingPage` unit **13/13**; `lint:ds` **0** vi phạm/186 TSX; `tsc -b` **exit 0** |
| `npx playwright test e2e/landing.spec.ts` (sau khắc phục) | **5/7 PASS** — 2 test session tiền tồn (đã cô lập bằng stash: không do thay đổi landing; xem §2.7) |

---

## 1. Nghiên cứu chuyên sâu: các brand hàng đầu thế giới đang làm gì

### 1.1 Apple — kỷ luật chuyển động, không phải hiệu ứng

Nguồn: Brad Holmes, *"Why Most Scroll Animations Miss What Apple Gets Right"* (8/2025) — [brad-holmes.co.uk](https://www.brad-holmes.co.uk/web-performance-ux/why-most-scroll-animations-miss-what-apple-gets-right/).

Các kết luận cốt lõi có thể chuyển hóa trực tiếp:

1. **"The magic isn't in the movement. It's in the restraint."** Apple tách hai loại chuyển động:
   - *Content motion* (chữ fade, section pin, tiêu đề trượt nhẹ) — CSS transform/opacity nhẹ,
     không tốn tài nguyên;
   - *Graphical motion* (image sequence, video scrub, 3D reveal) — đắt, chỉ dùng **ở đúng
     khoảnh khắc** cần kể chuyện.
   Sai lầm phổ biến: biến mọi điểm chạm thành "cinematic" → trang nặng, giật, INP xấu.
2. **Mỗi chuyển động phải có nhiệm vụ**: reveal, direct, hoặc reinforce. Không có chuyển động "trang trí".
3. **Kỹ thuật tiến hóa**: từ image-sequence (hàng trăm ảnh, payload lớn) → **video scrubbing**
   (một video nén, scroll gắn với playback time) — cùng hiệu quả, chi phí nhỏ hơn nhiều.
   (Ghi chú áp dụng: Catevia ưu tiên CSS timeline trước; video chỉ khi có asset thật — xem §7 D-06.)
4. **Chuyển động hỏng khi**: tồn tại để chứng minh kỹ thuật; bắt người dùng chờ animation;
   thêm nhiễu thị giác cạnh tranh với nội dung; đánh đổi hiệu năng để "trông premium".
   Phép thử: *"If the animation makes the product feel smarter, keep it. If it makes the
   designer feel smarter, delete it."*
5. **Ngân sách hiệu năng**: scroll handler JS/re-render giết frame rate và **làm tăng INP**;
   phải test trên máy tầm trung, không test trên MacBook.

### 1.2 Stripe — proof-first, phân nhánh người dùng, progressive disclosure

Nguồn: SaaS Pattern, *Stripe: Website Breakdown* (cập nhật 2026-03-02) — [saaspattern.com/en/website-breakdowns/stripe](https://www.saaspattern.com/en/website-breakdowns/stripe).

| Pattern quan sát được | Số liệu cụ thể trên Stripe | Diễn giải |
|---|---|---|
| Hero = **một câu định vị duy nhất** + 3 việc cụ thể | "Financial infrastructure to grow your revenue" → accept payments / offer financial services / custom revenue models | Không liệt kê feature; nêu outcome + 3 nhánh hành động |
| **Dual-track CTA** tách self-serve và enterprise | "Start now" + "Contact sales" + "Sign up with Google" | Không ép enterprise vào funnel self-serve; giảm ma sát đăng ký |
| **Hard operational proof** giữa trang | US$1.4tn xử lý 2024; 99.999% uptime lịch sử; 500M+ API requests/ngày; 200M+ subscription; 135+ tiền tệ | Con số kiểm chứng được làm phần lớn việc thuyết phục cho buyer ngại rủi ro |
| **Segmentation không hard-fork** | "Stripe for enterprises / startups / platforms" | Nhiều lối vào nhưng một narrative xuyên suốt |
| **Progressive disclosure** | case study ghi rõ "Products used: Payments, Terminal, Connect…" | Người đọc tự chọn độ sâu; trang chính vẫn dễ đọc |
| **Developer credibility** | docs, GitHub, 10K+ API req/s, 150K+ tx/min | Tin cậy bằng năng lực kỹ thuật cụ thể |
| Pricing & support minh bạch | "no hidden fees", API status, changelog, support tiers | Giảm bất định vận hành |

### 1.3 Linear — "calm interface", cấu trúc phải được cảm nhận, không phải nhìn thấy

Nguồn: Linear, *A calmer interface for a product in motion* (2026-03-12) — [linear.app/now/behind-the-latest-design-refresh](https://linear.app/now/behind-the-latest-design-refresh);
Figma, *Karri Saarinen's 10 rules…* (2025-03-18) — [figma.com/blog/karri-saarinens-10-rules-for-crafting-products-that-stand-out](https://www.figma.com/blog/karri-saarinens-10-rules-for-crafting-products-that-stand-out/).

1. **"Don't compete for attention you haven't earned"**: phần tử phục vụ định hướng (sidebar, tab)
   phải **lùi lại**; phần tử trung tâm nhiệm vụ mới nổi. Cụ thể: giảm độ sáng sidebar, tab gọn hơn,
   giảm số icon và bỏ nền icon màu mè.
2. **"Structure should be felt not seen"**: viền/đường phân cách giảm số lượng, bo mềm, giảm tương phản
   — người dùng định hướng được mà không thấy "rừng đường kẻ".
3. **Palette ấm hơn, bớt bão hòa**: chuyển từ xám xanh lạnh sang xám ấm "crisp nhưng less saturated";
   tránh quá ấm gây "muddy".
4. **"If most people don't immediately notice what changed, that's probably a good sign"** —
   chất lượng nằm ở những thứ người dùng không phải nhìn thấy (bug không gặp, paper-cut đã biến mất).
5. Karri Saarinen: cam kết chất lượng từ lãnh đạo; đội nhỏ tiêu chuẩn cao; **"Data can be a crutch"** —
   đôi khi phải tin vào intuition/craft thay vì A/B test mọi thứ.

### 1.4 Dữ liệu chuyển đổi: 500 homepage B2B SaaS tốt nhất

Nguồn: CopyCrest, *"We Analyzed 500 B2B SaaS Homepages"* (2026-02-18; cửa sổ 11/2025–01/2026) — [copycrest.com/research/b2b-homepage-conversion-study](https://copycrest.com/research/b2b-homepage-conversion-study).

| Phát hiện | Mức tác động | Hàm ý cho Catevia |
|---|---|---|
| Hero nêu **outcome cụ thể** thay vì định vị chung chung | **+38%** conversion | H1 hiện tại mô tả sản phẩm; cần thêm tầng "kết quả cho xứ đoàn/gia đình" mà vẫn khớp giọng mục vụ |
| **Một CTA chính** trên màn đầu, không có 2 CTA ngang hàng | **+27%** | Hero hiện có 2 nút ngang trọng số (xem §2.3) |
| Proof theo **rủi ro của từng vai trò** (security/ROI/onboarding) | **+31%** demo-start | Phụ huynh quan tâm quyền riêng tư & điểm con; GLV quan tâm offline & thao tác nhanh |
| Tải < **2.5s** | **−19%** bounce trên traffic ý định cao | Trùng ngưỡng LCP "good" của CWV |
| Lặp lại **một core claim** từ hero → proof → microcopy cạnh nút | — | Cần "một câu xuyên suốt" cho Catevia (hiện narrative phân tán: Catevia / xứ đoàn / TNTT) |
| Microcopy tin cậy **ngay dưới nút** (thời gian, số khách hàng, điều kiện) | — | Ví dụ: "Tài khoản do xứ đoàn cấp — không cần tự đăng ký" |

### 1.5 Chuẩn kỹ thuật ngành (áp dụng bắt buộc cho plan)

1. **Core Web Vitals** (web.dev — [web.dev/articles/vitals](https://web.dev/articles/vitals), cập nhật 10/2024):
   đo tại **percentile 75** trên phân bố người dùng thật (field):
   - **LCP** good ≤ **2.5s** / needs-improvement 2.5–4.0s / poor > 4.0s;
   - **INP** good ≤ **200ms** / 200–500ms / poor > 500ms;
   - **CLS** good ≤ **0.1** / 0.1–0.25 / poor > 0.25.
2. **Scroll-driven animations** (Chrome for Developers — [developer.chrome.com/docs/css-ui/scroll-driven-animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations)):
   `animation-timeline: scroll()/view()` chạy **trên compositor, không cần JS scroll handler**;
   baseline khả dụng Chrome/Edge **115+** và Safari **26**; Firefox chưa mặc định → bắt buộc
   **progressive enhancement** bằng `@supports (animation-timeline: view())` + fallback tĩnh
   (đúng như code hiện tại) và guard `prefers-reduced-motion`.
3. **WCAG 2.2** (W3C, 10/2023 — [w3.org/WAI/standards-guidelines/wcag/new-in-22](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)):
   - 2.4.11 Focus Not Obscured (AA) — phần tử nhận focus không bị che khuất hoàn toàn
     (sticky header/CTA bar có thể che → phải kiểm);
   - 2.5.7 Dragging Movements (AA) — mọi thao tác kéo phải có alternative không kéo;
   - 2.5.8 Target Size Minimum (AA) — tối thiểu 24×24 CSS px (repo siết chặt hơn: **44px mobile**);
   - 3.2.6 Consistent Help (A) — kênh hỗ trợ xuất hiện nhất quán vị trí;
   - 3.3.7 Redundant Entry (A), 3.3.8 Accessible Authentication (AA).
4. **Xu hướng 2026** (Figma — [figma.com/resource-library/web-design-trends](https://www.figma.com/resource-library/web-design-trends/)):
   motion design, bold typography, dark mode, 3D/immersive, experimental navigation, sustainable
   web design; **accessibility & sustainability là must-have, không phải nice-to-have**.
   Cảnh báo áp dụng: Catevia phục vụ mục vụ — không chạy theo maximalism/neo-brutalism; chọn
   nhánh "calm premium" (Linear/Apple) thay vì "trend trang trí".

### 1.6 Bảng chuyển hóa: Pattern → Áp dụng cho Catevia

| Pattern nguồn | Nguyên tắc | Áp dụng cụ thể vào landing Catevia |
|---|---|---|
| Apple | Restraint; content motion ≠ graphical motion | Giữ hero dissolve + story focus (CSS, compositor). **Cắt bớt vòng lặp vô hạn trang trí** (8 thanh `card-border-beam`, laser scan, shimmer — xem §2.4/G6) |
| Apple | Chuyển động phải có nhiệm vụ | Chỉ để: reveal story, đồng bộ preview theo chương, chuyển cảnh hero → nội dung. Xóa hiệu ứng không phục vụ kể chuyện |
| Stripe | Một câu định vị + 3 nhánh việc | Rà lại hero copy thành outcome + 3 đích rõ: *Điểm danh & học vụ*, *Điều hành xứ đoàn*, *Đồng hành của phụ huynh* |
| Stripe | Hard operational proof | Thêm dải proof **chỉ từ dữ liệu thật được phép công bố** (xem §7 D-01): ví dụ "đang vận hành tại Xứ Đoàn Đức Mẹ Fatima — niên khóa 2025–2026" |
| Stripe | Progressive disclosure | Giữ mô hình "chương"; thêm liên kết sâu trong từng story (ảnh thật, mô tả quy trình) thay vì nhồi chữ |
| Linear | Don't compete for attention | Giảm nhiễu: bớt shimmer/beam; nav đang active mới nổi; preview là tâm điểm khi cuộn |
| Linear | Structure felt not seen | Thống nhất viền card, giảm tầng shadow/glow chồng nhau |
| CopyCrest | 1 CTA chính + microcopy dưới nút | Hero: 1 primary; đổi "Khám phá nền tảng" thành **text link**; thêm microcopy "Tài khoản do xứ đoàn cấp phát" |
| CopyCrest | Proof theo vai trò | Khối trust hiện tại đã theo pillar — bổ sung 1 dòng "dành cho ai" trong mỗi pillar |
| CWV | LCP/INP/CLS ngưỡng 75p | Cổng nghiệm thu §4; hero image + bootstrap là 2 đòn chính |
| WCAG 2.2 | Focus không bị che; touch target | Kiểm sticky header che focus (2.4.11); giữ 44px; nút hero glass phải đạt contrast |
| Figma trends | Accessibility là must-have | Không đánh đổi axe-zero lấy hiệu ứng |

---

## 2. Đánh giá chuyên sâu landing page hiện tại

### 2.1 Kiến trúc & inventory (theo thứ tự render)

| # | Khối | Component / vị trí | Neo điều hướng | Ghi chú kỹ thuật |
|---|---|---|---|---|
| 1 | Header public (sticky) | `LandingPage.tsx` L97–L210 | `#san-pham`, `#tieu-de-nganh`, `#cong-dang-nhap`, `#cau-hoi-thuong-gap` | Nền `parish-primary`, backdrop-blur; CTA đăng nhập đổi nhãn theo session; menu di động riêng |
| 2 | Hero toàn cảnh | `LandingParishGlassCard.tsx` (ghép tại L213–L215) | — | Ảnh thật 1600×1143, overlay tối 3 lớp, caustic glow, H1 L58, 2 CTA L71–89, thanh kính nhận diện L93–122, veil chuyển cảnh L125 |
| 3 | Scene 2 — Product Stage scrollytelling | `LandingPage.tsx` L221–L250 + `LandingWorkspaceStories.tsx` + `LandingHeroPreview.tsx` | `#san-pham` | 2 cột desktop: preview sticky (CSS L1100–1119) + 3 chapter `data-story-tab`; IntersectionObserver đồng bộ (LandingPage L48–78) |
| 4 | Scene 3 — Hành trình 5 ngành | `LandingBranchJourney.tsx` | `#tieu-de-nganh` | Rail màu ngũ sắc có scroll-driven grow (CSS L1168–1205); 5 card theo `BRANCHES` (nguồn dữ liệu nghiệp vụ thật) |
| 5 | Faith Moment | `LandingFaithMoment.tsx` | — | Nền `parish-primary`, trích dẫn Đức Mẹ Fatima, 4 Tôn Chỉ, niên khóa động từ `academicYearStore` |
| 6 | Trust Pillars | `LandingTrustStrip.tsx` | — | 4 trụ cột: Offline-First, RBAC, PWA desktop/mobile, dữ liệu thuộc giáo xứ |
| 7 | Hai cổng + Onboarding | `LandingAccessPaths.tsx` | `#cong-dang-nhap` | 2 card cổng ↔ đúng route `/login/nhan-su`, `/login/phuhuynh`; 3 bước "Lần đầu đến với Catevia?"; cam kết bảo mật |
| 8 | FAQ | `LandingFAQ.tsx` | `#cau-hoi-thuong-gap` | 6 câu accordion `aria-expanded/aria-controls` |
| 9 | Final CTA | `LandingPage.tsx` L270–L297 | — | Logo, 2 nút (phụ huynh/GLV), link xác thực chứng chỉ |
| 10 | Footer | `LandingPage.tsx` L301–L335 | `/about`, `/login`, `/verify` | Cam kết dữ liệu; kênh hỗ trợ chưa cụ thể (xem G-B3) |

Tổng: **10 khối nội dung**, 8 component landing được dùng + 1 file chết (G-I1), ~1 080 dòng TSX landing + ~430 dòng CSS primitive dành cho landing.

### 2.2 Điểm mạnh đã xác minh (giữ nguyên khi nâng cấp)

1. **Hero điện ảnh đúng chất "calm premium"** — ảnh tập thể xứ đoàn thật + scrim tương phản
   (`hero-text-scrim` L1236–1248), thứ tự entrance hữu hạn `hero-enter-1..4` (0.05s→0.46s,
   cubic-bezier(0.16,1,0.3,1), L1286–1300) — không phải animation vô hạn.
   *VERIFIED_OBSERVED — 20-primitives.css L1274–1300.*
2. **Scrollytelling Scene 2 là điểm sáng ngang tầm Apple/Linear về ý tưởng**: preview pin
   (sticky), chapter sync bằng IntersectionObserver, cross-fade panel
   (`preview-panel-fade` L1152–1166), story focus bằng CSS `view()` timeline
   (L1127–1150) — **không thư viện ngoài**, chạy trên compositor.
   *VERIFIED_OBSERVED — LandingPage.tsx L48–78; 20-primitives.css L1099–1166.*
3. **Progressive enhancement & reduced-motion chuẩn chỉnh**: toàn bộ scroll-driven nằm trong
   `@supports (animation-timeline: view())`; guard `prefers-reduced-motion: reduce` phủ
   hero/scrolly/beam/mockup/gold-enter (L1435–1450+). Firefox/no-support vẫn nhận bố cục tĩnh đầy đủ.
   *VERIFIED_OBSERVED — 20-primitives.css.*
4. **Nền tảng accessibility tốt**: skip link (LandingPage L94), mọi section có
   `aria-labelledby`, tablist preview có `role/aria-selected`, FAQ đúng chuẩn disclosure,
   alt text mô tả thật cho ảnh tập thể, touch target ≥44px cho CTA chính (E2E assert).
   *VERIFIED_OBSERVED + VERIFIED_NORMATIVE — e2e/landing.spec.ts L58–72.*
5. **Nội dung trung thực, đúng nghiệp vụ**: 3 không gian khớp đúng 3 workspace thật; 5 ngành lấy từ
   `constants/branches`; FAQ trả lời đúng quy trình cấp tài khoản thật; mockup ghi rõ
   "Ảnh minh họa — số liệu demo" (`LandingHeroPreview.tsx` L250–L253) — tránh hiểu nhầm dữ liệu thật.
   *VERIFIED_OBSERVED.*
6. **Hợp đồng test dày**: 13 unit test PASS (session-aware CTA, tab preview, FAQ, trust, niên khóa động)
   + 7 kịch bản E2E gồm 2 `@critical` (khách/session sống), viewport 320px không tràn ngang.
   *VERIFIED_OBSERVED — chạy 22:36 2026-09-25.*
7. **Metadata nền tảng PWA/social đã có**: title/description/OG/Twitter/theme-color, preconnect
   fonts, icon đầy đủ (`index.html` L6–L32). *VERIFIED_OBSERVED.*

### 2.3 Gap Matrix vs chuẩn world-class

#### A. Thông điệp & phân cấp CTA

| Mã | Hiện trạng (bằng chứng) | Chuẩn tham chiếu | Gap | Trạng thái |
|---|---|---|---|---|
| A1 | H1 chỉ mô tả sản phẩm: "Nền tảng quản lý Giáo lý…" (`LandingParishGlassCard.tsx` L58–L64); phụ đề nói phạm vi | CopyCrest: hero nêu outcome +38% | Chưa có câu "kết quả cho xứ đoàn/gia đình" nối tiếp H1 | VERIFIED_OBSERVED |
| A2 | 2 nút ngang trọng số: `btn-primary` "Bắt đầu đăng nhập" + nút viền "Khám phá nền tảng" (L71–L89) | CopyCrest: 1 CTA chính +27% | Cần 1 primary + 1 liên kết phụ | VERIFIED_OBSERVED |
| A3 | Không có microcopy dưới CTA | CopyCrest: proof-adjacent microcopy | Thêm 1 dòng định hướng (tài khoản do xứ đoàn cấp) | VERIFIED_OBSERVED |
| A4 | 3 tầng định vị khác nhau: "Nền tảng quản lý Giáo lý…" (hero) / "Một nền tảng. Ba không gian…" (Scene 2) / "Bền bỉ, an toàn…" (trust) | CopyCrest: lặp 1 claim xuyên suốt | Chưa chốt "một câu" chủ đạo | VERIFIED_OBSERVED |

#### B. Proof & độ tin cậy

| Mã | Hiện trạng (bằng chứng) | Chuẩn tham chiếu | Gap | Trạng thái |
|---|---|---|---|---|
| B1 | **Không có** testimonial nào trên trang | Stripe/CopyCrest: proof theo vai trò +31% | Thiếu chứng thực từ Cha Tuyên úy/Ban Điều Hành/GLV/phụ huynh (cần consent — BLOCKING, §7) | VERIFIED_OBSERVED |
| B2 | Không có số liệu vận hành công bố; `LandingStatsStrip` tồn tại nhưng **không được render** (0 import) | Stripe: hard numbers | Hoặc đưa số liệu thật đã được phép, hoặc bỏ hẳn component chết | VERIFIED_OBSERVED |
| B3 | Footer: "Hỗ trợ: liên hệ Ban Giáo Lý" — không kênh cụ thể (L321–L323) | WCAG 3.2.6 Consistent Help (A) | Cần kênh hỗ trợ cố định, nhất quán vị trí | VERIFIED_OBSERVED |

#### C. Kể chuyện sản phẩm

| Mã | Hiện trạng (bằng chứng) | Chuẩn tham chiếu | Gap | Trạng thái |
|---|---|---|---|---|
| C1 | Preview là mockup minh họa, ghi chú "Ảnh minh họa — số liệu demo" (L250–L253) | Stripe: sản phẩm thật + case study | Thiếu ảnh chụp app thật (đã che dữ liệu) | VERIFIED_OBSERVED |
| C2 | Story không có liên kết "xem sâu" | Stripe: progressive disclosure | Thêm điểm thoát sâu trong từng chapter | VERIFIED_OBSERVED |

#### D. Điều hướng & tương tác

| Mã | Hiện trạng (bằng chứng) | Chuẩn tham chiếu | Gap | Trạng thái |
|---|---|---|---|---|
| D1 | Không trạng thái active theo section, không progress rail | Linear: cấu trúc định hướng | Nav không phản hồi vị trí cuộn | VERIFIED_OBSERVED |
| D2 | Không có sticky CTA mobile; CTA chỉ ở hero/cuối trang | Chuẩn SaaS mobile | Trang 10 khối, thiếu điểm chuyển đổi giữa chừng | VERIFIED_OBSERVED |

#### E. Ngân sách chuyển động

| Mã | Hiện trạng (bằng chứng) | Chuẩn tham chiếu | Gap | Trạng thái |
|---|---|---|---|---|
| E1 | **8 vị trí** `card-border-beam` vòng lặp 5s + laser scan 3.5s + gold shimmer 6s + pulse dot; không tạm dừng ngoài viewport | Apple: restraint, motion có nhiệm vụ | Nhiễu thị giác + chi phí vô ích | VERIFIED_OBSERVED |
| E2 | `.scene-hero-bg { will-change: transform, filter }` thường trú (CSS L1046–1048) kể cả máy không hỗ trợ timeline | Best practice | Giữ layer GPU khi không cần | VERIFIED_OBSERVED |

#### F. Hiệu năng tải trang

| Mã | Hiện trạng (bằng chứng) | Chuẩn tham chiếu | Gap | Trạng thái |
|---|---|---|---|---|
| F1 | 1 file JPEG 269 030 B, 1600×1143, **không srcset/AVIF/WebP**; mobile tải full 1600px (LandingParishGlassCard L19–L27) | CWV LCP ≤2.5s | Payload mobile thừa 3–5× | VERIFIED_OBSERVED |
| F2 | `main.tsx` L25–27: `loadTokens()`, `loadFromStorage()`, `initDB()` chạy cho **mọi route** gồm `/`; dist: `index` 193KB + `router` 148KB + `authStore` 78KB + `db` 103KB + `LandingPage` 68KB (raw) | Landing world-class không kéo runtime app | Khách vãng lai tải Dexie/IndexedDB + auth runtime trước khi thấy giá trị | VERIFIED_OBSERVED (cấu trúc); độ lớn tác động HYPOTHESIS |
| F3 | `index-*.css` **283 871 B** dùng chung cho landing | Budget CSS trang public | Tailwind v4 một sheet; chưa critical split | VERIFIED_OBSERVED |
| F4 | Inter tải từ Google Fonts async swap (`fontLoader.ts`); CSP cho phép `fonts.gstatic` (server `security.ts` L21; `nginx.conf` L22–25) | Self-host subset | 2 origin bên thứ ba; chưa subset tiếng Việt | VERIFIED_OBSERVED |
| F5 | **Chưa từng đo** Lighthouse/CWV (không có script; CI không Lighthouse) | quantitative-targets | Mọi target hiệu năng là CANDIDATE đến khi đo baseline | UNKNOWN |

#### G. SEO & chia sẻ

| Mã | Hiện trạng (bằng chứng) | Chuẩn tham chiếu | Gap | Trạng thái |
|---|---|---|---|---|
| G1 | `og:image` là đường dẫn **tương đối** `/images/xu-doan-tap-the.jpg` (index.html L15, L20) | Scraper cần URL tuyệt đối | Zalo/Facebook có thể không hiện ảnh | VERIFIED_OBSERVED |
| G2 | Không có `robots.txt`, `sitemap.xml`, `canonical` (đã kiểm tra `public/`); SPA client-render | Chuẩn web công khai | Thiếu đường dẫn index; canonical không kiểm soát | VERIFIED_OBSERVED |
| G3 | Không có JSON-LD (0 kết quả toàn repo) | Structured data | Thiếu `Organization`/`WebSite`/`NGO` | VERIFIED_OBSERVED |
| G4 | `index.html` title = "Xứ Đoàn Đức Mẹ Fatima…" nhưng LandingPage đổi bằng JS thành "Catevia — Quản lý Giáo lý…" (L31–L37) | Social bot không chạy JS | Scraper thấy title khác người dùng | VERIFIED_OBSERVED |

#### H. Lưới an toàn E2E/A11y cho `/` — **phát hiện nghiêm trọng**

| Mã | Hiện trạng (bằng chứng) | Chuẩn tham chiếu | Gap | Trạng thái |
|---|---|---|---|---|
| H1 | `e2e/design-system-matrix.ts` L43–44 chờ readySelector `#gioi-thieu-tieu-de` + mainSelector `main:has(#gioi-thieu-tieu-de)`. Id này **đã bị xóa** khỏi landing tại commit `e6e24fb` (diff: nav `href="#gioi-thieu-tieu-de"` → `#san-pham`; h1 cũ mất id) và **không còn tồn tại ở bất kỳ file src nào**. `openPublicObservation` L186–L195 `page.goto('/')` → `expect(main).toBeVisible()` fail ngay (mainSelector không match) hoặc `ready` timeout 15s. `design-system-visual.spec.ts` L34 chọn `main:has(#gioi-thieu-tieu-de)` → `mainClientWidth = 0` → assertion L48 fail | Matrix là gate a11y + visual layout cho public routes (a11y.spec L127–133; visual spec L95–113) | Toàn bộ 6 test a11y `/(× 3 viewport × 2 theme)` + 6 kịch bản visual landing fail; lưới an toàn a11y/visual của landing mất hiệu lực từ e6e24fb | **DRIFT → ĐÃ KHẮC PHỤC 2026-09-25** (R-01, xem §2.7) |

#### I. Sức khỏe mã nguồn

| Mã | Hiện trạng (bằng chứng) | Chuẩn tham chiếu | Gap | Trạng thái |
|---|---|---|---|---|
| I1 | `LandingStatsStrip.tsx` không được import ở bất kỳ đâu (0 usage toàn repo); `docs/02_ARCHITECTURE.md` L30 ghi "landing: 9" | Vệ sinh kiến trúc + `lint:architecture-inventory` | Hoặc tích hợp có chủ đích, hoặc xóa + sync inventory | VERIFIED_OBSERVED |
| I2 | `#tieu-de-nganh` là id section nhưng mang tên kiểu heading (`LandingBranchJourney.tsx` L35); section khác dùng id nghiệp vụ (`#cong-dang-nhap`) | Nhất quán IA | Dễ drift lần sau | VERIFIED_OBSERVED |
| I3 | Hero H1 không còn `id` ổn định để làm observation anchor | Contract E2E | Nguyên nhân trực tiếp của H1 | VERIFIED_OBSERVED |

#### J. Trung thực trình diễn

| Mã | Hiện trạng (bằng chứng) | Chuẩn tham chiếu | Gap | Trạng thái |
|---|---|---|---|---|
| J1 | Mockup ghi "Trực tuyến" + chấm pulse trong khung demo minh họa | Minh bạch | Ổn nhờ footnote "Ảnh minh họa — số liệu demo" (cần giữ nguyên khi redesign) | ALIGNED |

### 2.4 Tổng hợp phát hiện P0 (bắt buộc xử lý trước khi nâng cấp)

1. **P0-01 — Khôi phục lưới an toàn E2E cho `/`** (H1/I3). Hai phương án, khuyến nghị (a):
   (a) *Khôi phục anchor*: gắn `id="gioi-thieu-tieu-de"` trở lại H1 hero
   (`LandingParishGlassCard.tsx`) — matrix hiện tại tự khớp lại, không cần sửa E2E;
   (b) *Đổi contract*: cập nhật đồng bộ `readySelector` + `mainSelector` + selector containment
   trong `design-system-matrix.ts` và `design-system-visual.spec.ts` sang neo mới ổn định
   (ví dụ `data-testid="landing-hero"`). Phương án (a) là minimum sufficient delta; (b) chỉ nên
   làm kèm một anchor `data-*` chủ đích nếu muốn tách khỏi id trình bày.
2. **P0-02 — Đo baseline hiệu năng trước khi đặt mục tiêu số** (F5): chạy Lighthouse
   mobile profile (Slow 4G, 4× CPU throttle) + ghi riêng LCP element/INP candidates; lưu artifact
   đo vào PR/CI để so sánh sau. Không đặt target "cảm tính".
3. **P0-03 — Quyết định số liệu/chứng thực công bố được** (B1/B2 — BLOCKING product decision):
   chỉ công bố gì có thẩm quyền (xem §7). Không bịa testimonial/số liệu (điều cấm tuyệt đối).
4. **P0-04 — Dọn `LandingStatsStrip`** (I1): tích hợp có chủ đích (P2) hoặc xóa kèm sync inventory.

### 2.5 Truth Matrix

| # | Claim | Observed | Normative | Status | Evidence |
|---|---|---|---|---|---|
| 1 | `/` là route công khai, không cần đăng nhập | Route render cho khách | `ROUTE_POLICIES['/']` requiresAuth=false | ALIGNED | `src/constants/routePolicy.ts` L64; `e2e/landing.spec.ts` L11–19 |
| 2 | Unit contract landing 13/13 PASS | PASS 15.26s | Không bắt buộc số lượng test | VERIFIED_OBSERVED | `npx vitest run src/__tests__/landingPage.test.tsx` (22:36 2026-09-25) |
| 3 | Scrollytelling không dùng thư viện animation ngoài | Chỉ CSS + IntersectionObserver | Zero-dep motion (commit e6e24fb) | ALIGNED | `LandingPage.tsx` L48–78; `20-primitives.css` L1061–1205; `package.json` không có lib motion |
| 4 | Reduced-motion được tôn trọng | Guard phủ hero/scrolly/beam/mockup/gold | WCAG 2.2 / best practice | ALIGNED | `20-primitives.css` L1435–1450+ |
| 5 | **Matrix E2E của `/` đang gãy** | readySelector không tồn tại trong DOM; **đã tái hiện runtime** | Matrix là gate bắt buộc | **DRIFT** | `design-system-matrix.ts` L43–44, L186–195; `design-system-visual.spec.ts` L34, L48; `git show e6e24fb` diff xóa id; Playwright run 2026-09-25 FAIL tại matrix L189 |
| 6 | Khách vãng lai tải bootstrap app (Dexie/auth) cho `/` | `initDB()` chạy không điều kiện | Landing không nên kéo runtime app | VERIFIED_OBSERVED (cấu trúc) | `src/main.tsx` L25–27; dist chunks `db-*.js` 103KB, `authStore-*.js` 78KB |
| 7 | Ảnh hero là JPEG đơn cỡ 269KB | 1 file, không srcset | LCP budget | VERIFIED_OBSERVED | `public/images/xu-doan-tap-the.jpg`; `LandingParishGlassCard.tsx` L19–27 |
| 8 | Không có proof/testimonial trên trang | 0 testimonial/quote | Proof theo vai trò | VERIFIED_OBSERVED | render toàn trang §2.1 không có khối nào |
| 9 | `LandingStatsStrip` là dead code | 0 import | Inventory chính xác | VERIFIED_OBSERVED | grep toàn repo; `docs/02_ARCHITECTURE.md` L30 |
| 10 | Metadata social/SEO còn lỗ hổng | og:image tương đối; thiếu canonical/robots/sitemap/JSON-LD | Chuẩn web công khai | VERIFIED_OBSERVED | `index.html` L15/L20; `public/` không có robots/sitemap |
| 11 | CSS toàn cục phục vụ landing rất lớn | 283 871 B/1 sheet | Budget trang public | VERIFIED_OBSERVED (số build) | `dist/assets/index-*.css` (22:30 2026-09-25) |
| 12 | Không có sticky CTA mobile / scrollspy | Không có element tương ứng | Chuẩn SaaS mobile | VERIFIED_OBSERVED | `LandingPage.tsx` toàn văn không có; chỉ header sticky |

### 2.6 Unknowns (cần giải trước/khi triển khai)

| Mã | Unknown | Cách giải |
|---|---|---|
| U1 | Baseline CWV/Lighthouse của `/` (mobile + desktop) | Chạy Lighthouse mobile profile + PageSpeed Insights (nếu có domain public); ghi artifact vào PR |
| U2 | CI có thực sự chạy matrix a11y/visual sau e6e24fb không | Kiểm tra run gần nhất của `.github/workflows/ci.yml` (bước Playwright) — nếu có run xanh thì cần điều tra vì sao matrix không bắt drift (ví dụ matrix không nằm trong CI lane) |
| U3 | Thẩm quyền công bố số liệu vận hành & quote | Ban Điều Hành/Ban Giáo Lý xác nhận (BLOCKING, §7) |
| U4 | Tỷ trọng trình duyệt thiết bị thực tế (Safari <26 chịu fallback tĩnh) | Không có analytics; chấp nhận progressive enhancement (fallback đầy đủ) |
| U5 | Hệ quả việc defer `initDB()`/auth bootstrap cho luồng protected (session, refresh, offline) | Bắt buộc current-truth điều tra riêng tại implementation: `authStore` restore, refresh-token continuity, RootLayout redirect; không được phá invariant phiên |
| U6 | Có sẵn screenshot app sạch dữ liệu + consent cho ảnh | Chuẩn bị demo dataset riêng, chụp bằng tài khoản demo |

### 2.7 Khắc phục P0 đã thực hiện ngay (2026-09-25) — hồ sơ bằng chứng

Trong lúc kiểm chứng P0-01, ba vấn đề thật đã lộ ra và được xử lý tối thiểu ngay trong working tree:

| # | Vấn đề | Bằng chứng trước fix | Khắc phục | Xác minh sau fix |
|---|---|---|---|---|
| R-01 | Anchor observation của `/` mất từ e6e24fb | Playwright: `locator('main:has(#gioi-thieu-tieu-de)')` not found, timeout 15s tại `design-system-matrix.ts:189` | Gắn lại `id="gioi-thieu-tieu-de"` cho H1 hero (`LandingParishGlassCard.tsx` L58) | **a11y `/` 6/6 PASS** (3 viewport × 2 theme, 1.2m); visual public routes 6/6 PASS |
| R-02 | **Nợ contrast AA bị che khuất**: card story không active giảm opacity làm chữ còn **2.62:1** (< 4.5); CTA hero bị axe đo giữa animation entrance → **1.22:1** | axe output `test-results/…/error-context.md` (2026-09-25) | Bỏ giảm opacity chữ ở cả 3 story state (`opacity-85 lg:opacity-60` → bỏ; giữ `scale-[0.99]`/border/shadow làm tín hiệu focus); `storyBeatFocus` 0% `opacity: 0.55` → `1` | a11y `/` 6/6 PASS; `landingPage` unit 13/13; `lint:ds` 0 vi phạm (186 TSX) |
| R-03 | `settleFiniteAnimations` **treo** trên landing vì animation `view()` timeline (`storyBeatFocus`, `branchTrackGrow`) không bao giờ "finished" theo thời gian | Probe tạm: `timeline: "ViewTimeline"`, `iterations: 1`, `progress: 0`, `playState: "running"` (trang protected không có loại này nên chưa từng lộ) | Loại animation ngoài `DocumentTimeline` khỏi settle + chặn trên 4s; gọi settle trong `runAxeStable` trước khi scan (kèm reopen khi context bị hủy); export helper cho a11y.spec | Toàn bộ a11y `/` chạy ổn định 6/6; `tsc -b` exit 0 |

**Phát hiện tiền tồn (KHÔNG thuộc phạm vi landing, KHÔNG do các thay đổi này):**
2 test session trong `e2e/landing.spec.ts` (`@critical session nhân sự…`, `session phụ huynh…`) fail trong
working tree hiện tại — sau `loginAsAdmin/loginAsRole` (dùng `injectSession`), app vẫn ở `/login`
(portal chooser) thay vì công nhận phiên, nên CTA "Vào hệ thống" không xuất hiện.
Đã **cô lập nguyên nhân** bằng `git stash` 3 file UI landing rồi chạy lại: **vẫn fail y hệt** →
thuộc luồng auth/session đang chỉnh sửa dở trong working tree (`src/stores/authStore.ts`,
`src/lib/api/core.ts` có thay đổi chưa commit). 5/7 test còn lại của spec PASS.
Đề xuất: xử lý trong workstream auth, sau đó chạy lại `e2e/landing.spec.ts` để đạt 7/7 (Q2).

---

## 3. Kế hoạch nâng cấp (Change Impact → Plan)

### 3.1 Tuyên ngôn thiết kế landing Catevia (ràng buộc cho mọi task)

1. **Calm premium, không phô diễn** (Apple/Linear): mỗi chuyển động phải phục vụ kể chuyện;
   không thêm hiệu ứng để "trông công nghệ".
2. **Một câu định vị xuyên suốt** (CopyCrest): hero → proof → CTA dùng chung một lõi thông điệp:
   *"Catevia — nền tảng đồng hành Giáo lý & Thiếu Nhi Thánh Thể của Xứ Đoàn Đức Mẹ Fatima"*.
3. **Một CTA chính mỗi màn** (CopyCrest +27%): hero 1 primary + 1 liên kết phụ; giữ nguyên hành vi
   session-aware (khách → `/login`, đã đăng nhập → workspace đúng vai trò).
4. **Proof không bịa** (Stripe nhưng có lương tâm dữ liệu): chỉ công bố facts có thẩm quyền;
   cấm testimonial/số liệu không được phép. Mockup luôn giữ ghi chú "Ảnh minh họa".
5. **Tốc độ là một phần của sự tôn trọng**: LCP mobile ≤ 2.5s; không kéo runtime app cho khách
   vãng lai khi không cần; giữ zero external animation libraries.
6. **A11y là điều kiện tiên quyết** (WCAG 2.2 AA; repo 44px mobile): axe-zero, focus không bị che,
   reduced-motion, và **lưới E2E phải xanh trước khi merge** (khôi phục P0-01 trước tiên).

### 3.2 Giai đoạn P0 — Khôi phục lưới an toàn & baseline (bắt buộc trước mọi thay đổi lớn)

| ID | Việc | Current → Target | File/hành động | Cổng nghiệm thu | Rủi ro |
|---|---|---|---|---|---|
| T01 | Khôi phục observation anchor cho `/` (H1/I3) | Mất `#gioi-thieu-tieu-de` → H1 hero có lại `id="gioi-thieu-tieu-de"` (data-* chủ đích để tính sau nếu cần) | `src/components/landing/LandingParishGlassCard.tsx` (h1 L58) | ✅ **ĐÃ THỰC HIỆN 2026-09-25**: a11y `/` 6/6 PASS; visual public 6/6 PASS; unit 13/13; `tsc -b` exit 0 | Rất thấp — thêm attribute, không đổi hành vi |
| T02 | Đo baseline hiệu năng & lưu artifact (F5/U1) | Chưa từng đo → có bảng baseline LCP/INP/TBT/CLS + LCP element + payload | Chạy Lighthouse mobile/desktop trên build production (`npm run build:frontend` + `npm run preview` hoặc dist Render); ghi số vào PR + phụ lục tài liệu này | Artifact đo có ngày/commit/profile rõ ràng | Không đổi code |
| T03 | Xác minh CI có chạy matrix a11y/visual (U2) | UNKNOWN → xác nhận lane CI + kết quả gần nhất; nếu matrix không nằm trong CI, bổ sung vào workflow | `.github/workflows/ci.yml` (đọc; chỉ sửa nếu thiếu lane) | Báo cáo run ID/kết quả; matrix được chạy trong CI sau thay đổi | Thấp |
| T04 | Dọn `LandingStatsStrip` (I1) | Dead code 0 usage → hoặc xóa file + sync `docs/02_ARCHITECTURE.md`, hoặc đánh dấu rõ sẽ tái sử dụng ở T21 | `src/components/landing/LandingStatsStrip.tsx`; `docs/02_ARCHITECTURE.md` | `npm run lint:architecture-inventory` xanh | Thấp |
| T05 | Nợ contrast AA lộ ra khi gate chạy lại (R-02, **phát sinh**) | Chữ story không active 2.62:1 và CTA hero bị đo giữa animation → loại bỏ dim chữ, giữ focus bằng scale/border/shadow | `src/components/landing/LandingWorkspaceStories.tsx` (3 state), `20-primitives.css` (`storyBeatFocus`) | ✅ **ĐÃ THỰC HIỆN 2026-09-25**: a11y `/` 6/6 + visual public 6/6 PASS | Thấp — giữ nguyên tín hiệu focus bằng border/shadow |
| T06 | `settleFiniteAnimations` treo vì animation `view()` (R-03, **phát sinh**) | Probe xác định ViewTimeline không bao giờ finished → loại timeline cuộn khỏi settle + chặn trên 4s; settle trước axe scan | `e2e/design-system-matrix.ts`, `e2e/a11y.spec.ts` | ✅ **ĐÃ THỰC HIỆN 2026-09-25**: a11y suite chạy ổn định; `tsc -b` exit 0 | Thấp |

### 3.3 Giai đoạn P1 — Nền tảng world-class: hiệu năng, metadata, a11y

| ID | Việc | Current → Target | Ghi chú thiết kế (minimum sufficient) | Cổng nghiệm thu |
|---|---|---|---|---|
| T10 | Ảnh hero responsive (F1) | 1×JPEG 269KB/1600px → AVIF+WebP+JPEG fallback, `srcset`/`sizes` (mobile ~640/828w, desktop 1280/1600w), giữ `width/height` để CLS=0, `fetchpriority="high"` chỉ cho biến thể LCP | Sinh biến thể offline, commit asset (không thêm dependency runtime). Nếu team chấp nhận devDependency `sharp`, thêm script sinh ảnh; nếu không, quy trình thủ công + ghi chú nguồn | LCP mobile lab cải thiện so baseline; `document` không CLS mới; unit ảnh cập nhật (`landingPage.test.tsx` L124–131) |
| T11 | Public-first bootstrap (F2/U5) | `initDB()` tĩnh trong `main.tsx` → dynamic import trì hoãn cho public route, kích hoạt sớm trên protected route/idle; **giữ nguyên `loadTokens()` + auth restore** để CTA session-aware và redirect không đổi | **Bắt buộc current-truth điều tra trước** (auth continuity, refresh-token, offline first-sync, RootLayout redirect). Không được phá invariant phiên/offline. Chỉ defer phần chắc chắn không nằm trên đường tới hạn của public first paint | E2E auth critical + tenant/session suites xanh; bundle entry public giảm (đo lại); unit `authLogoutLifecycle` xanh |
| T12 | Metadata & SEO nền (G1–G4) | og:image tương đối, thiếu canonical/robots/sitemap/JSON-LD, title lệch → URL tuyệt đối cho og/twitter + `og:url` + `og:locale` + `og:site_name`; `canonical`; `robots.txt` + `sitemap.xml` (chỉ `/`, `/about`, `/login`… trang public thật); JSON-LD `Organization` + `WebSite`; thống nhất title/description tĩnh khớp nội dung landing | Không nhồi từ khoá; tiếng Việt chuẩn; JSON-LD chỉ thông tin công khai của giáo xứ đã có trong footer/hero | Kiểm tra thủ công: Facebook Sharing Debugger / Zalo preview hiển thị đúng ảnh+title; Lighthouse SEO ≥ 95 (candidate) |
| T13 | A11y hardening theo WCAG 2.2 (H1 liên quan) | Sticky header có thể che focus target khi nhảy anchor → thêm `scroll-padding-top` cho `html`/`body` khớp chiều cao header; kiểm focus ring trên nền ảnh hero; đảm bảo nút glass đạt contrast | Chỉ chỉnh CSS token + thuộc tính, không đổi cấu trúc | axe vẫn 0 vi phạm (sau T01 lưới chạy lại); kiểm thủ công 2.4.11 với `Tab` qua toàn trang |
| T14 | Ngân sách CSS/asset + cảnh báo hồi quy (F3) | 283 871 B CSS + không có budget → có script đối chiếu kích thước sau `vite build` (ngưỡng CANDIDATE §4), báo fail nếu vượt; ghi rõ đây là lab guard, không thay CWV field | Không cần hạ tầng mới: node script đọc `dist/assets` | Script chạy trong `verify:ci` (hoặc lane phù hợp) và fail đúng khi vượt ngưỡng |
| T15 | Font subset self-host (F4, DEFERRABLE) | Google Fonts 2 origin → (tuỳ quyết định §7) self-host WOFF2 subset tiếng Việt, `font-display: swap`, preload đúng 1–2 file; giữ fallback `system-ui` như hiện tại | CSP `font-src 'self'` đã sẵn (nginx L22–25, server `security.ts` L21) — không cần nới CSP; nếu giữ Google Fonts thì thêm `size-adjust` fallback để giảm dịch chuyển | Không tăng CLS; LCP không đổi xấu; kiểm tra CSP không vi phạm |

### 3.4 Giai đoạn P2 — Trải nghiệm & độ tin cậy (nâng cấp "chất world-class")

| ID | Việc | Current → Target | Ghi chú triển khai | Cổng nghiệm thu |
|---|---|---|---|---|
| T20 | Hero message & CTA (A1–A4) | H1 mô tả sản phẩm + 2 CTA ngang hàng + 3 claim rời → H1 giữ nguyên (giàu nghĩa, đúng thương hiệu) **kèm dòng outcome** "Để nhà xứ đồng hành cùng các em — từ điểm danh, điểm số đến đời sống đức tin."; CTA chính "Bắt đầu đăng nhập" + **liên kết text** "Khám phá nền tảng ↓"; microcopy dưới CTA "Tài khoản do Xứ đoàn cấp phát — không cần tự đăng ký" | Chỉ sửa `LandingParishGlassCard.tsx` + text; giữ logic `homeTo` session-aware và test hiện có; cập nhật `landingPage.test.tsx` theo contract mới | Unit landing cập nhật xanh; E2E hero CTA xanh; axe-zero `/` (sau T01) |
| T21 | Dải Proof có thẩm quyền (B1/B2) | Không có proof → **Proof Rail cấu trúc** (facts phi cá nhân): "5 ngành TNTT", "3 không gian làm việc", "2 cổng truy cập", "1 tài khoản — 1 vai trò", "Đang vận hành tại Xứ Đoàn Đức Mẹ Fatima — Niên khóa {năm}" (lấy từ `academicYearStore` như Faith Moment). Quote thật (Cha Tuyên úy/Ban Điều Hành/GLV/phụ huynh) **chỉ khi có consent** theo §7 | Tái sử dụng/đổi tên `LandingStatsStrip`; đặt sau Scene 2 như Stripe đặt proof giữa trang; số liệu động theo năm học | Nội dung khớp thực tế; unit test render proof rail; không có số liệu bịa (review tay) |
| T22 | Hình ảnh sản phẩm thật + deep disclosure (C1/C2) | Mockup minh họa → bổ sung **ảnh chụp app thật với dữ liệu demo** cho 3 không gian (kèm alt chi tiết, giữ footnote minh họa nếu ảnh có số demo); mỗi chapter thêm liên kết "Xem chi tiết quy trình" mở rộng nội dung ngay trong trang (`<details>`/panel) thay vì nhồi chữ | Ảnh phải che/không chứa dữ liệu thật; kích thước chia sẻ đúng; `loading="lazy"` + width/height | Ảnh tải lazy không ảnh hưởng LCP; axe vẫn 0; kiểm tra không lộ dữ liệu (review tay commit) |
| T23 | Wayfinding & chuyển đổi giữa trang (D1/D2) | Không scrollspy/progress/sticky CTA → nav header highlight section đang xem; progress rail mảnh trên cùng (chỉ desktop, `transform: scaleX`, không layout shift); **sticky CTA bar mobile** xuất hiện sau hero, ẩn khi Final CTA vào view; nút "Lên đầu trang" nhẹ nhàng | Sticky bar phải: cao ≥44px, `env(safe-area-inset-bottom)`, không che focus (2.4.11), tôn trọng reduced-motion (fade không bắt buộc), không đè InstallPrompt của PWA — kiểm tra `RootLayout` (InstallPrompt chỉ ở public layout) | E2E mới: sticky bar xuất hiện/ẩn đúng ngưỡng viewport 320–390px; axe-zero |
| T24 | Ngân sách chuyển động (E1/E2) | 8 beam vô hạn + laser + shimmer + will-change thường trú → chỉ giữ beam ở **hero + final CTA** (2 vị trí), bỏ beam trên card thường; giữ story focus/dissolve/rail; đưa `will-change` vào trong `@supports` và `scene-hero-bg` chỉ khi có timeline; cân nhắc `animation-play-state: paused` ngoài viewport (nếu không làm phức tạp) | Không dùng JS scroll để tắt animation (tránh INP); ưu tiên đơn giản: bỏ hẳn hiệu ứng không cần thiết thay vì cơ chế pause | Đếm lại số animation vô hạn trong review; reduced-motion vẫn phủ; không hồi quy visual |
| T25 | FAQ polish (D3) | Expand tức thời → animation mở/đóng bằng `grid-template-rows` (không JS height đo); thêm 2 câu hỏi thực tế: "Nếu điện thoại của tôi bị mất hoặc đổi số điện thoại?"; "Ai có thể xem dữ liệu điểm của con tôi?"; giữ nguyên 6 câu cũ + hợp đồng test | `LandingFAQ.tsx`; nội dung trả lời khớp nghiệp vụ thật (không hứa quy trình không tồn tại) | Unit FAQ cập nhật 8 câu; axe-zero; reduced-motion không giật |
| T26 | Kênh hỗ trợ nhất quán (B3, WCAG 3.2.6) | Footer/FAQ ghi "liên hệ Ban Giáo Lý" chung chung → cùng một dòng hỗ trợ cố định ở footer + cuối FAQ (ví dụ "Hỗ trợ: GLV chủ nhiệm lớp hoặc Ban Điều hành Xứ đoàn — trong giờ sinh hoạt") | Chỉ dùng kênh thật, đã xác nhận; cùng vị trí/nhãn ở mọi nơi | Review tay; axe-zero |

### 3.5 Giai đoạn P3 — Đo lường & vòng lặp cải tiến

| ID | Việc | Current → Target | Ghi chú | Cổng nghiệm thu |
|---|---|---|---|---|
| T30 | Runbook hiệu năng + ngưỡng §4 | Không có quy trình đo → script/npm task + hướng dẫn chạy Lighthouse mobile profile, lưu baseline theo commit; so sánh sau mỗi thay đổi landing | Có thể dùng Lighthouse CLI ngoài repo (không thêm hạ tầng nếu chưa cần); chỉ thêm vào CI khi ổn định | Runbook được thực thi 1 lần và cho số liệu |
| T31 | Theo dõi field (nếu có domain public) | Không có field data → CrUX/PSI theo dõi định kỳ sau khi lên production; nếu không có domain public, ghi rõ giới hạn lab-only | Không thêm analytics cá nhân hoá; nếu thêm đo lường cần quyết định privacy (§7) | Báo cáo số liệu field kèm ngày |
| T32 | Ảnh regression visual cho landing | Matrix đã chụp screenshot khi chạy (visual spec L26–30) → mở rộng anchor/observation cho các trạng thái mới (sticky bar, scrollspy active) | Tận dụng `captureLayoutEvidence` sẵn có | Artifact screenshot trong CI/PR |
| T33 | Quyết định analytics | Không có → hoặc giữ nguyên "không analytics" (khuyến nghị cho giai đoạn này), hoặc chỉ dùng số liệu tổng hợp không cookie | BLOCKING nếu muốn thêm; mặc định KHÔNG thêm | Ghi nghị quyết vào tài liệu |

### 3.6 Tổng hợp task, phụ thuộc & bán kính ảnh hưởng

| ID | Phase | Phụ thuộc | Bán kính ảnh hưởng | Công sức | Rủi ro chính |
|---|---|---|---|---|---|
| T01 | P0 | — | `LandingParishGlassCard.tsx`; E2E matrix (không đổi file E2E) | S | Gần như không |
| T02 | P0 | — | Không đổi code; artifact đo | S | Số liệu lab ≠ field (ghi rõ) |
| T03 | P0 | — | `.github/workflows/ci.yml` (chỉ đọc, sửa nếu thiếu) | S | Không |
| T04 | P0 | — | 1 file component + `docs/02_ARCHITECTURE.md` | S | Inventory count |
| T10 | P1 | T02 (baseline) | `public/images/*`, `LandingParishGlassCard.tsx`, `landingPage.test.tsx` | M | Chất lượng ảnh nén; test ảnh |
| T11 | P1 | T02, điều tra U5 | `src/main.tsx`, bootstrap stores, offline init | **L** | **Chạm luồng phiên/offline — phải phân loại lại D3 khi triển khai** |
| T12 | P1 | — | `index.html`, `public/robots.txt`, `public/sitemap.xml`, (tuỳ chọn head manager) | M | Nội dung JSON-LD phải đúng thẩm quyền |
| T13 | P1 | T01 | CSS global + landing hero | S | Không |
| T14 | P1 | T02 (số baseline) | `scripts/`, `package.json` | M | Ngưỡng CANDIDATE dễ gây fail oan nếu CI khác môi trường |
| T15 | P1 | §7 D-04 | `index.html`, `fontLoader.ts`, `public/fonts/*` | M | Font subset che ký tự; CLS swap |
| T20 | P2 | §7 D-01 (một phần) | Hero component + unit test | S | Copy phải được duyệt nội dung mục vụ |
| T21 | P2 | §7 D-01 | `LandingStatsStrip.tsx` (tái cấu trúc) + LandingPage | M | **Không được bịa số liệu/quote** |
| T22 | P2 | §7 D-06, U6 | landing assets + stories | M | Rò dữ liệu thật trong ảnh |
| T23 | P2 | T01 (anchor mới) | `LandingPage.tsx`, CSS, E2E mới | M | Che focus (2.4.11); xung đột InstallPrompt |
| T24 | P2 | — | `20-primitives.css`, các landing component có beam | S | Hồi quy thị giác nhẹ |
| T25 | P2 | — | `LandingFAQ.tsx`, unit test | S | Nội dung phải khớp nghiệp vụ |
| T26 | P2 | §7 D-01 (kênh thật) | Footer, FAQ | S | Không |
| T30–T33 | P3 | P0/P1 | Scripts/docs/CI | M | Kỳ vọng field data khi chưa có domain |

### 3.7 Writer / Reader Map (vì sao landing an toàn về dữ liệu)

- Landing **không ghi** bất kỳ business fact nào; không tạo writer mới; không đọc dữ liệu học sinh.
- Reader duy nhất có tính động: `useAcademicYearStore` (niên khóa hiển thị) — chỉ đọc, đã có
  fallback `2025-2026` (`normalizeAcademicYear`, dùng ở `LandingParishGlassCard` L12–L14,
  `LandingFaithMoment` L8–L10, `LandingHeroPreview` L26–L28).
- T11 chỉ **thay đổi thứ tự khởi động client**, không tạo writer/authority mới; mọi thẩm quyền
  phiên vẫn thuộc `authStore` + server. Vì vậy đây là thay đổi orchestration, không phải thay
  đổi nghiệp vụ — nhưng hệ quả lên continuity là thật và phải được verify như D3 tạm thời.
- Không có thay đổi schema/migration; không có thay đổi authorization.

### 3.8 Không thuộc phạm vi (Non-goals)

- Không đa ngôn ngữ (sản phẩm phục vụ tiếng Việt; không thêm hạ tầng i18n chỉ cho landing).
- Không pricing/plans (Catevia cấp tài khoản theo xứ đoàn, không bán self-serve).
- Không chat/AI widget trên landing (không cần thiết, tăng rủi ro riêng tư).
- Không video nền tự động (autoplay) — chỉ cân nhắc video tour khi có asset thật, có nút phát
  (xem §7 D-06 nếu muốn bổ sung sau).
- Không third-party analytics mặc định.
- Không sao chép hình ảnh/typography/asset của brand khác; chỉ học pattern.

---

## 4. Cổng nghiệm thu đo lường được (Quantitative Targets)

Theo kỷ luật quantitative-targets: **baseline chưa đo → mọi ngưỡng hiệu năng là CANDIDATE**,
không được nâng thành "verified target" trước T02. Các ngưỡng a11y/behavior là gate đã tồn tại
trong repo (HARD).

| # | Metric | Loại | Nghĩa vụ | Ngưỡng | Cách đo | Baseline / authority |
|---|---|---|---|---|---|---|
| Q1 | Axe violations trên `/` (3 viewport × 2 theme) | INVARIANT-style gate | **HARD_REQUIREMENT** | **0** | `e2e/a11y.spec.ts` (axe-core Playwright) | Đã khôi phục và **xanh trở lại 2026-09-25: 6/6 PASS** (sau T01/T05/T06) |
| Q2 | Hợp đồng hành vi landing (`e2e/landing.spec.ts` 7 test, gồm CTA/session/mobile) | Gate | **HARD_REQUIREMENT** | 100% pass | `npm run test:e2e -- e2e/landing.spec.ts` | 5/7 PASS tại working tree — 2 test session **tiền tồn** do workstream auth đang dở (đã cô lập, xem §2.7); cần 7/7 sau khi xử lý |
| Q3 | Unit contract landing | Gate | **HARD_REQUIREMENT** | 100% pass (cập nhật theo contract mới khi có) | `npx vitest run src/__tests__/landingPage.test.tsx` | 13/13 PASS hiện tại |
| Q4 | Touch target mobile CTA | PROJECT_CONSTRAINT (repo rule) | **HARD_REQUIREMENT** | ≥ **44×44 px** @320px | E2E bounding box (`landing.spec.ts` L58–72) | Bất biến `ui-design-system.md` §1.3 |
| Q5 | **LCP** mobile/desktop | METRIC_TARGET | PRODUCT_TARGET | ≤ **2.5s** (p75 field; lab proxy cùng ngưỡng) | Field: PSI/CrUX; Lab: Lighthouse mobile profile (Slow 4G, 4× CPU throttle) | CANDIDATE — chờ T02 |
| Q6 | **INP** | METRIC_TARGET | PRODUCT_TARGET | ≤ **200ms** (p75) | Field: CrUX; Lab: TBT proxy từ Lighthouse | CANDIDATE — chờ T02 |
| Q7 | **CLS** | METRIC_TARGET | PRODUCT_TARGET | ≤ **0.1** (p75) | Field/Lab | CANDIDATE — chờ T02 |
| Q8 | Lighthouse Performance mobile (trang `/`) | METRIC_TARGET | PRODUCT_TARGET | ≥ **90** | Lighthouse CLI mobile | CANDIDATE — chờ T02 |
| Q9 | Lighthouse SEO (trang `/`) | METRIC_TARGET | OPTIMIZATION_TARGET | ≥ **95** | Lighthouse CLI | CANDIDATE — chờ T12 |
| Q10 | Ảnh hero chuyển tải ban đầu | OPTIMIZATION | OPTIMIZATION_TARGET | Mobile ≤ **70KB** (828w AVIF/WebP, JPEG fallback ~120KB); Desktop ≤ **150KB** (1600w AVIF) | Đo file size thực tế sau T10 | CANDIDATE — hiện 269KB JPEG đơn |
| Q11 | JS khởi tải cho `/` (gzip) | METRIC_TARGET | OPTIMIZATION_TARGET | Sau T11: **không tăng** so baseline; chốt ngưỡng cứng sau T02 (đề xuất ban đầu ≤ 250KB gzip cho entry+router+auth+landing, loại trừ chunk không cần) | Đọc `dist/assets` + nén gzip | CANDIDATE — chờ T02 |
| Q12 | CSS toàn cục phục vụ `/` | METRIC_TARGET | OPTIMIZATION_TARGET | Không tăng so baseline (hiện 283 871 B raw); chốt ngưỡng gzip sau T02 | `dist/assets` + gzip/brotli | CANDIDATE |
| Q13 | Số animation vô hạn trên landing | Design budget | PRODUCT_TARGET | ≤ **3** vùng (không tính reduced-motion) | Review CSS + `document.getAnimations()` trong E2E tuỳ chọn | CANDIDATE — hiện ~10 (8 beam + laser + shimmer + pulse) |
| Q14 | Thư viện animation/scroll ngoài | PROJECT_CONSTRAINT | **HARD_REQUIREMENT** | **0** | `package.json` review | Zero-dep hiện tại (e6e24fb) |
| Q15 | Preview chia sẻ Zalo/Facebook có ảnh + title đúng | Gate | HARD_REQUIREMENT (thủ công) | Ảnh hero + title Catevia hiển thị đúng | Facebook Sharing Debugger + Zalo preview | Chưa đạt (og tương đối) → T12 |
| Q16 | `robots.txt` + `sitemap.xml` cho route public | Gate | HARD_REQUIREMENT | Tồn tại và serve 200 | `curl`/trình duyệt | Chưa có → T12 |

**Ghi chú đo lường (quantitative-targets §29–31):** mọi so sánh phải cùng môi trường, cùng profile
thiết bị, cùng build; ghi ngày + commit; không dùng một lần chạy bất thường để kết luận;
lab ≠ field và phải nói rõ loại nào.

## 5. Kế hoạch xác minh (claim → evidence)

| Claim cần chứng minh | Bằng chứng trực tiếp | Lệnh/kiểm tra |
|---|---|---|
| Anchor observation được khôi phục, matrix `/` xanh | Playwright a11y + visual matrix pass cho `/` | `npx playwright test e2e/a11y.spec.ts e2e/design-system-visual.spec.ts` |
| Hành vi landing không hồi quy | 7 E2E hiện có + test mới (sticky bar nếu làm T23) | `npm run test:e2e -- e2e/landing.spec.ts` |
| Unit contract cập nhật đúng | Vitest landing suite | `npx vitest run src/__tests__/landingPage.test.tsx` |
| Không vi phạm design system / token | DS lint | `npm run lint:ds` |
| Kiến trúc inventory khớp sau khi thêm/xóa component | Inventory lint | `npm run lint:architecture-inventory` |
| TypeScript/build sạch | Build gate | `npm run build:frontend` |
| Toàn bộ gate repo | Verify chain | `npm run verify:ci` (lint + inventory + ds + build + coverage) |
| Hiệu năng cải thiện so baseline | Lighthouse mobile report trước/sau cùng profile | Runbook T30; lưu artifact |
| Metadata social đạt | Debugger/preview + `view-source` | Thủ công theo Q15/Q16 |
| T11 không phá phiên/offline (khi làm) | Auth/session critical suites + E2E đăng nhập | `npm run test:security-critical` + E2E auth; điều tra U5 trước |

---

## 6. Đồng bộ tài liệu (chỉ khi truth tương ứng thay đổi — sau triển khai)

| Thay đổi | Tài liệu cần sync | Nội dung |
|---|---|---|
| Thêm/xóa component landing (T01, T04, T21, T23) | `docs/02_ARCHITECTURE.md` (dòng inventory "landing: N") | Cập nhật số lượng component; chạy `npm run lint:architecture-inventory` |
| Chuẩn motion budget + landing primitives (T24, T13) | `docs/03_DESIGN_SYSTEM.md` — hiện **chưa có mục landing/scrolly** (kiểm chứng: không có từ khóa landing/scrolly trong doc) | Thêm mục "Landing & Motion Budget": nguyên tắc restraint, danh sách primitive được phép, ngưỡng animation vô hạn, quy tắc reduced-motion, quy tắc proof không bịa |
| Gate E2E mới (T23, T14, T32) | `docs/08_E2E_TESTING_STRATEGY.md` | Ghi nhận sticky bar/scrollspy/budget checks |
| Baseline hiệu năng (T02, T30) | Phụ lục tài liệu này + PR artifact | Số đo theo commit/profile; không nhét số vào docs normative |
| Quyết định §7 được chốt | Tài liệu này (mục §7 đổi trạng thái) | Ghi người/quyết định/ngày |

Không cập nhật `docs/BUSINESS_RULES.md`, `FRONTEND_API_CONTRACT.md`, schema/security SSOT —
landing không thay đổi các truth đó.

## 7. Quyết định cần chốt

| Mã | Quyết định | Loại | Chặn task | Phương án đề xuất |
|---|---|---|---|---|
| D-01 | Nội dung proof: được công bố quote/số liệu nào? Kênh hỗ trợ chính thức nào? | **BLOCKING** (sản phẩm/thẩm quyền dữ liệu) | T21, T26 (một phần T20) | Mặc định an toàn: chỉ Proof Rail cấu trúc (facts phi cá nhân) + câu "đang vận hành"; quote bổ sung sau khi có văn bản đồng ý |
| D-02 | Phê duyệt tách bootstrap public-first (T11) — chấp nhận rủi ro continuity có kiểm soát? | **BLOCKING** (chạm phiên/offline) | T11 | Thực hiện theo lát cắt nhỏ: chỉ defer `initDB()` sau first paint cho route công khai; giữ auth restore; verify D3-level |
| D-03 | Pipeline ảnh T10: thêm devDependency `sharp` (sinh biến thể) hay commit asset thủ công? | DEFERRABLE | T10 | Ưu tiên commit asset + ghi chú nguồn; chỉ thêm `sharp` nếu cần tái sinh thường xuyên |
| D-04 | Self-host font Inter subset (T15) hay giữ Google Fonts + `size-adjust`? | DEFERRABLE | T15 | Đo baseline trước; nếu font là nút cổ chai thì self-host |
| D-05 | Analytics cho landing | DEFERRABLE | T33 | Mặc định **không thêm** |
| D-06 | Sticky CTA mobile (T23) và video tour (nếu muốn) | DEFERRABLE | T23 | Làm sticky bar trước, đo; video chỉ khi có asset thật + nút phát |
| D-07 | Ngưỡng cứng Q11/Q12 sau baseline | DEFERRABLE | T14 | Chốt sau T02 với số thật, ghi vào §4 |

## 8. Nguồn tham khảo

Truy cập ngày 2026-09-25.

1. Brad Holmes — *Why Most Scroll Animations Miss What Apple Gets Right* (19/8/2025):
   https://www.brad-holmes.co.uk/web-performance-ux/why-most-scroll-animations-miss-what-apple-gets-right/
2. SaaS Pattern — *Stripe: Website Breakdown* (cập nhật 2/3/2026):
   https://www.saaspattern.com/en/website-breakdowns/stripe
3. Linear — *A calmer interface for a product in motion* (12/3/2026):
   https://linear.app/now/behind-the-latest-design-refresh
4. Figma Blog — *Karri Saarinen's 10 rules for crafting products that stand out* (18/3/2025):
   https://www.figma.com/blog/karri-saarinens-10-rules-for-crafting-products-that-stand-out/
5. CopyCrest — *We Analyzed 500 B2B SaaS Homepages* (18/2/2026):
   https://copycrest.com/research/b2b-homepage-conversion-study
6. web.dev — *Web Vitals* (cập nhật 31/10/2024): https://web.dev/articles/vitals
7. Chrome for Developers — *Animate elements on scroll with Scroll-driven animations* (5/5/2023):
   https://developer.chrome.com/docs/css-ui/scroll-driven-animations
8. W3C WAI — *What's New in WCAG 2.2* (5/10/2023):
   https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
9. Figma Resource Library — *Top Web design trends for 2026*:
   https://www.figma.com/resource-library/web-design-trends/

---

## Phụ lục A — Vì sao kết luận "matrix `/` đang gãy" là chắc chắn (chuỗi bằng chứng)

1. `git show e6e24fb -- src/pages/LandingPage.tsx` cho thấy commit **xóa** section cũ
   `aria-labelledby="gioi-thieu-tieu-de"` + `h1 id="gioi-thieu-tieu-de"` và đổi nav
   `#gioi-thieu-tieu-de` → `#san-pham`.
2. `grep` toàn repo hiện tại: `gioi-thieu-tieu-de` chỉ còn xuất hiện trong
   `e2e/design-system-matrix.ts` L43–44 và `e2e/design-system-visual.spec.ts` L34 —
   **không có trong bất kỳ file `src/` nào**.
3. `e2e/design-system-matrix.ts`:
   - L39–45: `publicDesignRoutes[0] = { route: '/', readySelector: '#gioi-thieu-tieu-de', mainSelector: 'main:has(#gioi-thieu-tieu-de)' }`;
   - L186–191: `openPublicObservation` → `expect(main).toBeVisible()` (mainSelector không match DOM) và
     `expect(ready).toBeVisible({ timeout: 15_000 })`.
4. `e2e/design-system-visual.spec.ts` L32–52: `assertViewportContainment` chọn
   `'#main-content, main.auth-page, main:has(#gioi-thieu-tieu-de)'`; với `/` không phần nào match →
   `mainClientWidth = 0` → `expect(...).toBeGreaterThan(0)` fail (L48).
5. `e2e/a11y.spec.ts` L127–137 lặp qua `publicDesignRoutes` cho mọi viewport/theme → landing
   là một trong các observation.
6. Kết luận trạng thái: **DRIFT** giữa artifact (`src/`) và contract test (`e2e/`) — test chưa được
   cập nhật theo thiết kế mới; lưới a11y/visual của landing không còn bảo vệ được trang.
7. **Bằng chứng runtime (chạy thật 2026-09-25):**
   `npx playwright test e2e/a11y.spec.ts --project=chromium --grep "/ · desktop · light"` →
   `1 failed`: `expect(locator('main:has(#gioi-thieu-tieu-de)')).toBeVisible()` timeout 15 000ms,
   stack `openPublicObservation (e2e/design-system-matrix.ts:189)` ← `a11y.spec.ts:133`.
   Đây là xác nhận runtime, không còn là suy luận tĩnh.

## Phụ lục B — Thứ tự thực thi đề xuất (khi được duyệt)

```text
Bước 1 (✅ đã xong 2026-09-25): T01 + T05 + T06 + xác minh gate (a11y 6/6, visual 6/6, unit 13/13, tsc 0)
Bước 1b (còn lại):  T03 (xác minh CI lane) + xử lý 2 test session tiền tồn trong workstream auth
Bước 2 (baseline):  T02 — đo Lighthouse trước khi tối ưu
Bước 3 (nền tảng):  T10 → T12 → T13 → T14 (đo lại sau từng nhóm)
Bước 4 (tùy chọn):  T11 (khảo sát U5 trước, phân loại D3) + T15
Bước 5 (trải nghiệm): T20 → T21 → T24 → T25 → T26 → T23 → T22
Bước 6 (vòng lặp):  T30 → T32 → T31 (field khi có production domain)
```

**Điều kiện dừng (stop conditions):** nếu D-01/D-02 chưa được chốt thì KHÔNG triển khai T21 và T11;
các task P0/P1 phần còn lại không phụ thuộc hai quyết định này.











