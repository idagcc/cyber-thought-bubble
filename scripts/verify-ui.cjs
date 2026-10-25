const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
async function frame(page){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const box=await page.locator('.app').boundingBox(),viewport=page.viewportSize();
 const width=Math.min(viewport.width,viewport.height*16/9),height=width*9/16;
 assert.ok(Math.abs(box.width-width)<1&&Math.abs(box.height-height)<1,`16:9 frame: ${JSON.stringify({box,viewport})}`);
 assert.ok(Math.abs(box.x-(viewport.width-width)/2)<1&&Math.abs(box.y-(viewport.height-height)/2)<1,'Frame stays centered');
 const raster=await page.locator('.camera-frame').evaluate(el=>({width:el.width,height:el.height,ratio:devicePixelRatio})),scale=Math.min(raster.ratio,4096/width);
 assert.deepEqual({width:raster.width,height:raster.height},{width:Math.round(width*scale),height:Math.round(height*scale)});
}
async function fits(page,selector){
 await frame(page);
 const metrics=await page.locator(selector).evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight}));
 assert.ok(metrics.scroll<=metrics.height+2,`${selector} overflows: ${JSON.stringify(metrics)}`);
 const box=await page.locator(`${selector} .hero-button`).boundingBox(),viewport=page.viewportSize();
 assert.ok(box.y>=0&&box.y+box.height<=viewport.height,`Primary action outside ${viewport.width} × ${viewport.height}`);
}
async function minimalLobby(page){
 await frame(page);
 assert.equal(await page.getByRole('heading',{name:'Cyber Thought Bubble',exact:true}).count(),0);
 assert.equal(await page.getByRole('button').filter({visible:true}).count(),1);
 assert.equal(await page.locator('.camera-select').count(),0);
 assert.equal(await page.locator('.tracking-guide,.camera-diagnostics,.kiosk-footer,.brand-subtitle').filter({visible:true}).count(),0);
 const box=await page.getByRole('button',{name:/Take your photo|التقط صورتك/}).boundingBox(),viewport=page.viewportSize(),stage=await page.locator('.app').boundingBox();
 assert.ok(box.y>stage.y+stage.height*.6&&box.y+box.height<=stage.y+stage.height,'Small action sits at the bottom of the stage');
 if(stage.width>=960)assert.ok(box.width<stage.width*.5&&box.height<stage.height*.15,'Live action leaves camera view clear');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),viewport.width);
}
async function countdown(page,button){
 const started=Date.now();await page.getByRole('button',{name:button,exact:true}).click();
 await page.keyboard.press('Control+Shift+C');assert.equal(await page.locator('.camera-select').count(),0,'Camera selection stays hidden during capture');
 for(const number of [5,4,3,2,1]){
  await page.locator('.countdown-overlay > span').filter({hasText:new RegExp(`^${number}$`)}).waitFor({state:'visible'});
  assert.equal(await page.locator('.photo-options button').count(),0);
  if(number===5)await page.screenshot({path:'artifacts/kiosk-countdown-5.png'});
 }
 await page.locator('.photo-options button').first().waitFor({timeout:15000});
 assert.ok(Date.now()-started>=5000,'Capture does not happen before the full five-second countdown');
 assert.equal(await page.locator('.photo-options button').count(),3);
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  fs.mkdirSync('artifacts',{recursive:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?demo=1');
  // Legacy configuration inherits the landscape default.
  await page.evaluate(async()=>{const {defaultConfig}=await import('/src/config.ts');const old={...defaultConfig};delete old.certificateOrientation;localStorage.setItem('tb-preview-config',JSON.stringify(old));});
  await page.reload();await page.getByText('Face ready',{exact:true}).waitFor({state:'attached'});
  for(const size of [{width:1280,height:720},{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080},{width:2560,height:1080},{width:3840,height:2160}]){await page.setViewportSize(size);await minimalLobby(page);await page.screenshot({path:`artifacts/kiosk-minimal-idle-${size.width}.png`});}
  await page.setViewportSize({width:1920,height:1080});
  await page.keyboard.press('c');assert.equal(await page.locator('.camera-select').count(),0);
  for(const modifier of ['Control','Meta']){
   await page.keyboard.press(`${modifier}+Shift+C`);await page.getByLabel('Select camera',{exact:true}).waitFor();
   assert.equal(await page.getByLabel('Select camera',{exact:true}).evaluate(el=>el===document.activeElement),true);
   await page.keyboard.press(`${modifier}+Shift+C`);await page.locator('.camera-select').waitFor({state:'detached'});
   await page.keyboard.press(`${modifier}+Shift+C`);await page.getByLabel('Select camera',{exact:true}).waitFor();
   await page.keyboard.press('Escape');await minimalLobby(page);
  }
  await page.keyboard.press('Control+Shift+C');await page.getByLabel('Select camera',{exact:true}).waitFor();
  await countdown(page,'Take your photo');
  await page.getByRole('button',{name:'Select photo 2'}).click();assert.equal(await page.getByRole('button',{name:'Select photo 2'}).getAttribute('aria-pressed'),'true');
  assert.deepEqual(await page.locator('.photo-options button.selected img').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight})),{w:1800,h:1200});
  const image=await page.locator('.photo-options button.selected img').getAttribute('src');fs.writeFileSync('artifacts/certificate-en-landscape.jpg',Buffer.from(image.split(',')[1],'base64'));
  for(const size of [{width:1280,height:720},{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080},{width:2560,height:1080},{width:3840,height:2160}]){await page.setViewportSize(size);await fits(page,'.review-screen');await page.screenshot({path:`artifacts/landscape-review-${size.width}.png`});}
  await page.getByRole('button',{name:'Print your photo'}).click();
  for(const size of [{width:1280,height:720},{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080},{width:2560,height:1080},{width:3840,height:2160}]){await page.setViewportSize(size);await fits(page,'.done-screen');}
  await page.getByRole('button',{name:'Next participant'}).click();await minimalLobby(page);
  await page.setViewportSize({width:1920,height:1080});await page.goto('http://127.0.0.1:5173/?demo=1&lang=ar');await page.getByText('Face ready',{exact:true}).waitFor({state:'attached'});await minimalLobby(page);await countdown(page,'التقط صورتك');await fits(page,'.review-screen');
  const arabic=await page.locator('.photo-options button.selected img').getAttribute('src');fs.writeFileSync('artifacts/certificate-ar-landscape.jpg',Buffer.from(arabic.split(',')[1],'base64'));await page.screenshot({path:'artifacts/landscape-review-arabic.png'});
  const samples=await page.evaluate(async()=>{const {printCalibration}=await import('/src/photo.ts');const {defaultConfig}=await import('/src/config.ts');return {landscape:await printCalibration(defaultConfig),portrait:await printCalibration({...defaultConfig,certificateOrientation:'portrait'})};});fs.writeFileSync('artifacts/printer-test-6x4.jpg',Buffer.from(samples.landscape.split(',')[1],'base64'));fs.writeFileSync('artifacts/certificate-en-portrait.jpg',Buffer.from(samples.portrait.split(',')[1],'base64'));
  await page.keyboard.press('Control+Shift+A');await page.getByLabel('Operator PIN',{exact:true}).fill('246810');await page.getByLabel('Confirm PIN',{exact:true}).fill('246810');await page.getByRole('button',{name:'Create PIN & continue'}).click();await page.getByText('Thought library',{exact:true}).waitFor();assert.equal(await page.locator('.phrase-edit').count(),60);
  await page.getByRole('button',{name:'photo',exact:true}).click();assert.equal(await page.getByLabel('Photo format').inputValue(),'landscape');await page.getByRole('button',{name:'station',exact:true}).click();await page.getByRole('button',{name:'Refresh devices'}).click();assert.equal(await page.getByRole('button',{name:'Save & print test page'}).isDisabled(),true);assert.equal(await page.getByLabel('Camera quality',{exact:true}).inputValue(),'detail');await page.getByText('Optimized automatically',{exact:true}).waitFor();await page.getByLabel('Camera quality',{exact:true}).selectOption('smooth');await page.getByRole('button',{name:'Save changes',exact:true}).click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tb-preview-config')).cameraMode),'smooth');
  await page.keyboard.press('Control+Shift+C');assert.equal(await page.locator('.camera-select').count(),0,'Camera shortcut stays inactive in operator settings');await page.getByRole('button',{name:'Close settings'}).click();assert.equal(await page.locator('.camera-select').count(),0,'Camera selection stays hidden after operator settings close');await page.goto('http://127.0.0.1:5173/?demo=1');await page.setViewportSize({width:390,height:844});await minimalLobby(page);assert.deepEqual(errors,[]);
  console.log('PASS: centered 16:9 stage and camera at 720p/1080p/4K/16:10/ultrawide/portrait, full 5→1 automatic countdown, three selectable landscape certificates, English/Arabic, print preview, next visitor, operator access, hidden camera selector with Ctrl/Cmd+Shift+C and Escape, no browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
