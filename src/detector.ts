import type {Face} from './presence';
export type Detection={faces:Face[];timestamp:number;ms:number;passes?:number;fullFaces?:number;backend?:'CPU'|'GPU';fps?:number;detailMs?:number;latencyMs?:number;workers?:number;calibration?:Record<string,number>};
type Role='full'|'detail';
type Slot={worker:Worker;role:Role;busy:boolean;initialized:boolean;timeout?:ReturnType<typeof setTimeout>;lastSent:number};
type WorkerResult=Detection&{type:string;tile?:number;message?:string};

// New measurements win over cached crop detections, independently of confidence.
export function mergeDetections(faces:Face[]):Face[]{
 const kept:Face[]=[];
 for(const face of [...faces].sort((a,b)=>(b.observed??0)-(a.observed??0)||(b.confidence??0)-(a.confidence??0))){
  if(!kept.some(other=>{
   const iw=Math.max(0,Math.min(face.x+face.w/2,other.x+other.w/2)-Math.max(face.x-face.w/2,other.x-other.w/2));
   const ih=Math.max(0,Math.min(face.y+face.h/2,other.y+other.h/2)-Math.max(face.y-face.h/2,other.y-other.h/2));
   const overlap=iw*ih/(face.w*face.h+other.w*other.h-iw*ih);
   return overlap>.35||(Math.abs(face.x-other.x)<Math.min(face.w,other.w)*.28&&Math.abs(face.y-other.y)<Math.min(face.h,other.h)*.28);
  }))kept.push(face);
 }
 return kept;
}

export class DetectorClient {
 private slots:Slot[]=[];
 private closed=false;
 private details=new Map<number,Detection>();
 private lastFull=-Infinity;
 private detailMs=0;
 private fps=0;
 private fpsStart=0;
 private frames=0;
 private nextSlot=0;
 private rejectReady:((error:Error)=>void)|undefined;
 readonly ready:Promise<void>;
 constructor(private onResult:(result:Detection)=>void,private onError:(message:string)=>void){
  this.ready=new Promise<void>((resolve,reject)=>{
   this.rejectReady=reject;
   this.startWorker('full','auto',()=>{this.rejectReady=undefined;resolve();});
  });
  // This worker scans overlapping crops on another CPU core while the full view runs.
  if(!this.closed)this.startWorker('detail','CPU');
 }
 private fail(message:string){
  if(this.closed)return;
  const reject=this.rejectReady;this.close();
  if(reject)reject(Error(message));else this.onError(message);
 }
 private startWorker(role:Role,delegate:'auto'|'CPU',onReady?:()=>void){
  const slot:Slot={worker:new Worker(new URL('detector-worker.js',document.baseURI)),role,busy:false,initialized:false,lastSent:-Infinity};
  this.slots.push(slot);
  slot.worker.onerror=e=>this.fail(e.message||'Face tracking worker could not start.');
  slot.worker.onmessage=({data}:{data:WorkerResult})=>{
   if(this.closed)return;
   if(data.type==='ready'){slot.initialized=true;clearTimeout(slot.timeout);onReady?.();return;}
   if(data.type==='error'){this.fail(data.message||'Face tracking failed. Try again.');return;}
   if(data.type!=='result')return;
   slot.busy=false;clearTimeout(slot.timeout);
   if(role==='detail'){
    this.detailMs=data.ms;this.details.set(data.tile??0,data);return;
   }
   // Slow CPU frames may complete out of order. They must never rewind tracking.
   if(data.timestamp<=this.lastFull)return;
   this.lastFull=data.timestamp;
   if(data.backend==='CPU'&&navigator.hardwareConcurrency>=4&&this.slots.filter(s=>s.role==='full').length===1)this.startWorker('full','CPU');
   if(!this.fpsStart)this.fpsStart=data.timestamp;
   else this.frames++;
   if(data.timestamp-this.fpsStart>=1000){this.fps=this.frames*1000/(data.timestamp-this.fpsStart);this.frames=0;this.fpsStart=data.timestamp;}
   const faces=data.faces.map(face=>({...face,observed:data.timestamp}));
   for(const [tile,detail] of this.details){
    if(data.timestamp-detail.timestamp>250){this.details.delete(tile);continue;}
    faces.push(...detail.faces.map(face=>({...face,observed:detail.timestamp})));
   }
   this.onResult({...data,faces:mergeDetections(faces),fullFaces:data.faces.length,fps:this.fps,detailMs:this.detailMs,latencyMs:performance.now()-data.timestamp,workers:this.slots.length});
  };
  slot.timeout=setTimeout(()=>this.fail('Face tracking took too long to start. Try again.'),20000);
  slot.worker.postMessage({type:'init',base:document.baseURI,role,delegate});
 }
 private async send(slot:Slot,video:HTMLVideoElement,timestamp:number){
  slot.busy=true;slot.lastSent=timestamp;
  slot.timeout=setTimeout(()=>this.fail('Face tracking stopped responding. Try again.'),5000);
  try{
   // The full-view model resizes to 192px internally. Keep crop recovery at 1280px.
   const scale=Math.min(1,(slot.role==='full'?640:1280)/video.videoWidth);
   const bitmap=await createImageBitmap(video,{resizeWidth:Math.round(video.videoWidth*scale),resizeHeight:Math.round(video.videoHeight*scale)});
   if(this.closed){bitmap.close();return;}
   slot.worker.postMessage({type:'frame',bitmap,timestamp},[bitmap]);
  }catch(e){this.fail((e as Error).message);}
 }
 async submit(video:HTMLVideoElement,timestamp:number){
  if(this.closed)return;
  const full=this.slots.filter(s=>s.role==='full'),available=full.filter(s=>s.initialized&&!s.busy);
  const work:Promise<void>[]=[];
  if(available.length)work.push(this.send(available[this.nextSlot++%available.length],video,timestamp));
  const detail=this.slots.find(s=>s.role==='detail');
  // A bounded background scan, never a queue of old frames or a model per person.
  if(detail?.initialized&&!detail.busy&&timestamp-detail.lastSent>=1000/30)work.push(this.send(detail,video,timestamp));
  await Promise.all(work);
 }
 close(){this.closed=true;for(const slot of this.slots){clearTimeout(slot.timeout);slot.worker.terminate();}this.details.clear();}
}
