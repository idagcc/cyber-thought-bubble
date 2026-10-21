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
  // Reload without network access: all detector, font and artwork files must be local.
  await page.route(/^https?:\/\//,route=>route.abort());
  await page.reload();
  await page.waitForFunction(()=>!!window.station);
  const branding=await page.evaluate(async()=>{
   const fonts=await Promise.all(['Cyber Carnival','شهادة مشاركة'].map(async text=>(await document.fonts.load('700 30px "Noto Kufi Arabic"',text)).map(face=>face.status)));
   const assets=await Promise.all(['backdrop.jpg','brand.png','tents.png','fingerprint.png','cloud.png','shield.png','star.png','coin.png'].map(async name=>{const image=new Image();image.src=new URL(`./carnival/${name}`,location.href).href;await image.decode();return {name,width:image.naturalWidth,height:image.naturalHeight};}));
   return {fonts,assets};
  });
  assert.ok(branding.fonts.every(faces=>faces.length>0&&faces.every(status=>status==='loaded')),'Both supplied font faces load offline');
  assert.ok(branding.assets.every(asset=>asset.width>0&&asset.height>0),'Every original branding element decodes offline');
  await page.waitForFunction(()=>{
   const camera=document.querySelector('.camera-wrap');
   return camera?.dataset.cameraStatus==='live'&&Number(camera.dataset.detectionTime)>0;
  });
  assert.equal(await page.getByRole('button',{name:'Create my certificate',exact:true}).count(),1);
  assert.equal(await page.getByRole('button').filter({visible:true}).count(),1);
  const info=await app.evaluate(({app,BrowserWindow})=>({packaged:app.isPackaged,platform:process.platform,arch:process.arch,version:app.getVersion(),userData:app.getPath('userData'),fullscreen:BrowserWindow.getAllWindows()[0].isFullScreen()}));
  assert.equal(info.packaged,true);assert.equal(info.version,version);
  assert.equal(path.resolve(info.userData),path.resolve(data));assert.equal(info.fullscreen,true);
  assert.equal(await page.evaluate(()=>window.station.setupStatus()),false);
  const system=await page.evaluate(()=>window.station.systemInfo());assert.equal(system.platform,info.platform);assert.equal(system.arch,info.arch);assert.ok(system.cpuCores>=1);
  assert.ok(['GPU','CPU'].includes(await page.locator('.camera-wrap').getAttribute('data-detector-backend')));
  assert.deepEqual(errors,[]);
  console.log(`PASS: packaged ${info.platform}/${info.arch} v${version}; fullscreen, isolated profile, camera and bundled detector work offline.`);
 }finally{
  if(app)await app.close();
  fs.rmSync(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
}
verify().catch(error=>{console.error(error);process.exitCode=1;});
