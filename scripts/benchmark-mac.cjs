// Native Electron resource/visitor-cycle check. Uses an isolated profile and never submits paper jobs.
const {_electron}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 assert.equal(process.platform,'darwin','Run this benchmark on the event Mac.');
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'thought-bubble-mac-benchmark-'));
 const packaged=process.argv.includes('--packaged'),executable=packaged?path.resolve('release/mac-arm64/Thought Bubble Studio.app/Contents/MacOS/Thought Bubble Studio'):require('electron');
 let app,sampling=false,sampler;const samples=[];
 try{
  app=await _electron.launch({executablePath:executable,args:[...(packaged?[]:['.']),'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'],env:{...process.env,THOUGHT_BUBBLE_TEST_DATA:data}});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const fixture='data:image/png;base64,'+fs.readFileSync('tests/fixtures/portrait.png').toString('base64');
  await page.addInitScript(({fixture})=>{
   const image=new Image();image.src=fixture;
   const canvas=document.createElement('canvas');canvas.width=3840;canvas.height=2160;const ctx=canvas.getContext('2d');ctx.scale(3,3);
   let last=-Infinity;
   function paint(now){
    if(now-last>=1000/30){last=now;ctx.fillStyle='#183652';ctx.fillRect(0,0,1280,720);
     for(let i=0;i<8;i++){const x=(i%4+.5)/4*1280+Math.sin(now/1400+i)*25;ctx.drawImage(image,528,0,864,1080,x-134,Math.floor(i/4)*350+5,268,335);}
    }
    requestAnimationFrame(paint);
   }
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{await image.decode();paint(performance.now());return canvas.captureStream(30);}});
  },{fixture});
  const devtools=await page.context().newCDPSession(page);
  await devtools.send('Emulation.setDeviceMetricsOverride',{width:3840,height:2160,deviceScaleFactor:1,mobile:false});
  await page.reload();await page.waitForFunction(()=>document.querySelector('.camera-wrap')?.dataset.cameraRenderer==='video'&&Number(document.querySelector('.camera-wrap')?.dataset.faceCount)===8);
  await app.evaluate(({app,ipcMain})=>{ipcMain.removeHandler('station:print');ipcMain.handle('station:print',()=>{});app.getAppMetrics();});
  sampling=true;
  sampler=(async()=>{while(sampling){
   const [processes,state]=await Promise.all([
    app.evaluate(({app})=>app.getAppMetrics().map(p=>({type:p.type,name:p.name,cpu:p.cpu.percentCPUUsage,rssMiB:p.memory.workingSetSize/1024}))),
    page.locator('.camera-wrap').evaluate(el=>({...el.dataset}))
   ]);
   samples.push({seconds:samples.length,cpu:processes.reduce((sum,p)=>sum+p.cpu,0),rssMiB:processes.reduce((sum,p)=>sum+p.rssMiB,0),fps:Number(state.renderFps),faces:Number(state.faceCount),phase:state.renderState,backend:state.detectorBackend,processes});
   if(samples.length%10===0)console.log(`Measured ${samples.length} seconds: ${Math.round(samples.at(-1).rssMiB)} MiB process working sets, ${state.renderState}.`);
   await page.waitForTimeout(1000);
  }})();
  await page.waitForTimeout(12000);
  fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/mac-4k-eight-person-live.png'});
  for(let visitor=0;visitor<3;visitor++){
   await page.getByRole('button',{name:'Take your photo',exact:true}).click();await page.locator('.photo-options button').first().waitFor({timeout:25000});
   assert.equal(await page.locator('.photo-options button').count(),3);
   const selected=page.locator('.photo-options button.selected img');assert.deepEqual(await selected.evaluate(img=>[img.naturalWidth,img.naturalHeight]),[1800,1200]);
   if(visitor===0){const image=await selected.getAttribute('src');fs.writeFileSync('artifacts/mac-large-photo-certificate.jpg',Buffer.from(image.split(',')[1],'base64'));}
   await page.waitForTimeout(2500);await page.getByRole('button',{name:'Print your photo',exact:true}).click();await page.getByRole('button',{name:'Next participant',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.camera-wrap')?.dataset.renderState==='active'&&Number(document.querySelector('.camera-wrap')?.dataset.faceCount)===8);await page.waitForTimeout(3500);
  }
  sampling=false;await sampler;sampler=undefined;assert.deepEqual(errors,[]);
  const system=await page.evaluate(()=>window.station.systemInfo()),native=await app.evaluate(({app})=>({packaged:app.isPackaged,version:app.getVersion(),gpu:app.getGPUFeatureStatus(),metrics:app.getAppMetrics()}));
  const active=samples.filter(s=>s.phase==='active'),paused=samples.filter(s=>s.phase==='paused');
  const mean=(rows,key)=>rows.reduce((sum,row)=>sum+row[key],0)/rows.length;
  const report={date:new Date().toISOString(),version:native.version,packaged:native.packaged,cpu:os.cpus()[0].model,system,target:'Apple Silicon Mac mini, 16 GB unified memory; target hardware not present on this test host.',fixture:'Synthetic 4K/30 canvas camera with eight repeated moving portraits; 4K renderer; three complete visitor cycles; printing intercepted; process totals include fixture and shared working sets.',durationSeconds:samples.length,peakProcessWorkingSetMiB:Math.max(...samples.map(s=>s.rssMiB)),activeMeanCpuPercent:mean(active,'cpu'),activeMeanDisplayFps:mean(active,'fps'),activeMinFaces:Math.min(...active.map(s=>s.faces)),pausedMeanCpuPercent:mean(paused,'cpu'),samples};
  assert.ok(report.peakProcessWorkingSetMiB<4096,'Resource test exceeded the four-GiB process-working-set allowance');
  fs.writeFileSync('artifacts/mac-performance-v'+native.version+'.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,samples:undefined},null,2));
 }finally{
  sampling=false;if(sampler)await sampler.catch(()=>{});if(app)await app.close();fs.rmSync(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
