import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {FaceDetector,FilesetResolver} from '@mediapipe/tasks-vision';
import {Camera as CameraIcon} from 'lucide-react';
import type {Config,Lang,Phrase} from './types';
import {drawBubbles,drawDemo,drawPlaceholder} from './photo';
import {updatePresence,type Face,type Presence} from './presence';
export type CameraHandle={snapshot:()=>string;retry:()=>void};
type Props={config:Config;lang:Lang;phrases:Phrase[];demo:boolean;onReady:(ready:boolean)=>void;onStatus:(status:string)=>void};
const Camera=forwardRef<CameraHandle,Props>(function Camera({config,lang,phrases,demo,onReady,onStatus},ref){
 const video=useRef<HTMLVideoElement>(null),canvas=useRef<HTMLCanvasElement>(null),wrap=useRef<HTMLDivElement>(null);const [status,setStatus]=useState('loading');const [retry,setRetry]=useState(0);
 const current=useRef({config,lang,phrases,demo,onReady,onStatus});current.current={config,lang,phrases,demo,onReady,onStatus};
 const rawFace=useRef<Face|null>(null),present=useRef<Presence>({since:null,last:null,ready:false}),ready=useRef(false);const displayHeight=useRef(1600);
 function render(ctx:CanvasRenderingContext2D,height:number,now:number,bubbles:boolean){
  const v=video.current!,c=current.current;let face:Face|null=null;ctx.clearRect(0,0,900,height);
  if(c.demo){ctx.save();ctx.translate(0,(height-1120)/2);drawDemo(ctx);ctx.restore();face={x:.5,y:(height/2-67)/height,w:.26,h:330/height};}
  else if(v.readyState>=2&&v.videoWidth){const scale=Math.max(900/v.videoWidth,height/v.videoHeight),dw=v.videoWidth*scale,dh=v.videoHeight*scale,ox=(900-dw)/2,oy=(height-dh)/2;ctx.save();if(c.config.mirrored){ctx.translate(900,0);ctx.scale(-1,1);}ctx.drawImage(v,ox,oy,dw,dh);ctx.restore();const b=rawFace.current;if(b){face={x:(b.x*dw+ox)/900,y:(b.y*dh+oy)/height,w:b.w*dw/900,h:b.h*dh/height};if(c.config.mirrored)face.x=1-face.x;}}
  else{ctx.save();ctx.scale(1,height/1120);drawPlaceholder(ctx);ctx.restore();}
  if(bubbles&&face)drawBubbles(ctx,face,c.phrases,c.lang,now,height);return face;
 }
 useImperativeHandle(ref,()=>({snapshot:()=>{if(!ready.current)throw Error(lang==='ar'?'واجه الكاميرا وحاول مجدداً.':'Face the camera and try again.');const photo=document.createElement('canvas');photo.width=1200;photo.height=1320;const ctx=photo.getContext('2d')!;ctx.scale(4/3,4/3);render(ctx,990,performance.now(),true);return photo.toDataURL('image/jpeg',.96);},retry:()=>setRetry(n=>n+1)}),[lang]);
 useEffect(()=>{const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;displayHeight.current=Math.round(900*height/Math.max(width,1));if(canvas.current)canvas.current.height=displayHeight.current;});observer.observe(wrap.current!);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  let stopped=false,stream:MediaStream|null=null,detector:FaceDetector|null=null,frame=0,lastCheck=0,lastVideoTime=-1,lastFreshFrame=0;
  const update=(s:string)=>{if(!stopped){setStatus(s);current.current.onStatus(s);}};
  present.current={since:null,last:null,ready:false};rawFace.current=null;ready.current=false;current.current.onReady(false);update('loading');
  async function start(){
   if(demo){update('demo');return;}
   try{stream=await navigator.mediaDevices.getUserMedia({video:config.cameraId?{deviceId:{exact:config.cameraId},width:{ideal:1920},height:{ideal:1080}}:{width:{ideal:1920},height:{ideal:1080},facingMode:'user'},audio:false});if(stopped){stream.getTracks().forEach(t=>t.stop());return;}video.current!.srcObject=stream;await video.current!.play();stream.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{rawFace.current=null;update('camera-error');}));
    update('model');const files=await FilesetResolver.forVisionTasks(new URL('wasm/',document.baseURI).href);detector=await FaceDetector.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('models/blaze_face_short_range.tflite',document.baseURI).href,delegate:'CPU'},runningMode:'VIDEO',minDetectionConfidence:.6,minSuppressionThreshold:.3});if(stopped){detector.close();detector=null;return;}update('live');
   }catch(e){console.error(e);update(stream?'detector-error':'camera-error');}
  }
  function draw(now:number){
   if(stopped)return;const ctx=canvas.current!.getContext('2d')!,v=video.current!,c=current.current;
   if(!demo&&detector&&v.readyState>=2&&v.videoWidth&&now-lastCheck>110&&v.currentTime!==lastVideoTime){lastCheck=now;lastFreshFrame=now;lastVideoTime=v.currentTime;try{const boxes=detector.detectForVideo(v,now).detections.map(d=>d.boundingBox!).filter(Boolean).sort((a,b)=>b.width*b.height-a.width*a.height);const b=boxes[0];rawFace.current=b?{x:(b.originX+b.width/2)/v.videoWidth,y:(b.originY+b.height/2)/v.videoHeight,w:b.width/v.videoWidth,h:b.height/v.videoHeight}:null;}catch{rawFace.current=null;update('detector-error');}}
   if(!demo&&(now-lastFreshFrame>600||stream?.getVideoTracks()[0]?.readyState==='ended'))rawFace.current=null;
   let face=render(ctx,displayHeight.current,now,false);if(face&&(face.x<.14||face.x>.86||face.y<.14||face.y>.74))face=null;
   present.current=updatePresence(present.current,face,now);if(present.current.ready!==ready.current){ready.current=present.current.ready;c.onReady(ready.current);}if(ready.current&&face)drawBubbles(ctx,face,c.phrases,c.lang,now,displayHeight.current,now-(present.current.since||now)-2000);
   frame=requestAnimationFrame(draw);
  }
  start();frame=requestAnimationFrame(draw);return()=>{stopped=true;cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop());detector?.close();rawFace.current=null;};
 },[config.cameraId,demo,retry]);
 const ar=lang==='ar',failure=status.endsWith('error');
 return <div className="camera-wrap" ref={wrap}><video ref={video} playsInline muted className="source-video"/><canvas ref={canvas} width={900} height={1600}/>{(failure||status==='loading'||status==='model')&&<div className="camera-notice"><CameraIcon size={32}/><strong>{failure?(ar?'الكاميرا غير جاهزة':'Your camera is not ready'):(ar?'جارٍ إعداد الكاميرا…':'Getting camera-ready…')}</strong><span>{failure?(ar?'تأكد من توصيل الكاميرا والسماح بالوصول إليها.':'Connect a camera and allow camera access.'):(ar?'لحظة واحدة فقط':'Just a moment')}</span></div>}</div>;
});export default Camera;
