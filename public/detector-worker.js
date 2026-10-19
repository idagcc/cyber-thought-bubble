/* All inference runs here. One frame in flight; every bitmap is released. */
let detector,canvas,context,detailCanvas,detailContext,tileCursor=0,inferenceClock=0;
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   importScripts(new URL('face-regions.js',data.base).href,new URL('vision/vision.js',data.base).href);
   const files=await vision.FilesetResolver.forVisionTasks(new URL('wasm/',data.base).href);
   detector=await vision.FaceDetector.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('models/blaze_face_full_range_sparse.tflite',data.base).href,delegate:'CPU'},runningMode:'VIDEO',minDetectionConfidence:.5,minSuppressionThreshold:.3});
   self.postMessage({type:'ready'});
  }else if(data.type==='frame'){
   const start=performance.now();
   try{
    const width=data.bitmap.width,height=data.bitmap.height;
    if(!canvas){canvas=new OffscreenCanvas(width,height);context=canvas.getContext('2d');detailCanvas=new OffscreenCanvas(1,1);detailContext=detailCanvas.getContext('2d');}
    const detect=(region,source)=>{
     const target=source==='full'?canvas:detailCanvas,ctx=source==='full'?context:detailContext;
     if(target.width!==region.width||target.height!==region.height){target.width=region.width;target.height=region.height;}
     ctx.drawImage(data.bitmap,region.x,region.y,region.width,region.height,0,0,region.width,region.height);
     // MediaPipe requires increasing timestamps, including passes of one frame.
     inferenceClock=Math.max(inferenceClock+1,data.timestamp);
     return regionFaces(detector.detectForVideo(target,inferenceClock).detections,region,width,height,source);
    };
    let faces=detect({x:0,y:0,width,height},'full');const fullFaces=faces.length;
    const regions=faceRegions(width,height);
    // Two overlapping detail views per frame scan the full image in three frames.
    // Small/distant faces receive more model pixels without zooming the live view.
    for(let i=0;i<2;i++)faces.push(...detect(regions[tileCursor++%regions.length],'tile'));
    faces=mergeRegionFaces(faces);
    self.postMessage({type:'result',faces,timestamp:data.timestamp,ms:performance.now()-start,passes:3,fullFaces});
   }finally{data.bitmap.close();}
  }
 }catch(e){self.postMessage({type:'error',message:e.message||String(e)});}
};
