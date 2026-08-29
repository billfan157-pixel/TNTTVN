import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const OUT_DIR = 'test-results/mobile-audit-auth';
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const PORT = 3002;
const BASE = `http://localhost:${PORT}`;

const viewports = [
  { name: 'iPhoneSE-375x667', width: 375, height: 667, dpr: 2 },
  { name: 'GalaxyS23-360x800', width: 360, height: 800, dpr: 3 },
  { name: 'iPhone15ProMax-430x932', width: 430, height: 932, dpr: 3 },
  { name: 'Small-320x568', width: 320, height: 568, dpr: 2 },
];

const routes = ['/dashboard','/students','/attendance','/grades','/reports','/notices','/calendar'];

const fakeMarker = { id: 'u-admin-1', role: 'admin', parishId: 'parish-gx-gia-ton' };
const fakeUserSnapshot = {
  id: 'u-admin-1',
  username: 'admin',
  fullName: 'Admin Gia Tôn',
  role: 'admin',
  status: 'ACTIVE',
  parishId: 'parish-gx-gia-ton',
  phone: '0900000000',
};

function waitForServer(url, timeout=30000){
  return new Promise((resolve,reject)=>{
    const start=Date.now();
    const tick=async()=>{
      try{ const r=await fetch(url); if(r.ok) return resolve(); }catch{}
      if(Date.now()-start>timeout) return reject(new Error('timeout')); setTimeout(tick,400);
    }; tick();
  });
}

async function main(){
  console.log('[audit-auth] preview', PORT);
  const preview = spawn('npx',['vite','preview','--port',String(PORT),'--host','0.0.0.0'],{stdio:'pipe', shell:true});
  preview.stdout.on('data',d=>process.stdout.write('[pv] '+d));
  preview.stderr.on('data',d=>process.stderr.write('[pv err] '+d));
  await waitForServer(BASE+'/',40000);
  console.log('[audit-auth] up');
  const browser=await chromium.launch({headless:true});
  const results=[];
  for(const vp of viewports){
    for(const route of routes){
      const context=await browser.newContext({
        viewport:{width:vp.width,height:vp.height},
        deviceScaleFactor:vp.dpr,
        isMobile:true, hasTouch:true,
        userAgent: devices['iPhone 12'].userAgent,
      });
      // mock api
      await context.route('**/api/**', async routeReq=>{
        const url=routeReq.request().url();
        // console.log('mock',url);
        if(url.includes('/auth/refresh')){
          return routeReq.fulfill({status:200, contentType:'application/json', body: JSON.stringify({ accessToken:'fake' })});
        }
        if(url.includes('/auth/me')){
          return routeReq.fulfill({status:200, contentType:'application/json', body: JSON.stringify(fakeUserSnapshot)});
        }
        if(url.includes('/settings')||url.includes('/classes')||url.includes('/students')||url.includes('/notices')||url.includes('/grades')||url.includes('/attendance')||url.includes('/parish-events')||url.includes('/academic-years')){
          return routeReq.fulfill({status:200, contentType:'application/json', body: JSON.stringify([])});
        }
        if(url.includes('/health')){
          return routeReq.fulfill({status:200, contentType:'application/json', body: JSON.stringify({ok:true})});
        }
        // generic
        return routeReq.fulfill({status:200, contentType:'application/json', body: JSON.stringify({})});
      });
      await context.addInitScript(({marker})=>{
        try{
          localStorage.setItem('parish_current_user', JSON.stringify(marker));
          // also set snapshot in localStorage as fallback for older code? Dexie mock via localStorage
          // Inject Dexie snapshot by pre-populating IndexedDB not easy — instead we override loadSnapshot via fetch intercept above
          // Also set parish_filter_store mobile
          localStorage.setItem('parish_filter_store', JSON.stringify({state:{viewMode:'mobile',selectedClassId:'all',selectedSemester:1,searchQuery:''},version:0}));
          localStorage.setItem('parish_auth_token','fake');
          // set tenant data in localStorage for other stores
          localStorage.setItem('parish_tenant_scope', JSON.stringify({parishId: marker.parishId, userId: marker.id}));
        }catch{}
      }, {marker: fakeMarker, snapshot: fakeUserSnapshot});

      // also directly write to IndexedDB via page evaluate after goto for snapshot
      const page=await context.newPage();
      const file=`${vp.name}__${route.replace(/\//g,'_')}.png`;
      const out=path.join(OUT_DIR,file);
      try{
        await page.goto(BASE+route,{waitUntil:'domcontentloaded', timeout:15000});
        // try to inject snapshot into Dexie via evaluate
        await page.evaluate(async ()=>{
          try{
            // open DB and set item — replicate dexieStorage
            // try Dexie storage via localForage-like
            if(window.indexedDB){
              // use direct localStorage fallback for our snapshot key read path?
              // Instead override the module's read by setting marker alone may be enough if we also make bootstrap succeed
            }
          }catch{}
        }, fakeUserSnapshot);
        await page.waitForTimeout(1500);
        // wait for mobile shell
        await page.waitForSelector('.mobile-app-shell, .mobile-top-bar, .auth-page', {timeout:5000}).catch(()=>{});
        await page.evaluate(()=>window.scrollTo(0,80));
        await page.waitForTimeout(300);
        await page.screenshot({path: out, fullPage:true, animations:'disabled'});
        console.log('[shot]',file);
        const m=await page.evaluate(()=>{
          const qS=s=>document.querySelector(s);
          const top=qS('.mobile-top-bar');
          const bottom=qS('.mobile-bottom-nav');
          const shell=qS('.mobile-app-shell');
          const tabs=qS('.view-tabs');
          const hasH=document.documentElement.scrollWidth>window.innerWidth+2;
          const touchTargets=Array.from(document.querySelectorAll('button, a[href], [role="button"]')).map(e=>{const r=e.getBoundingClientRect(); return {tag:e.tagName, cls:String(e.className).slice(0,60), w:Math.round(r.width), h:Math.round(r.height), vis:r.width>0&&r.height>0, txt:(e.textContent||'').trim().slice(0,30)};}).filter(x=>x.vis);
          const small=touchTargets.filter(x=>x.w<44||x.h<44);
          const truncated=Array.from(document.querySelectorAll('h1,h2,.mobile-bottom-nav__label')).filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({txt:(e.textContent||'').trim().slice(0,30), sw:e.scrollWidth, cw:e.clientWidth}));
          return {hasH, topH: top?Math.round(top.getBoundingClientRect().height):0, botH: bottom?Math.round(bottom.getBoundingClientRect().height):0, shellW: shell?Math.round(shell.getBoundingClientRect().width):0, tabs: tabs?{sw:tabs.scrollWidth,cw:tabs.clientWidth, over:tabs.scrollWidth>tabs.clientWidth+2}:null, touchCount:touchTargets.length, smallCount: small.length, smallSample: small.slice(0,5), trunc: truncated.slice(0,5), vw: window.innerWidth };
        });
        results.push({vp: vp.name, route, m, file});
        console.log(`  -> topH ${m.topH} botH ${m.botH} hasH:${m.hasH} tabsOver:${m.tabs?.over} small:${m.smallCount}/${m.touchCount} trunc:${m.trunc.length}`);
        await context.close();
      }catch(e){
        console.error('[fail]',vp.name,route,e.message);
        try{ await page.screenshot({path: out.replace('.png','-err.png'), fullPage:true}); }catch{}
        await context.close();
      }
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR,'audit-auth.json'), JSON.stringify(results,null,2));
  console.log('[done]',results.length);
  preview.kill('SIGTERM');
}
main().catch(e=>{console.error(e);process.exit(1);});
