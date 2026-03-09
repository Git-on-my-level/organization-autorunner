const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  console.log('Navigating to http://localhost:5173/local...');
  await page.goto('http://localhost:5173/local');
  await page.waitForLoadState('networkidle');
  
  // Check if identity dialog is present
  const identityDialog = await page.locator('text=Select Actor Identity').isVisible({ timeout: 2000 }).catch(() => false);
  
  if (identityDialog) {
    console.log('Identity dialog detected, selecting first identity...');
    
    // Click on the first identity (Zara Opel4)
    const firstIdentity = await page.locator('button').filter({ hasText: 'Zara' }).first();
    if (await firstIdentity.isVisible()) {
      await firstIdentity.click();
      console.log('Selected first identity');
      
      // Wait for navigation or dialog to close
      await page.waitForTimeout(1000);
      await page.waitForLoadState('networkidle');
    }
  }
  
  // Wait a moment for the UI to fully load
  await page.waitForTimeout(500);
  
  console.log('Taking initial screenshot with sidebar...');
  await page.screenshot({ 
    path: 'output/playwright/project-switcher-closed.png',
    fullPage: true 
  });
  console.log('✓ Saved: output/playwright/project-switcher-closed.png');
  
  // Find and click the project switcher button
  console.log('Looking for project switcher button...');
  
  // Try different selectors for the project switcher
  const selectors = [
    '[role="combobox"]',
    'button[aria-haspopup="listbox"]',
    'button[aria-label*="project"]',
    'button[aria-label*="Project"]',
    '[data-testid="project-switcher"]',
    // Look for button with project name text
    'button:has-text("demo-org")',
    'button:has-text("project")',
    // Look for button at top of sidebar with chevron icon
    'aside button:has([class*="chevron"])',
    'nav button:has([class*="chevron"])',
    // Generic sidebar button
    'aside button:first-of-type',
  ];
  
  let clicked = false;
  for (const selector of selectors) {
    try {
      const button = await page.locator(selector).first();
      if (await button.isVisible({ timeout: 1000 })) {
        console.log(`Found button with selector: ${selector}`);
        await button.click();
        clicked = true;
        break;
      }
    } catch (e) {
      // Try next selector
      continue;
    }
  }
  
  if (!clicked) {
    console.log('Could not find project switcher button with standard selectors.');
    console.log('Trying to find any button in the sidebar...');
    
    // Last resort: get all buttons and look for one that opens a dropdown
    const allButtons = await page.locator('button').all();
    console.log(`Found ${allButtons.length} buttons on the page`);
    
    for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
      try {
        const btn = allButtons[i];
        const text = await btn.textContent();
        console.log(`Button ${i}: "${text?.substring(0, 50)}"`);
        
        // Look for button with project-like text or at top of page
        if (text && (text.includes('demo') || text.includes('org') || text.includes('project'))) {
          console.log(`Trying button ${i}...`);
          await btn.click();
          clicked = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
  }
  
  if (clicked) {
    console.log('Clicked project switcher button, waiting for dropdown...');
    // Wait for dropdown to appear
    await page.waitForTimeout(1000);
  } else {
    console.log('Warning: Could not find and click project switcher button');
  }
  
  console.log('Taking screenshot with dropdown open...');
  await page.screenshot({ 
    path: 'output/playwright/project-switcher-open.png',
    fullPage: true 
  });
  console.log('✓ Saved: output/playwright/project-switcher-open.png');
  
  // Keep browser open for a few seconds so user can see it
  await page.waitForTimeout(3000);
  
  await browser.close();
  console.log('Done!');
})();
