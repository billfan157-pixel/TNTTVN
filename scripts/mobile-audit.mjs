import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const OUT_DIR = 'test-results/mobile-audit';
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const PORT = 3002;
const BASE = `http://localhost:${PORT}`;

const viewports = [
  { name: 'iPhoneSE-375x667', width: 375, height: 667, dpr: 2 },
  { name: 'iPhone14-390x844', width: 390, height: 844, dpr: 3 },
  { name: 'iPhone15ProMax-430x932', width: 430, height: 932, dpr: 3 },
  { name: 'GalaxyS23-360x800', width: 360, height: 800, dpr: 3 },
  { name: 'Small-320x568', width: 320, height: 568, dpr: 2 },
  { name: 'Pixel7-412x915', width: 412, height: 915, dpr: 2.625 },
];

const routes = [
  '/dashboard',
  '/students',
  '/attendance',
  '/grades',
  '/reports',
  '/notices',
  '/calendar',
  '/login',
];

// fake user for bypass auth
const fakeUser = {
  id: 'u1',
  username: 'admin',
  fullName: 'Admin Demo',
  role: 'admin',
  mustChangePassword: false,
};

function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {}
      if (Date.now() - start > timeout) return reject(new Error('timeout waiting ' + url));
      setTimeout(tick, 400);
    };
    tick();
  });
}

async function main() {
  // start vite preview on PORT
  console.log('[audit] starting preview server on', PORT);
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '0.0.0.0'], {
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, PORT: String(PORT) },
  });
  preview.stdout.on('data', d => process.stdout.write('[preview] ' + d));
  preview.stderr.on('data', d => process.stderr.write('[preview err] ' + d));

  try {
    await waitForServer(BASE + '/', 40000);
    console.log('[audit] preview up');

    const browser = await chromium.launch({ headless: true });
    const results = [];

    for (const vp of viewports) {
      for (const route of routes) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.dpr,
          isMobile: true,
          hasTouch: true,
          userAgent: devices['iPhone 12'].userAgent,
        });
        // inject auth before load
        await context.addInitScript((user) => {
          try {
            localStorage.setItem('parish_current_user', JSON.stringify(user));
            localStorage.setItem('parish_auth_token', 'fake');
            // viewMode mobile forced
            const prev = localStorage.getItem('parish_filter_store');
            if (prev) {
              try {
                const j = JSON.parse(prev);
                j.state = j.state || {};
                j.state.viewMode = 'mobile';
                localStorage.setItem('parish_filter_store', JSON.stringify(j));
              } catch {}
            } else {
              localStorage.setItem('parish_filter_store', JSON.stringify({ state: { viewMode: 'mobile', selectedClassId: 'all', selectedSemester: 1, searchQuery: '' }, version: 0 }));
            }
          } catch {}
        }, fakeUser);

        const page = await context.newPage();
        const fileName = `${vp.name}__${route.replace(/\//g,'_') || 'root'}.png`;
        const outPath = path.join(OUT_DIR, fileName);
        try {
          await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 15000 });
          // wait for hydration
          await page.waitForTimeout(1200);
          // scroll a bit to trigger sticky
          await page.evaluate(() => window.scrollTo(0, 120));
          await page.waitForTimeout(400);
          await page.screenshot({ path: outPath, fullPage: true, animations: 'disabled' });
          console.log(`[shot] ${fileName} ok`);

          // collect layout metrics
          const metrics = await page.evaluate(() => {
            const touchTargets = Array.from(document.querySelectorAll('button, a, [role="button"], input, select')).map(el => {
              const r = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              return {
                tag: el.tagName + (el.className ? '.' + String(el.className).split(' ').slice(0,2).join('.') : ''),
                w: Math.round(r.width),
                h: Math.round(r.height),
                visible: r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
                text: (el.textContent || '').trim().slice(0,40),
              };
            }).filter(x=>x.visible);
            const smallTargets = touchTargets.filter(x=> x.w < 44 || x.h < 44);
            const hasHScroll = document.documentElement.scrollWidth > window.innerWidth + 2;
            const bottomNav = document.querySelector('.mobile-bottom-nav');
            const topBar = document.querySelector('.mobile-top-bar');
            const stickyPanels = Array.from(document.querySelectorAll('.mobile-sticky-under-topbar')).map(e=> {
              const s = getComputedStyle(e);
              return { top: s.top, position: s.position, h: e.getBoundingClientRect().height };
            });
            const overflowTabs = document.querySelector('.view-tabs');
            const overflowInfo = overflowTabs ? {
              scrollWidth: overflowTabs.scrollWidth,
              clientWidth: overflowTabs.clientWidth,
              hasOverflow: overflowTabs.scrollWidth > overflowTabs.clientWidth + 2,
            } : null;
            // check truncated titles
            const truncated = Array.from(document.querySelectorAll('h1,h2,h3,.mobile-bottom-nav__label')).map(e=>{
              const r=e.getBoundingClientRect();
              return { txt:(e.textContent||'').trim().slice(0,30), w:Math.round(r.width), scrollW:e.scrollWidth, truncated: e.scrollWidth>e.clientWidth+1 };
            }).filter(x=>x.truncated);
            return { touchCount: touchTargets.length, smallCount: smallTargets.length, smallTargets: smallTargets.slice(0,10), hasHScroll, bottomNavH: bottomNav? bottomNav.getBoundingClientRect().height:0, topBarH: topBar? topBar.getBoundingClientRect().height:0, stickyPanels, overflowTabs: overflowInfo, truncated: truncated.slice(0,10), viewport: {w: window.innerWidth, h: window.innerHeight} };
          });
          results.push({ viewport: vp.name, route, metrics, file: fileName });
          await context.close();
        } catch (e) {
          console.error(`[fail] ${vp.name} ${route} :`, e.message);
          try { await page.screenshot({ path: outPath.replace('.png','-error.png'), fullPage: true }); } catch {}
          await context.close();
        }
      }
    }
    await browser.close();

    fs.writeFileSync(path.join(OUT_DIR, 'audit.json'), JSON.stringify(results, null, 2));
    console.log('[audit] done, results', results.length);

    // print summary
    for (const r of results) {
      const m = r.metrics;
      console.log(`--- ${r.viewport} ${r.route} ---`);
      console.log(` touch:${m.touchCount} small<44:${m.smallCount} hScroll:${m.hasHScroll} topBarH:${m.topBarH} bottomNavH:${m.bottomNavH} overflowTabs:${JSON.stringify(m.overflowTabs)} truncated:${m.truncated.length}`);
      if (m.smallCount>0) console.log('  small sample:', m.smallTargets.slice(0,3));
      if (m.truncated.length) console.log('  truncated:', m.truncated.slice(0,3));
    }

  } finally {
    preview.kill('SIGTERM');
  }
}

main().catch(e=> { console.error(e); process.exit(1); });
