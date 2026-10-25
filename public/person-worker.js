/* Local body evidence only: one model for the scene, no identities or images retained. */
let detector,inferenceClock=0;
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   importScripts(new URL('vision/vision.js',data.base).href);
   const files=await vision.FilesetResolver.forVisionTasks(new URL('wasm/',data.base).href);
   detector=await vision.ObjectDetector.createFromOptions(files,{
    baseOptions:{modelAssetPath:new URL('models/efficientdet_lite0.tflite',data.base).href,delegate:'CPU'},
    runningMode:'VIDEO',categoryAllowlist:['person'],scoreThreshold:.35,maxResults:16
   });
   self.postMessage({type:'ready'});
  }else if(data.type==='frame'){
   try{
    const start=performance.now(),width=data.bitmap.width,height=data.bitmap.height;
    inferenceClock=Math.max(inferenceClock+1,data.timestamp);
    const detections=detector.detectForVideo(data.bitmap,inferenceClock).detections;
    const persons=detections.flatMap(d=>{
     const b=d.boundingBox;if(!b||b.width<=0||b.height<=0)return [];
     const left=Math.max(0,b.originX),top=Math.max(0,b.originY),right=Math.min(width,b.originX+b.width),bottom=Math.min(height,b.originY+b.height);
     if(right<=left||bottom<=top)return [];
     return [{x:(left+right)/2/width,y:(top+bottom)/2/height,w:(right-left)/width,h:(bottom-top)/height,confidence:d.categories?.[0]?.score??0}];
    });
    self.postMessage({type:'result',persons,timestamp:data.timestamp,ms:performance.now()-start});
   }finally{data.bitmap.close();}
  }
 }catch(e){self.postMessage({type:'error',message:e.message||'Person tracking failed. Try again.'});}
};
