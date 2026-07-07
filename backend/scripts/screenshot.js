const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function main() {
  const htmlPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'bjp_card_design.html');
  const outputPath = 'C:/Users/Admin/.gemini/antigravity/brain/e87e62d6-c6df-4efa-9d60-2707fca287bb/bjp_card_mockup.png';

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1100, deviceScaleFactor: 3 });
    
    const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
    console.log('Opening file: ' + fileUrl);
    await page.goto(fileUrl, { waitUntil: 'networkidle2' });
    
    // Wait for images and fonts to load completely
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Taking screenshot of #card...');
    const card = await page.$('#card');
    if (!card) {
      throw new Error('Could not find #card element');
    }
    
    await card.screenshot({ path: outputPath, type: 'png' });
    console.log('Screenshot saved successfully to: ' + outputPath);
  } catch (err) {
    console.error('Error during screenshot:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
