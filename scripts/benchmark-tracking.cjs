// Synthetic detector/display benchmark. This does not measure event camera accuracy.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs');
const os=require('node:os');
const assert=require('node:assert/strict');
async function main(){
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:5174,strictPort:true}});
 let browser;
 try{
  await server.listen();browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
  if(process.argv.includes('--cpu'))await page.addInitScript(()=>{
   const Original=window.Worker;
   window.Worker=class extends Original{postMessage(data,...transfer){if(data?.type==='init'&&data.role==='full')data={...data,delegate:'CPU'};return super.postMessage(data,...transfer);}};
  });
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5174/qa.html?camera=4k');
  await page.waitForFunction(()=>document.querySelector('.camera-wrap')?.dataset.cameraStatus==='live',null,{timeout:30000});
  const scenes=[];
  for(const people of [1,4,8]){
   await page.getByRole('button',{name:people===1?'1 person':`${people} people`,exact:true}).click();
   await page.waitForFunction(n=>Number(document.querySelector('.camera-wrap')?.dataset.faceCount)===n,people,{timeout:15000});
   if(people===8&&process.argv.includes('--moving'))await page.getByRole('button',{name:'Move faces',exact:true}).click();
   const report=await page.evaluate(async people=>{
    await new Promise(resolve=>setTimeout(resolve,3000));
    const readings=[];const frames=[],updates=[];let last=performance.now(),stamp='';
    let stop=false;
    const tick=now=>{if(stop)return;frames.push(now-last);last=now;requestAnimationFrame(tick);};requestAnimationFrame(tick);
    const start=performance.now();
    while(performance.now()-start<5000){
     const data={...document.querySelector('.camera-wrap').dataset};readings.push(data);
     if(data.detectionTime!==stamp){stamp=data.detectionTime;updates.push({time:performance.now(),faces:Number(data.faceCount),ms:Number(data.inferenceMs),latency:Number(data.detectionLatencyMs)});}
     await new Promise(resolve=>setTimeout(resolve,10));
    }
    stop=true;
    const mean=key=>readings.reduce((sum,row)=>sum+Number(row[key]??0),0)/readings.length;
    const percentile=(values,p)=>values.sort((a,b)=>a-b)[Math.floor((values.length-1)*p)]??0;
    const all=readings.filter(row=>Number(row.faceCount)===people).length/readings.length;
    return {people,camera:{width:mean('cameraWidth'),height:mean('cameraHeight'),fps:mean('cameraFps')},backend:readings.at(-1).detectorBackend,bubbleRenderer:readings.at(-1).bubbleRenderer,workers:mean('detectorWorkers'),renderFps:mean('renderFps'),detectionFps:mean('detectionFps'),inferenceMeanMs:mean('inferenceMs'),inferenceP95Ms:percentile(updates.map(row=>row.ms),.95),resultLatencyMeanMs:mean('detectionLatencyMs'),frameP95Ms:percentile(frames,.95),allFacesFraction:all,minFaces:Math.min(...readings.map(row=>Number(row.faceCount))),maxFaces:Math.max(...readings.map(row=>Number(row.faceCount))),bubbleRange:[Math.min(...readings.map(row=>Number(row.bubbleCount))),Math.max(...readings.map(row=>Number(row.bubbleCount)))],calibration:JSON.parse(readings.at(-1).detectorCalibration||'{}')};
   },people);
   assert.ok(report.allFacesFraction>.95,`Unstable ${people}-person fixture: ${JSON.stringify(report)}`);
   scenes.push(report);fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:`artifacts/tracking-4k-${people}-people.png`});
  }
  assert.deepEqual(errors,[]);
  const cpu=process.argv.includes('--cpu'),report={date:new Date().toISOString(),platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,mode:cpu?'Forced CPU validation':'Automatic',movingEightPersonScene:process.argv.includes('--moving'),fixture:'Repeated portrait; synthetic 3840×2160 at 30 fps, 1920×1080 viewport; not a live crowd or a Windows hardware guarantee.',scenes};
  fs.writeFileSync(`artifacts/tracking-${cpu?'cpu-fallback':'performance'}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
 }finally{if(browser)await browser.close();await server.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
