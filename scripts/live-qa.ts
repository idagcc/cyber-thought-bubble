// Development-only diagnostics for the actual selected camera. No recording.
const style=document.createElement('style');
style.textContent='#root{position:fixed;left:0;top:215px;width:1600px;height:900px;transform-origin:top left}#root .app{width:1600px;height:900px;min-height:0}#root .kiosk-header{top:28px}#root .kiosk-title{font-size:38px}#root .live-action{bottom:28px}#root .live-action .hero-button{font-size:24px;min-height:66px}#root .camera-select{top:22px;bottom:auto;width:340px}#root .camera-select label{font-size:18px}#root .camera-select select{font-size:18px}';document.head.append(style);
const resize=()=>{const root=document.getElementById('root')!,scale=Math.min(innerWidth/1600,(innerHeight-225)/900);root.style.transform=`scale(${scale})`;root.style.left=`${(innerWidth-1600*scale)/2}px`;};addEventListener('resize',resize);resize();
const bar=document.createElement('section');bar.style.cssText='position:fixed;z-index:9999;left:12px;right:12px;top:18px;padding:14px;background:#f2f7ff;color:#142d4b;font:13px/1.7 system-ui;border-radius:10px';
bar.innerHTML='<strong>LIVE CAMERA CHECK · 3 people expected</strong><div>Outlines show actual detector results. Camera images stay on this computer.</div>';
const output=document.createElement('output');output.style.cssText='display:block;white-space:pre-wrap;font:12px/1.8 monospace';bar.append(output);document.body.append(bar);
const overlay=document.createElement('canvas');overlay.width=1600;overlay.height=900;overlay.style.cssText='position:fixed;pointer-events:none;z-index:20';document.body.append(overlay);const ctx=overlay.getContext('2d')!;
const paused=new URLSearchParams(location.search).has('paused');
const toggle=document.createElement('button');toggle.textContent=paused?'Start live check':'Stop live check';toggle.style.cssText='padding:7px 14px;margin-top:8px;border-radius:8px;background:#245cba;color:white';bar.append(toggle);
toggle.onclick=()=>{const url=new URL(location.href);paused?url.searchParams.delete('paused'):url.searchParams.set('paused','1');location.href=url.href;};
if(paused)output.textContent='Camera stopped. Start the live check when all three people are available.';
const {coverCrop}=await import('../src/layout');
let frameTimes:number[]=[],last=performance.now(),lastReport=0,lastDetection='',maxTextStep=0;
const readings:{time:number;count:number}[]=[];
function draw(now:number){
 const elapsed=now-last;last=now;frameTimes.push(elapsed);if(frameTimes.length>300)frameTimes.shift();
 const wrap=document.querySelector<HTMLElement>('.camera-wrap'),video=document.querySelector('video'),canvas=wrap?.querySelector('canvas');
 if(wrap&&video&&canvas){
  const bounds=canvas.getBoundingClientRect();Object.assign(overlay.style,{left:`${bounds.left}px`,top:`${bounds.top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`});
  const data=wrap.dataset,faces=JSON.parse(data.rawFaces||'[]') as {x:number;y:number;w:number;h:number;confidence?:number}[];
  if(data.detectionTime&&data.detectionTime!==lastDetection){lastDetection=data.detectionTime;readings.push({time:now,count:faces.length});}
  while(readings.length&&now-readings[0].time>60000)readings.shift();
  maxTextStep=Math.max(maxTextStep,Number(data.maxTextStep??0));
  ctx.clearRect(0,0,1600,900);
  if(video.videoWidth){
   const crop=coverCrop(video.videoWidth,video.videoHeight,1600,900);
   faces.forEach((f,i)=>{
    const cx=(f.x*video.videoWidth-crop.sx)/crop.sw,cy=(f.y*video.videoHeight-crop.sy)/crop.sh;
    const x=(data.mirrored==='false'?cx:1-cx)*1600,w=f.w*video.videoWidth/crop.sw*1600,h=f.h*video.videoHeight/crop.sh*900,y=cy*900;
    ctx.strokeStyle='#8fffd1';ctx.lineWidth=3;ctx.strokeRect(x-w/2,y-h/2,w,h);
    ctx.font='600 20px system-ui';ctx.fillStyle='#061a2fdd';ctx.fillRect(x-w/2,y-h/2-30,150,28);ctx.fillStyle='#bcffe8';ctx.fillText(`Face ${i+1}${f.confidence===undefined?'':` · ${Math.round(f.confidence*100)}%`}`,x-w/2+6,y-h/2-10);
   });
  }
  if(now-lastReport>350){
   const counts=readings.reduce<Record<string,number>>((out,r)=>{out[r.count]=(out[r.count]??0)+1;return out;},{}),span=readings.length?(now-readings[0].time)/1000:0;
   const sorted=[...frameTimes].sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)]??0;
   output.textContent=`${data.cameraName||'Opening camera…'} · ${video.videoWidth} × ${video.videoHeight} · camera ${video.srcObject instanceof MediaStream?video.srcObject.getVideoTracks()[0]?.getSettings().frameRate??'?':'?'} fps\nDetected: ${faces.length} (full view ${data.fullFaceCount??0}) · On screen: ${data.faceCount??0} · Bubbles: ${data.bubbleCount??0}\nRender: ${data.renderFps??0} fps · Detection: ${data.detectionFps??0} fps · ${data.detectorBackend??'starting'} / ${data.detectorWorkers??0} workers\nInference: ${data.inferenceMs??0} ms · Result latency: ${data.detectionLatencyMs??0} ms · Detail scan: ${data.detailMs??0} ms · Frame p95: ${p95.toFixed(1)} ms\nPhysics: ${data.physicsMs??0} ms · Paint: ${data.paintMs??0} ms · Layout revisions: ${data.layoutVersion??0}\nLast ${span.toFixed(0)}s: ${JSON.stringify(counts)} · Largest text step: ${maxTextStep.toFixed(2)} px`;
   lastReport=now;
  }
 }
 requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
if(!paused)await import('../src/main');

export {};
