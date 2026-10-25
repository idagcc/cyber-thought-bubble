// Real bundled models and synthetic moving body; never opens a physical camera.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const {createServer}=await import('vite'),server=await createServer({server:{host:'127.0.0.1',port:5176,strictPort:true}});
 let browser;
 try{
  await server.listen();browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.route('**/tracking-fixture',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
  await page.goto('http://127.0.0.1:5176/tracking-fixture');
  const trace=await page.evaluate(async()=>{
   const {DetectorClient}=await import('/src/detector.ts'),{matchFaces,displayTracks,captureGroupReady}=await import('/src/faceTracking.ts'),{stepWorld}=await import('/src/bubblePhysics.ts');
   const image=new Image();image.src='/tests/fixtures/portrait.png';await image.decode();
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');
   ctx.fillRect(0,0,1280,720);const video=document.createElement('video');video.muted=true;video.srcObject=canvas.captureStream(30);
   let id=0,tracks=[],world,trace=[],running=true,started=0,error='';
   const detector=new DetectorClient(r=>{
    const now=performance.now();tracks=matchFaces(tracks,r.faces,now,()=>++id,r.persons);
    const shown=displayTracks(tracks,now);world=stepWorld(world,shown,1600,900,now);
    trace.push({elapsed:now-started,now,faces:r.faces,persons:r.persons,tracks,display:shown,ready:captureGroupReady(shown,now),bubbles:world.bodies.map(b=>({key:b.key,owner:b.owner,x:b.renderX??b.x,y:b.renderY??b.y,width:b.width,height:b.height,opacity:b.opacity,visible:b.visible,retiring:b.retiring}))});
   },message=>{error=message;});
   let last=-1;
   function frame(){
    if(!running)return;const now=performance.now(),elapsed=started?now-started:0,masked=elapsed>=4000&&elapsed<16000,absent=elapsed>=19000&&elapsed<22000;
    const x=640+(elapsed>=4000&&elapsed<19000?Math.sin((elapsed-4000)/1400)*130:0);
    ctx.fillStyle='#183652';ctx.fillRect(0,0,1280,720);
    if(!absent){ctx.drawImage(image,528,0,864,1080,x-232,110,464,580);if(masked){ctx.fillStyle='#292724';ctx.beginPath();ctx.ellipse(x+464*.013,110+580*.205,464*.175,580*.17,0,0,Math.PI*2);ctx.fill();}}
    if(started&&video.readyState>=2&&video.currentTime!==last){last=video.currentTime;void detector.submit(video,now);}
    requestAnimationFrame(frame);
   }
   frame();
   try{await video.play();await detector.ready;started=performance.now();await new Promise(r=>setTimeout(r,25500));if(error)throw Error(error);return trace;}
   finally{running=false;detector.close();video.srcObject.getTracks().forEach(t=>t.stop());}
  });
  fs.mkdirSync('tmp',{recursive:true});fs.writeFileSync('tmp/person-tracking-replay.json',JSON.stringify(trace));
  assert.deepEqual(errors,[]);
  const initial=trace.find(t=>t.elapsed>3000&&t.tracks.some(p=>p.ready));assert.ok(initial,'visitor activates');
  const owner=initial.tracks.find(p=>p.ready).id,away=trace.filter(t=>t.elapsed>5500&&t.elapsed<15500);
  assert.ok(away.length>150,'sustained real detector samples');
  for(const frame of away){
   const person=frame.tracks.find(p=>p.id===owner);assert.ok(person?.ready&&person.visible,`owner lost while body visible at ${frame.elapsed}`);
   assert.ok(frame.tracks.filter(p=>p.ready&&p.visible).every(p=>p.id===owner),`false extra visitor at ${frame.elapsed}`);
   const primary=frame.bubbles.find(b=>b.key===`${owner}:0`&&!b.retiring);assert.ok(primary?.visible&&primary.opacity>.9,`primary disappears at ${frame.elapsed}`);
   assert.ok(Math.abs(person.y-initial.tracks[0].y)<.12,`head anchor hijacked at ${frame.elapsed}`);
   const shown=frame.display.find(p=>p.id===owner),expectedX=initial.tracks[0].x+Math.sin((frame.elapsed-4000)/1400)*130/1280;
   assert.ok(Math.abs(shown.x-expectedX)<.07&&Math.abs(shown.y-initial.tracks[0].y)<.08,`display head prediction drifts from the fixture at ${frame.elapsed}`);
  }
  const positions=away.map(f=>f.bubbles.find(b=>b.key===`${owner}:0`).x);
  assert.ok(Math.max(...positions)-Math.min(...positions)>150,'bubble follows lateral body movement');
  assert.ok(trace.some(t=>t.elapsed>17000&&t.elapsed<18500&&t.ready&&t.tracks.some(p=>p.id===owner&&p.detected)),'same owner returns facing camera');
  assert.ok(trace.some(t=>t.elapsed>21500&&t.elapsed<22000&&!t.tracks.some(p=>p.visible)),'departure clears visible tracking');
  assert.ok(trace.some(t=>t.elapsed>24500&&t.tracks.some(p=>p.ready&&p.id!==owner)),'re-entry creates a new session');
  console.log(`PASS: ${away.length} real-model samples retain owner ${owner} through 10s masked-face movement; same-owner recovery, departure and new session.`);
 }finally{await browser?.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
