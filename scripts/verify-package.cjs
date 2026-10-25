const {_electron}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {version}=require('../package.json');

async function verify(){
 const release=path.resolve(__dirname,'../release');
 const executable=process.argv[2]||(
  process.platform==='darwin'
   ?path.join(release,'mac-arm64/Thought Bubble Studio.app/Contents/MacOS/Thought Bubble Studio')
   :process.platform==='win32'?path.join(release,'win-unpacked/Thought Bubble Studio.exe'):null
 );
 assert.ok(executable,'Pass the packaged executable path on this platform.');
 assert.ok(fs.existsSync(executable),`Package missing: ${executable}. Build it first.`);
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'thought-bubble-package-'));
 let app;
 try{
  app=await _electron.launch({executablePath:path.resolve(executable),args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'],env:{...process.env,THOUGHT_BUBBLE_TEST_DATA:data},timeout:60000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // A canvas stream gives every CI host the same camera, independently of OS virtual devices.
  const fixture='data:image/png;base64,'+fs.readFileSync(path.resolve(__dirname,'../tests/fixtures/portrait.png')).toString('base64');
  await page.addInitScript(({fixture})=>{
   const portrait=new Image();portrait.src=fixture;
   const source=document.createElement('canvas');source.width=1280;source.height=720;const ctx=source.getContext('2d');
   let started=false;
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
    await portrait.decode();
    const paint=()=>{ctx.fillStyle='#183652';ctx.fillRect(0,0,1280,720);ctx.drawImage(portrait,528,0,864,1080,408,110,464,580);};
    if(!started){started=true;paint();setInterval(paint,1000/30);}
    return source.captureStream(30);
   }});
  },{fixture});
  // Reload without network access: all detector, font and artwork files must be local.
  await page.route(/^https?:\/\//,route=>route.abort());
  await page.reload();
  await page.waitForFunction(()=>!!window.station);
  const branding=await page.evaluate(async()=>{
   const fonts=await Promise.all(['Cyber Carnival','شهادة مشاركة'].map(async text=>(await document.fonts.load('700 30px "Noto Kufi Arabic"',text)).map(face=>face.status)));
   const assets=await Promise.all(['backdrop.jpg','brand-lockup.svg','brand.png','tents.png','fingerprint.png','cloud.png','shield.png','star.png','coin.png','button.png','mini-star.png','coin-blur.png'].map(async name=>{const image=new Image();image.src=new URL(`./carnival/${name}`,location.href).href;await image.decode();return {name,width:image.naturalWidth,height:image.naturalHeight};}));
   const logo=new Image();logo.src=new URL('./carnival/brand-lockup.svg',location.href).href;await logo.decode();
   const canvas=document.createElement('canvas');canvas.width=logo.naturalWidth;canvas.height=logo.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(logo,0,0);
   const flags=[[534,270],[935,101],[1325,274]].map(([x,y])=>{const rgba=ctx.getImageData(x-380,y-55,1,1).data;return rgba[3]>200&&rgba[2]>rgba[0]+30;});
   return {fonts,assets,flags};
  });
  assert.ok(branding.fonts.every(faces=>faces.length>0&&faces.every(status=>status==='loaded')),'Both supplied font faces load offline');
  assert.ok(branding.assets.every(asset=>asset.width>0&&asset.height>0),'Every original branding element decodes offline');
  assert.deepEqual(branding.flags,[true,true,true],'All three flags are present in the packaged logo');
  const lockup=branding.assets.find(asset=>asset.name==='brand-lockup.svg');assert.deepEqual([lockup.width,lockup.height],[1100,755],'Packaged logo preserves the full source viewport');
  try{await page.waitForFunction(()=>{
   const camera=document.querySelector('.camera-wrap');
   return camera?.dataset.cameraStatus==='live'&&Number(camera.dataset.detectionTime)>0&&Number(camera.dataset.faceCount)===1&&Number(camera.dataset.personCount)===1;
  });}catch(error){
   console.error('Packaged camera diagnostics:',await page.locator('.camera-wrap').evaluate(el=>({...el.dataset})),errors);throw error;
  }
  assert.equal(await page.getByRole('button',{name:'Take your photo',exact:true}).count(),1);
  assert.equal(await page.getByRole('button').filter({visible:true}).count(),1);
  const info=await app.evaluate(({app,BrowserWindow})=>({packaged:app.isPackaged,platform:process.platform,arch:process.arch,version:app.getVersion(),userData:app.getPath('userData'),fullscreen:BrowserWindow.getAllWindows()[0].isFullScreen(),backgroundThrottling:BrowserWindow.getAllWindows()[0].webContents.getBackgroundThrottling()}));
  assert.equal(info.packaged,true);assert.equal(info.version,version);
  assert.equal(info.backgroundThrottling,false);
  assert.equal(path.resolve(info.userData),path.resolve(data));assert.equal(info.fullscreen,true);
  assert.equal(await page.evaluate(()=>window.station.setupStatus()),false);
  const system=await page.evaluate(()=>window.station.systemInfo());assert.equal(system.platform,info.platform);assert.equal(system.arch,info.arch);assert.ok(system.cpuCores>=1);
  assert.ok(['GPU','CPU'].includes(await page.locator('.camera-wrap').getAttribute('data-detector-backend')));
  assert.deepEqual(errors,[]);
  console.log(`PASS: packaged ${info.platform}/${info.arch} v${version}; fullscreen, isolated profile, camera and bundled face/person detectors work offline.`);
 }finally{
  if(app)await app.close();
  fs.rmSync(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
}
verify().catch(error=>{console.error(error);process.exitCode=1;});
