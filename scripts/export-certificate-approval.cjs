// Export the actual walk-up certificate renderer with a sample illustration.
// No participant records or printer jobs are created.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const output=path.resolve('output/pdf');fs.mkdirSync(output,{recursive:true});
 try{
  for(const lang of ['en','ar']){
   const page=await browser.newPage({viewport:{width:1920,height:1080},timezoneId:'Asia/Dubai'});
   await page.clock.setFixedTime(new Date('2026-10-19T12:00:00+04:00'));
   await page.addInitScript(()=>{Math.random=()=>.5;});
   await page.goto(`http://127.0.0.1:5173/?demo=1&lang=${lang}`);
   await page.getByText('Face ready',{exact:true}).waitFor({state:'attached'});
   await page.evaluate(()=>document.fonts.ready);
   await page.getByRole('button',{name:lang==='ar'?'إنشاء شهادتي':'Create my certificate',exact:true}).click();
   const selected=page.locator('.photo-options button.selected img');await selected.waitFor({timeout:20000});
   assert.deepEqual(await selected.evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight})),{width:1800,height:1200});
   const data=await selected.getAttribute('src');
   fs.writeFileSync(path.join(output,`certificate-approval-${lang}.jpg`),Buffer.from(data.split(',')[1],'base64'));
   await page.close();
  }
  console.log('Exported English and Arabic certificate approval layouts: 1800 × 1200, 6 × 4 inches. Sample illustration; actual app renderer.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
