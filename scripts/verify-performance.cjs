// Real browser checks for proportional branding, direct video composition and paused hidden work.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const svg=fs.readFileSync('public/carnival/brand-lockup.svg','utf8');
  assert.match(svg,/preserveAspectRatio="xMidYMid meet"/);assert.doesNotMatch(svg,/\btransform=|preserveAspectRatio="none"/);
  const embeddedBrand=svg.match(/data:image\/png;base64,([^"]+)/)[1];
  assert.deepEqual(Buffer.from(embeddedBrand,'base64'),fs.readFileSync('public/carnival/brand.png'),'wordmark uses the unchanged supplied pixels');
  const page=await browser.newPage({viewport:{width:3840,height:2160}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.cameraCopies=0;window.backdropDraws=0;window.logoDraws=[];
   const draw=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
    if(this.canvas.classList.contains('camera-frame')&&image instanceof HTMLVideoElement)window.cameraCopies++;
    if(this.canvas.classList.contains('camera-frame')&&image instanceof HTMLImageElement&&image.src.endsWith('/backdrop.jpg'))window.backdropDraws++;
    if(image instanceof HTMLImageElement&&image.src.endsWith('/brand-lockup.svg'))window.logoDraws.push({width:args[2],height:args[3],ratio:image.naturalWidth/image.naturalHeight});
    return draw.call(this,image,...args);
   };
  });
  await page.goto('http://127.0.0.1:5173/qa.html?camera=4k');
  await page.waitForFunction(()=>document.querySelector('.camera-wrap')?.dataset.cameraRenderer==='video'&&Number(document.querySelector('.camera-wrap')?.dataset.faceCount)===3,null,{timeout:30000});
  for(const viewport of [{width:1280,height:720},{width:1920,height:1080},{width:3840,height:2160},{width:1440,height:900}]){
   await page.setViewportSize(viewport);
   const logo=await page.locator('.carnival-brand').evaluate(img=>({width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height,ratio:img.naturalWidth/img.naturalHeight}));
   assert.ok(Math.abs(logo.width/logo.height-logo.ratio)<.002,`Logo deformed at ${viewport.width}: ${JSON.stringify(logo)}`);
  }
  const embeddedDimensions=await page.evaluate(async()=>{
   const source=await (await fetch('/carnival/brand-lockup.svg')).text(),xml=new DOMParser().parseFromString(source,'image/svg+xml');
   const [x,y,w,h]=xml.documentElement.getAttribute('viewBox').split(' ').map(Number),wordmark=[...xml.querySelectorAll('image')][1];
   if(Number(wordmark.getAttribute('x'))<x||Number(wordmark.getAttribute('y'))<y||Number(wordmark.getAttribute('x'))+Number(wordmark.getAttribute('width'))>x+w||Number(wordmark.getAttribute('y'))+Number(wordmark.getAttribute('height'))>y+h)throw Error('Logo viewport clips the original wordmark or glow');
   return Promise.all([...xml.querySelectorAll('image')].map(async element=>{const image=new Image();image.src=element.getAttribute('href');await image.decode();return {specified:[Number(element.getAttribute('width')),Number(element.getAttribute('height'))],original:[image.naturalWidth,image.naturalHeight]};}));
  });
  for(const image of embeddedDimensions)assert.deepEqual(image.specified,image.original,'tent and lettering pixels keep their source dimensions');
  const flags=await page.evaluate(async()=>{
   const image=new Image();image.src='/carnival/brand-lockup.svg';await image.decode();
   return [1100,269,231].map(width=>{
    const scale=width/1100,canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.ceil(755*scale);const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,width,755*scale);
    return {width,visible:[[534,270],[935,101],[1325,274]].map(([x,y])=>{const rgba=ctx.getImageData(Math.floor((x-380)*scale),Math.floor((y-55)*scale),1,1).data;return rgba[3]>200&&rgba[2]>rgba[0]+30;})};
   });
  });
  for(const sample of flags)assert.deepEqual(sample.visible,[true,true,true],`All three original blue flags must be visible at logo width ${sample.width}`);
  await page.setViewportSize({width:3840,height:2160});
  const copies=await page.evaluate(()=>window.cameraCopies);await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>window.cameraCopies),copies,'GPU live video must not be copied through the 2D display canvas');
  const live=await page.locator('.source-video').evaluate(video=>({fit:getComputedStyle(video).objectFit,mirror:getComputedStyle(video).transform,box:[video.clientWidth,video.clientHeight]}));
  assert.equal(live.fit,'cover');assert.match(live.mirror,/matrix\(-1,/);assert.deepEqual(live.box,[3840,2160]);
  await page.getByRole('button',{name:'Take your photo',exact:true}).click();
  await page.locator('.photo-options button').first().waitFor({timeout:20000});
  assert.equal(await page.locator('.photo-options button').count(),3);
  const draws=await page.evaluate(()=>window.logoDraws);assert.ok(draws.length>=3);
  for(const logo of draws)assert.ok(Math.abs(logo.width/logo.height-logo.ratio)<1e-8,'printed logo must use one uniform scale');
  await page.waitForTimeout(150);
  const paused=await page.locator('.camera-wrap').evaluate(el=>({...el.dataset}));
  assert.equal(paused.renderState,'paused');await page.waitForTimeout(750);
  const still=await page.locator('.camera-wrap').evaluate(el=>({...el.dataset}));
  assert.equal(still.detectionTime,paused.detectionTime,'certificate selection stops new detection');assert.equal(still.cameraPaints,paused.cameraPaints,'certificate selection stops canvas painting');
  await page.getByRole('button',{name:'Print your photo',exact:true}).click();
  await page.getByRole('button',{name:'Next participant',exact:true}).click();
  await page.waitForFunction(stamp=>{const el=document.querySelector('.camera-wrap');return el.dataset.renderState==='active'&&el.dataset.detectionTime!==stamp&&Number(el.dataset.faceCount)===3;},paused.detectionTime,{timeout:15000});
  await page.route('**/carnival/backdrop.jpg',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.continue();});
  await page.goto('http://127.0.0.1:5173/?demo=1');
  await page.waitForFunction(()=>window.backdropDraws>0);
  assert.deepEqual(errors,[]);
  console.log('PASS: all three flags, original logo pixels and aspect ratio at four display sizes and in all three certificates; native 4K video with no 2D video copies; hidden tracking/painting pauses; next visitor resumes.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
