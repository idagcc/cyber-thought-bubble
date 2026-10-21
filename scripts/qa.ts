// Dev-only visual checks; none of this entry point is packaged.
const params=new URLSearchParams(location.search);
if(params.has('artwork')){
 const {drawGlassArtwork,glassArtwork}=await import('../src/bubbleArtwork');
 document.body.style.cssText='margin:0;background:#07162a;color:#f2faff;font:16px system-ui;padding:28px';
 const heading=document.createElement('h1');heading.textContent='Blue liquid glass';heading.style.cssText='font-size:24px;font-weight:500';document.body.append(heading);
 const description=document.createElement('p');description.textContent='Three gently drifting glass layers · select a bubble to download its still image';description.style.color='#a6bed7';document.body.append(description);
 const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:24px;max-width:1500px';document.body.append(grid);
 const previews:CanvasRenderingContext2D[]=[],reduced=matchMedia('(prefers-reduced-motion: reduce)');
 for(let i=0;i<4;i++){
  const link=document.createElement('a');link.download=`liquid-glass-blue-${i+1}.png`;link.href=glassArtwork(i).toDataURL();
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=480;canvas.setAttribute('aria-label',`Animated blue glass bubble ${i+1}`);canvas.style.cssText='display:block;width:100%';previews.push(canvas.getContext('2d')!);link.append(canvas);grid.append(link);
 }
 function frame(now:number){for(let i=0;i<previews.length;i++){const ctx=previews[i];ctx.clearRect(0,0,768,480);drawGlassArtwork(ctx,i,0,0,768,480,reduced.matches?0:now/1000,i*1.7);}requestAnimationFrame(frame);}requestAnimationFrame(frame);
}else if(params.has('live')){
 await import('./live-qa');
}else{
// Dev-only camera fixture. This entry point is excluded from packaged builds.
const image=new Image();image.src='/tests/fixtures/portrait.png';await image.decode();
const highRes=params.get('camera')==='4k';
const source=document.createElement('canvas');source.width=highRes?3840:1280;source.height=highRes?2160:720;const ctx=source.getContext('2d')!;ctx.scale(source.width/1280,source.height/720);
let people=3,visible=true,moving=false,smallThird=false;
if(params.has('wide')){
 const style=document.createElement('style');style.textContent='#root{position:fixed;left:50%;top:210px;width:1600px;height:900px;transform-origin:top center}#root .app{width:1600px;height:900px;min-height:0}#root .kiosk-header{top:28px}#root .kiosk-title{font-size:38px}#root .live-action{bottom:28px}#root .live-action .hero-button{font-size:24px;min-height:66px}#root .camera-select{display:none}';document.head.append(style);
 const resize=()=>{const root=document.getElementById('root')!,scale=Math.min(innerWidth/1600,(innerHeight-220)/900);root.style.transform=`translateX(-50%) scale(${scale})`;};addEventListener('resize',resize);resize();
}
const bar=document.createElement('div');bar.style.cssText='position:fixed;z-index:9999;left:12px;right:12px;top:90px;display:flex;flex-wrap:wrap;gap:7px;padding:8px;background:#f2f7ff;color:#142d4b;font:12px sans-serif;border-radius:10px';
bar.innerHTML='<strong style="padding:7px">TEST CAMERA</strong><button>1 person</button><button>2 people</button><button>3 people</button><button>4 people</button><button>Hide faces</button><button>Move faces</button><button>Print calibration</button><a id="calibration" download="printer-test-6x4.jpg">Calibration image</a>';
document.body.append(bar);
const telemetry=document.createElement('output');telemetry.style.cssText='width:100%;font:12px/1.6 monospace';bar.append(telemetry);
setInterval(()=>{const data=document.querySelector<HTMLElement>('.camera-wrap')?.dataset;if(data)telemetry.textContent=`${data.faceCount} faces · ${data.bubbleCount??0} bubbles · display ${data.renderFps} fps · detection ${data.detectionFps??0} fps · ${data.detectorBackend??'starting'} / ${data.detectorWorkers??0} workers · inference ${data.inferenceMs??0}ms · latency ${data.detectionLatencyMs??0}ms · physics ${data.physicsMs??0}ms · paint ${data.paintMs??0}ms · full view ${data.fullFaceCount??0}`;},350);
const buttons=bar.querySelectorAll('button');
[1,2,3,4].forEach((n,i)=>buttons[i].onclick=()=>{people=n;visible=true;smallThird=false;});
buttons[4].onclick=()=>{visible=!visible;};buttons[5].onclick=()=>{moving=!moving;};
buttons[6].onclick=async()=>{const {printCalibration}=await import('../src/photo'),{defaultConfig}=await import('../src/config');const img=await printCalibration(defaultConfig);const a=bar.querySelector('a')!;a.href=img;a.textContent='Calibration ready';};
function frame(now:number){ctx.fillStyle='#183652';ctx.fillRect(0,0,1280,720);if(visible){const cols=people>4?people/2:people,xs=people>4?Array.from({length:people},(_,i)=>(i%cols+.5)/cols):people===1?[.5]:people===2?[.3,.68]:people===3?[.16,.5,.84]:[.12,.37,.63,.88];xs.forEach((x,i)=>{const h=people>4?335:smallThird&&i===2?185:people===4?440:580,w=h*.8,px=x*1280+(moving?Math.sin(now/1400+i)*(people>4?30:130):0);ctx.drawImage(image,528,0,864,1080,px-w/2,people>4?Math.floor(i/cols)*350+5:110,w,h);});}requestAnimationFrame(frame);}requestAnimationFrame(frame);
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>source.captureStream(highRes?30:60)});
await import('../src/main');
const dropout=document.createElement('button');dropout.textContent='Brief dropout';bar.append(dropout);dropout.onclick=()=>{visible=false;setTimeout(()=>{visible=true;},200);};
const small=document.createElement('button');small.textContent='Small third face';bar.append(small);small.onclick=()=>{people=3;visible=true;smallThird=true;};
for(const n of [6,8]){const button=document.createElement('button');button.textContent=`${n} people`;bar.append(button);button.onclick=()=>{people=n;visible=true;smallThird=false;};}
const compare=document.createElement('button');compare.textContent='Compare detector';bar.append(compare);
compare.onclick=async()=>{const {FaceDetector,FilesetResolver}=await import('@mediapipe/tasks-vision');const d=await FaceDetector.createFromOptions(await FilesetResolver.forVisionTasks('/wasm/'),{baseOptions:{modelAssetPath:'/models/blaze_face_short_range.tflite',delegate:'CPU'},runningMode:'VIDEO'});const r=d.detectForVideo(source,performance.now());compare.textContent=`Main: ${r.detections.length} faces`;d.close();};

}

export {};
