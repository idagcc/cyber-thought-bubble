import type {Face} from './presence';
export type Detection={faces:Face[];timestamp:number;ms:number;passes?:number;fullFaces?:number};
export class DetectorClient {
 private worker:Worker;
 private busy=false;
 private closed=false;
 private timeout:ReturnType<typeof setTimeout>|undefined;
 private error:(message:string)=>void;
 readonly ready:Promise<void>;
 constructor(onResult:(result:Detection)=>void,onError:(message:string)=>void){
  this.error=onError;
  this.worker=new Worker(new URL('detector-worker.js',document.baseURI));
  this.ready=new Promise<void>((resolve,reject)=>{
   let initialized=false;
   const fail=(message:string)=>{this.busy=false;this.closed=true;this.worker.terminate();clearTimeout(this.timeout);if(!initialized)reject(Error(message));else onError(message);};
   this.worker.onerror=e=>fail(e.message||'Face tracking worker could not start.');
   this.worker.onmessage=({data})=>{
    if(this.closed)return;
    if(data.type==='ready'){initialized=true;clearTimeout(this.timeout);resolve();}
    if(data.type==='error')fail(data.message);
    if(data.type==='result'){this.busy=false;clearTimeout(this.timeout);onResult(data);}
   };
   this.timeout=setTimeout(()=>fail('Face tracking took too long to start. Try again.'),20000);
   this.worker.postMessage({type:'init',base:document.baseURI});
  });
 }
 async submit(video:HTMLVideoElement,timestamp:number){
  if(this.busy||this.closed)return;
  this.busy=true;
  try{
   this.timeout=setTimeout(()=>{if(!this.closed){this.closed=true;this.busy=false;this.worker.terminate();this.error('Face tracking stopped responding. Try again.');}},5000);
   // One frame in flight, no backlog. Keep enough detail for several nearby faces.
   const scale=Math.min(1,1280/video.videoWidth);
   const bitmap=await createImageBitmap(video,{resizeWidth:Math.round(video.videoWidth*scale),resizeHeight:Math.round(video.videoHeight*scale)});
   if(this.closed){bitmap.close();return;}
   this.worker.postMessage({type:'frame',bitmap,timestamp},[bitmap]);
  }catch(e){this.busy=false;if(!this.closed){this.close();this.error((e as Error).message);}}
 }
 close(){this.closed=true;clearTimeout(this.timeout);this.worker.terminate();}
}
