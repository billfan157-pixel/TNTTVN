import { chromium, devices } from 'playwright';

async function verify() {
  const browser = await chromium.launch();
  const context = await browser.newContext(devices['iPhone 13']);
  const page = await context.newPage();

  console.log('Navigating to https://tnttvn.vercel.app/dashboard?viewMode=mobile...');
  
  try {
    const response = await page.goto('https://tnttvn.vercel.app/dashboard?viewMode=mobile', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log(`Response status: ${response?.status()}`);
    
    // Wait a bit for React to hydrate
    await page.waitForTimeout(2000);

    const title = await page.title();
    console.log(`Page title: ${title}`);

    const content = await page.content();
    const hasRoot = content.includes('id="root"');
    const hasDashboard = content.includes('Tổng quan giáo xứ') || content.includes('Giáo Lý Thiếu Nhi Thánh Thể');
    const hasMobileNav = content.includes('mobile-bottom-nav');

    console.log(`Has #root: ${hasRoot}`);
    console.log(`Has Dashboard text: ${hasDashboard}`);
    console.log(`Has Mobile Nav: ${hasMobileNav}`);

    if (hasDashboard && hasMobileNav) {
      console.log('SUCCESS: Mobile mode is rendering correctly.');
    } else if (content.length < 500) {
      console.log('FAILURE: Page content is too short, likely a white screen.');
    } else {
      console.log('WARNING: Page rendered but mobile specific elements not found.');
      console.log('Content snippet:', content.substring(0, 500));
    }

    // Test navigation if mobile nav is present
    if (hasMobileNav) {
      console.log('Testing mobile navigation...');
      // Find the students tab (usually the 3rd or 4th button)
      const studentsTab = await page.$('button[aria-label="Thiếu nhi"]');
      if (studentsTab) {
        await studentsTab.click();
        await page.waitForTimeout(2000);
        console.log(`Navigated to: ${page.url()}`);
        const studentsContent = await page.content();
        if (studentsContent.includes('Danh sách thiếu nhi')) {
          console.log('SUCCESS: Mobile navigation to Students page works.');
        } else {
          console.log('FAILURE: Mobile navigation failed or resulted in white screen.');
        }
      }
    }

  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await browser.close();
  }
}

verify();
