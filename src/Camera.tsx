import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {RefreshCw,Settings2} from 'lucide-react';
import type {Config,Lang,Phrase} from './types';
import {bubblesLoaded,drawThoughts,drawDemo} from './photo';
import {matchFaces,displayTracks,captureGroupReady,type FaceTrack} from './faceTracking';
import {stepWorld,type World} from './bubblePhysics';
import {DetectorClient} from './detector';
import {openCamera,orderCameras,cameraMessage} from './cameraSession';
import {certificateLayout,coverCrop} from './layout';
import {drawCarnivalBackdrop} from './carnival';
export type CameraHandle={snapshot:()=>string;retry:()=>void;beginCapture:()=>void;endCapture:()=>void};
type Props={config:Config;lang:Lang;phrases:Phrase[];demo:boolean;mode:'lobby'|'certificate';onReady:(ready:boolean)=>void;onStatus:(status:string)=>void;onCameraChange:(id:string)=>void};
const Camera=forwardRef<CameraHandle,Props>(function Camera({config,lang,phrases,demo,mode,onReady,onStatus,onCameraChange},ref){
 const video=useRef<HTMLVideoElement>(null),canvas=useRef<HTMLCanvasElement>(null),wrap=useRef<HTMLDivElement>(null);
 const [status,setStatus]=useState('loading'),[retry,setRetry]=useState(0),[failure,setFailure]=useState(''),[devices,setDevices]=useState<MediaDeviceInfo[]>([]),[cameraName,setCameraName]=useState(''),[tracking,setTracking]=useState('searching'),[count,setCount]=useState(0),[metrics,setMetrics]=useState({ms:0,fps:0});
 const current=useRef({config,lang,phrases,demo,mode,onReady,onStatus});current.current={config,lang,phrases,demo,mode,onReady,onStatus};
 const tracks=useRef<FaceTrack[]>([]),nextId=useRef(1),selected=useRef<number|null>(null),capturing=useRef(false),ready=useRef(false),lastDetection=useRef(0),world=useRef<World|undefined>(undefined),displaySize=useRef({width:1600,height:900});
 const reduced=useRef(matchMedia('(prefers-reduced-motion: reduce)').matches),ar=lang==='ar';
 function scene(ctx:CanvasRenderingContext2D,width:number,height:number,print=false):FaceTrack[]{
  const v=video.current!,c=current.current;ctx.clearRect(0,0,width,height);
  if(c.demo||!(v.readyState>=2&&v.videoWidth)){
   drawCarnivalBackdrop(ctx,width,height);
   const scale=width>height?height/1000:width/900,ox=(width-900*scale)/2,oy=(height-1120*scale)/2;
   if(c.demo){ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);drawDemo(ctx,false);ctx.restore();}
   return c.demo?[{x:.5,y:(491*scale+oy)/height,w:234*scale/width,h:330*scale/height,id:1,since:0,seen:performance.now(),ready:true,visible:true}]:[];
  }
  // The same full camera view fills both the wall and the print photo window.
  // Preserve the camera's aspect ratio while mapping every participant into it.
  const crop=coverCrop(v.videoWidth,v.videoHeight,width,height);
  ctx.save();if(c.config.mirrored){ctx.translate(width,0);ctx.scale(-1,1);}ctx.drawImage(v,crop.sx,crop.sy,crop.sw,crop.sh,0,0,width,height);ctx.restore();
  const project=(f:{x:number;y:number;w:number;h:number})=>({x:c.config.mirrored?1-(f.x*v.videoWidth-crop.sx)/crop.sw:(f.x*v.videoWidth-crop.sx)/crop.sw,y:(f.y*v.videoHeight-crop.sy)/crop.sh,w:f.w*v.videoWidth/crop.sw,h:f.h*v.videoHeight/crop.sh});
  return displayTracks(tracks.current,performance.now()).map(t=>({...t,...project(t),measured:t.measured?project(t.measured):undefined})).filter(f=>print?f.x+f.w/2>0&&f.x-f.w/2<1&&f.y+f.h/2>0&&f.y-f.h/2<1:f.x>.02&&f.x<.98&&f.y>.04&&f.y<.9);
 }
 useImperativeHandle(ref,()=>({
  beginCapture:()=>{if(!ready.current)throw Error(ar?'واجهوا الكاميرا واثبتوا للحظة.':'Face the camera and hold still for a moment.');capturing.current=true;},
  endCapture:()=>{capturing.current=false;},
  snapshot:()=>{
   if(!ready.current||!capturing.current||(!current.current.demo&&performance.now()-lastDetection.current>500))throw Error(ar?'واجهوا الكاميرا وحاولوا مجدداً.':'Face the camera and try again.');
   const photo=document.createElement('canvas'),layout=certificateLayout(current.current.config.certificateOrientation);photo.width=layout.photoWidth;photo.height=layout.photoHeight;
   const ctx=photo.getContext('2d')!,faces=scene(ctx,photo.width,photo.height,true);
   if(!captureGroupReady(faces,performance.now())||faces.some(f=>f.ready&&(f.x-f.w/2<0||f.x+f.w/2>1||f.y-f.h/2<0||f.y+f.h/2>1)))throw Error(ar?'ابتعدوا قليلاً عن الكاميرا ليظهر الجميع في الصورة.':'Step back a little so everyone fits in the photo.');
   const thoughts=stepWorld(undefined,faces,photo.width,photo.height,performance.now(),true,true);
   drawThoughts(ctx,thoughts.bodies,faces,current.current.phrases,current.current.lang,photo.width,photo.height);
   return photo.toDataURL('image/jpeg',.96);
  },retry:()=>setRetry(n=>n+1)
 }),[ar]);
 useEffect(()=>{const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect,base=width>height?1600:900;displaySize.current={width:base,height:Math.round(base*height/Math.max(width,1))};if(canvas.current){canvas.current.width=base;canvas.current.height=displaySize.current.height;}});observer.observe(wrap.current!);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  const query=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>{reduced.current=query.matches;};query.addEventListener('change',change);return()=>query.removeEventListener('change',change);
 },[]);
 useEffect(()=>{
  let stopped=false,stream:MediaStream|null=null,detector:DetectorClient|undefined,initialized=false,frame=0,lastCheck=0,lastVideoTime=-1,lastFeedback=0,renderFrames=0,lastFps=performance.now(),largestTextStep=0;
  const update=(s:string)=>{if(!stopped){setStatus(s);current.current.onStatus(s);}};
  tracks.current=[];selected.current=null;capturing.current=false;world.current=undefined;ready.current=false;current.current.onReady(false);setFailure('');update('loading');
  const refresh=async()=>{try{const list=orderCameras(await navigator.mediaDevices.enumerateDevices());if(!stopped)setDevices(list);}catch{}};
  const fail=(message:string)=>{if(stopped)return;initialized=false;tracks.current=[];setFailure(message);update('detector-error');};
  async function start(){
   try{
    await bubblesLoaded;if(stopped)return;
    if(demo){setCameraName('Illustration preview');update('demo');return;}
    if(window.station?.cameraAccess){const permission=await window.station.cameraAccess();if(permission==='denied'||permission==='restricted')throw new DOMException('Camera access is disabled in system settings.','NotAllowedError');}
    if(stopped)return;
    stream=await openCamera(navigator.mediaDevices,config.cameraId);if(stopped){stream.getTracks().forEach(t=>t.stop());return;}
    const v=video.current!;v.srcObject=stream;await v.play();if(stopped)return;
    const track=stream.getVideoTracks()[0];setCameraName(track.label||'Camera');await refresh();
    track.addEventListener('ended',()=>{if(!stopped){tracks.current=[];setFailure('NotReadableError');update('camera-error');}});
    update('model');
    detector=new DetectorClient(result=>{
     if(stopped)return;
     const now=performance.now();if(now-result.timestamp>500)return;
     lastDetection.current=result.timestamp;tracks.current=matchFaces(tracks.current,result.faces,now,()=>nextId.current++).map(t=>t.detected?{...t,observed:result.timestamp}:t);
     if(wrap.current){wrap.current.dataset.detectionTime=String(result.timestamp);wrap.current.dataset.detectionPasses=String(result.passes??1);wrap.current.dataset.fullFaceCount=String(result.fullFaces??result.faces.length);wrap.current.dataset.inferenceMs=result.ms.toFixed(1);wrap.current.dataset.rawFaces=JSON.stringify(result.faces);}
    },fail);
    await detector.ready;if(stopped)return;initialized=true;update('live');
   }catch(e){if(stopped)return;setFailure((e as Error).name);update(stream?'detector-error':'camera-error');await refresh();}
  }
  function draw(now:number){
   if(stopped)return;
   const ctx=canvas.current!.getContext('2d')!,v=video.current!,c=current.current;
   if(!demo&&initialized&&v.readyState>=2&&v.videoWidth&&now-lastCheck>80&&v.currentTime!==lastVideoTime){lastCheck=now;lastVideoTime=v.currentTime;void detector?.submit(v,now);}
   const {width,height}=displaySize.current,faces=scene(ctx,width,height);
   selected.current=faces.find(t=>t.ready)?.id??null;
   const nextReady=captureGroupReady(faces,now);
   if(nextReady!==ready.current){ready.current=nextReady;c.onReady(nextReady);}
   const physicsStart=performance.now(),previousWorld=world.current;
   world.current=stepWorld(world.current,faces,width,height,now,reduced.current);
   const physicsMs=performance.now()-physicsStart,paintStart=performance.now();
   for(const body of world.current.bodies){const old=previousWorld?.bodies.find(b=>b.key===body.key);
    if(old&&old.visible&&body.visible&&(old.opacity??1)>.8&&(body.opacity??1)>.8&&old.width===body.width)largestTextStep=Math.max(largestTextStep,Math.hypot((body.renderX??body.x)-(old.renderX??old.x),(body.renderY??body.y)-(old.renderY??old.y)));
   }
   drawThoughts(ctx,world.current.bodies,faces,c.phrases,c.lang,width,height);
   if(now-lastFeedback>350){if(wrap.current){wrap.current.dataset.bubbleCount=String(world.current.bodies.filter(b=>b.visible).length);wrap.current.dataset.physicsMs=physicsMs.toFixed(2);wrap.current.dataset.paintMs=(performance.now()-paintStart).toFixed(2);wrap.current.dataset.layoutVersion=String(world.current.layoutVersion);wrap.current.dataset.maxTextStep=largestTextStep.toFixed(2);largestTextStep=0;}
    lastFeedback=now;setTracking(nextReady?'ready':faces.length?'holding':'searching');setCount(faces.length);}
   renderFrames++;
   if(now-lastFps>=1000){setMetrics({ms:Number(wrap.current?.dataset.inferenceMs??0),fps:Math.round(renderFrames*1000/(now-lastFps))});renderFrames=0;lastFps=now;}
   frame=requestAnimationFrame(draw);
  }
  navigator.mediaDevices?.addEventListener?.('devicechange',refresh);void start();frame=requestAnimationFrame(draw);
  return()=>{stopped=true;cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop());detector?.close();tracks.current=[];navigator.mediaDevices?.removeEventListener?.('devicechange',refresh);};
 },[config.cameraId,demo,retry]);
 const failed=status.endsWith('error');
 return <div className="camera-wrap" ref={wrap} data-camera-status={status} data-mirrored={config.mirrored} data-camera-name={cameraName} data-camera-error={failure} data-face-state={tracking} data-face-count={count} data-selected-face={selected.current??''} data-render-fps={metrics.fps}>
  <video ref={video} playsInline muted className="source-video" aria-hidden="true" tabIndex={-1}/><canvas ref={canvas} width={1600} height={900} aria-label={ar?'عرض الكاميرا المباشر':'Live camera view'}/>
  {(failed||status==='loading'||status==='model')&&<div className={`camera-notice ${failed?'camera-failure':''}`} role={failed?'alert':'status'}>
   <span className="camera-notice-icon"><img src="./carnival/shield.png" alt=""/></span>
   <strong>{failed?(ar?'لنُجهّز الكاميرا.':'Let’s connect your camera.'):(ar?'نستعد للحظتك…':'Getting ready for your moment…')}</strong>
   <p>{failed?(status==='detector-error'?(ar?'الكاميرا تعمل. أعد المحاولة لتشغيل تتبّع الوجه.':'The camera is connected. Retry to start face tracking.'):cameraMessage(failure,ar)):(ar?'ستظهر صورتك هنا.':'Your live view will appear here.')}</p>
   {failed&&<>
    {devices.length>0&&<label className="camera-choice">{ar?'الكاميرا':'Camera'}<select value={config.cameraId} onChange={e=>onCameraChange(e.target.value)}><option value="">{ar?'اختيار تلقائي':'Choose automatically'}</option>{devices.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${i+1}`}</option>)}</select></label>}
    <div className="camera-recovery"><button className="primary" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={17}/>{ar?'إعادة المحاولة':'Try again'}</button>{window.station&&<button className="secondary" onClick={()=>window.station?.cameraSettings()}><Settings2 size={17}/>{ar?'إعدادات الكاميرا':'Camera settings'}</button>}</div>
   </>}
  </div>}
 </div>;
});export default Camera;
