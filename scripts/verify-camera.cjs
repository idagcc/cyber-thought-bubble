const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}});page.setDefaultTimeout(15000);let external=0;const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().startsWith('http')&&!r.url().startsWith('http://127.0.0.1:5173'))external++;});
  await page.goto('http://127.0.0.1:5173/qa.html');
  await page.waitForFunction(()=>{const c=document.querySelector('.camera-wrap');return Number(c?.dataset.faceCount)===3&&Number(c?.dataset.bubbleCount)>=3;},null,{timeout:30000});
  await page.getByRole('button',{name:'4 people',exact:true}).click();
  await page.waitForFunction(()=>{const c=document.querySelector('.camera-wrap');return Number(c?.dataset.faceCount)===4&&Number(c?.dataset.bubbleCount)>=4;});
  // Hide only the dev fixture toolbar in screenshots; it is absent from the app.
  await page.getByRole('button',{name:'4 people',exact:true,includeHidden:true}).evaluate(el=>el.parentElement.style.visibility='hidden');
  await page.screenshot({path:'artifacts/kiosk-four-person-live.png'});
  await page.getByRole('button',{name:'Take your photo'}).click();
  await page.locator('.photo-options button').first().waitFor({timeout:20000});
  assert.equal(await page.locator('.photo-options button').count(),3);
  const photo=await page.locator('.photo-options button.selected img').getAttribute('src');fs.writeFileSync('artifacts/certificate-four-person-landscape.jpg',Buffer.from(photo.split(',')[1],'base64'));
  assert.deepEqual(await page.locator('.photo-options button.selected img').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight})),{width:1800,height:1200});
  await page.getByRole('button',{name:'Print your photo'}).click();await page.getByRole('button',{name:'Next participant'}).click();
  await page.getByRole('button',{name:'4 people',exact:true,includeHidden:true}).evaluate(el=>el.parentElement.style.visibility='visible');
  await page.getByRole('button',{name:'Hide faces',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('.camera-wrap')?.dataset.faceCount)===0);
  // The button is usable before anyone is ready; countdown provides travel time.
  await page.getByRole('button',{name:'Take your photo'}).click();await page.locator('.countdown-overlay > span').filter({hasText:'5'}).waitFor();
  await page.getByRole('button',{name:'4 people',exact:true}).click();
  await page.locator('.photo-options button').first().waitFor({timeout:20000});
  await page.getByRole('button',{name:'Print your photo'}).click();await page.getByRole('button',{name:'Next participant'}).click();
  await page.getByRole('button',{name:'Hide faces',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('.camera-wrap')?.dataset.faceCount)===0);
  await page.getByRole('button',{name:'Take your photo'}).click();await page.getByRole('alert').filter({hasText:'No one is ready'}).waitFor({timeout:10000});
  assert.equal(await page.locator('.photo-options button').count(),0);assert.equal(await page.getByRole('button',{name:'Take your photo'}).isEnabled(),true);
  assert.equal(external,0);assert.deepEqual(errors,[]);
  console.log('PASS: real bundled detector tracks 3/4 fixture faces with independent bubbles; four-person landscape capture; entering during countdown; no-face retry; no external requests or browser errors. Synthetic fixture, not an event hardware calibration.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
