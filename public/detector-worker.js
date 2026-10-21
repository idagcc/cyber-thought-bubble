/* Separate full-frame and detail workers; each owns its model and one frame. */
let detector,files,base,role='full',backend='CPU',tileCursor=0,inferenceClock=0;
let canvas,context,calibrated=false,cpuCandidate,calibration={};
async function createDetector(delegate){
 return vision.FaceDetector.createFromOptions(files,{
  baseOptions:{modelAssetPath:new URL('models/blaze_face_full_range_sparse.tflite',base).href,delegate},
  ...(delegate==='GPU'?{canvas:new OffscreenCanvas(1,1)}:{}),
  runningMode:'VIDEO',minDetectionConfidence:.5,minSuppressionThreshold:.3
 });
}
function infer(model,image,timestamp){
 inferenceClock=Math.max(inferenceClock+1,timestamp);
 return model.detectForVideo(image,inferenceClock).detections;
}
async function chooseBackend(image,timestamp){
 // Benchmark actual frames after warmup. GPU availability alone says little about speed.
 const timings={};
 for(const [delegate,model] of [['GPU',detector],['CPU',cpuCandidate]]){
  try{
   infer(model,image,timestamp);const samples=[];
   for(let i=0;i<3;i++){const start=performance.now();infer(model,image,timestamp);samples.push(performance.now()-start);}
   timings[delegate]=samples.sort((a,b)=>a-b)[1];
  }catch(e){if(delegate==='CPU')throw e;}
 }
 calibration=timings;
 if(timings.GPU!==undefined&&timings.GPU<timings.CPU*.95){backend='GPU';cpuCandidate.close();}
 else {detector.close();detector=cpuCandidate;backend='CPU';}
 cpuCandidate=undefined;calibrated=true;
}
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   base=data.base;role=data.role||'full';
   importScripts(new URL('face-regions.js',base).href,new URL('vision/vision.js',base).href);
   files=await vision.FilesetResolver.forVisionTasks(new URL('wasm/',base).href);
   if(role==='full'&&data.delegate!=='CPU'){
    try{detector=await createDetector('GPU');backend='GPU';cpuCandidate=await createDetector('CPU');}
    catch{detector?.close();detector=await createDetector('CPU');backend='CPU';calibrated=true;}
   }else{detector=await createDetector('CPU');calibrated=true;}
   self.postMessage({type:'ready',backend});
  }else if(data.type==='frame'){
   try{
    const width=data.bitmap.width,height=data.bitmap.height;
    let image=data.bitmap,region={x:0,y:0,width,height},tile;
    if(role==='detail'){
     const regions=faceRegions(width,height);tile=tileCursor++%regions.length;region=regions[tile];
     if(!canvas){canvas=new OffscreenCanvas(region.width,region.height);context=canvas.getContext('2d');}
     if(canvas.width!==region.width||canvas.height!==region.height){canvas.width=region.width;canvas.height=region.height;}
     context.drawImage(data.bitmap,region.x,region.y,region.width,region.height,0,0,region.width,region.height);image=canvas;
    }
    if(!calibrated)await chooseBackend(image,data.timestamp);
    const start=performance.now();let detections;
    try{detections=infer(detector,image,data.timestamp);}
    catch(e){
     if(backend!=='GPU')throw e;
     detector.close();detector=await createDetector('CPU');backend='CPU';
     detections=infer(detector,image,data.timestamp);
    }
    self.postMessage({type:'result',faces:regionFaces(detections,region,width,height,role==='detail'?'tile':'full'),timestamp:data.timestamp,ms:performance.now()-start,passes:1,backend,tile,calibration});
   }finally{data.bitmap.close();}
  }
 }catch(e){self.postMessage({type:'error',message:e.message||String(e)});}
};
