const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function geometry(){const scope={};vm.runInNewContext(fs.readFileSync('public/face-regions.js','utf8'),scope);return scope;}
const detection=(x,y,w,h,score=.9)=>({boundingBox:{originX:x,originY:y,width:w,height:h},categories:[{score}]});
test('overlapping detail views cover the entire frame, including edges',()=>{
 const {faceRegions}=geometry();
 for(const [width,height] of [[1280,720],[900,1600],[1920,1080]]){
  const tiles=faceRegions(width,height);assert.equal(tiles.length,6);
  for(let y=0;y<=height;y+=height/20)for(let x=0;x<=width;x+=width/20)assert.ok(tiles.some(t=>x>=t.x&&x<=t.x+t.width&&y>=t.y&&y<=t.y+t.height));
  for(const t of tiles){assert.ok(t.x>=0&&t.y>=0&&t.x+t.width<=width&&t.y+t.height<=height);assert.ok(t.width<width/2);}
 }
});
test('a crop detection maps to the original camera coordinates without changing the display',()=>{
 const {regionFaces}=geometry(),faces=regionFaces([detection(50,40,100,80)],{x:500,y:200,width:538,height:475},1280,720,'tile');
 assert.equal(faces.length,1);const f=faces[0];assert.equal(f.x,600/1280);assert.equal(f.y,280/720);assert.equal(f.w,100/1280);assert.equal(f.h,80/720);assert.equal(f.source,'tile');assert.equal(f.confidence,.9);
});
test('interior crop edges discard clipped faces while outer camera edges remain valid',()=>{
 const {regionFaces}=geometry();
 assert.equal(regionFaces([detection(-5,20,50,60)],{x:371,y:0,width:538,height:475},1280,720,'tile').length,0);
 const edge=regionFaces([detection(-5,20,50,60)],{x:0,y:0,width:538,height:475},1280,720,'tile');assert.equal(edge.length,1);assert.ok(edge[0].x-edge[0].w/2>=0);
});
test('merge removes repeated full/crop detections and keeps neighbouring people separate',()=>{
 const {mergeRegionFaces}=geometry(),a={x:.3,y:.3,w:.09,h:.14,confidence:.8,source:'full'},duplicate={...a,x:.302,confidence:.94,source:'tile'},neighbour={...a,x:.38,confidence:.85};
 const merged=mergeRegionFaces([a,duplicate,neighbour]);assert.equal(merged.length,2);assert.ok(merged.includes(duplicate));assert.ok(merged.includes(neighbour));
});
function worker({results=[],gpuError=false,gpuMs=3,cpuMs=20}={}){
 const messages=[],times=[],sizes=[],options=[],closed=[];let next=0,clock=0,failGpu=false;
 class OffscreenCanvas{constructor(width,height){this.width=width;this.height=height;}getContext(){return {drawImage(){}};}}
 const scope={URL,performance:{now:()=>clock},OffscreenCanvas,importScripts(){},self:{postMessage(m){messages.push(m);}},vision:{FilesetResolver:{forVisionTasks:async()=>({})},FaceDetector:{createFromOptions:async(_files,config)=>{
  const delegate=config.baseOptions.delegate;options.push(config);if(delegate==='GPU'&&gpuError)throw Error('GPU unavailable');
  return {close(){closed.push(delegate);},detectForVideo(canvas,time){if(delegate==='GPU'&&failGpu)throw Error('GPU context lost');clock+=delegate==='GPU'?gpuMs:cpuMs;times.push(time);sizes.push([canvas.width,canvas.height]);const result=results[next++];if(result instanceof Error)throw result;return {detections:result??[]};}};
 }}}};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('public/face-regions.js','utf8'),scope);vm.runInContext(fs.readFileSync('public/detector-worker.js','utf8'),scope);
 return {messages,times,sizes,options,closed,loseGpu(){failGpu=true;},send:data=>scope.self.onmessage({data})};
}
function bitmap(){return {width:1280,height:720,closed:false,close(){this.closed=true;}};}
test('full-frame worker uses one pass for every face instead of three sequential passes',async()=>{
 const w=worker({results:[[detection(800,150,100,100),detection(400,250,80,80)]]});await w.send({type:'init',base:'http://localhost/',role:'full',delegate:'CPU'});
 const image=bitmap();await w.send({type:'frame',bitmap:image,timestamp:1000});const result=w.messages.at(-1);
 assert.equal(result.faces.length,2);assert.equal(result.passes,1);assert.equal(result.timestamp,1000);assert.ok(image.closed);assert.deepEqual(w.times,[1000]);assert.equal(w.options[0].minDetectionConfidence,.5);
});
test('background worker scans rotating crops and releases a bitmap after inference failure',async()=>{
 const w=worker({results:[[detection(180,80,50,50)],new Error('detail inference failed')]});await w.send({type:'init',base:'http://localhost/',role:'detail',delegate:'CPU'});
 const first=bitmap();await w.send({type:'frame',bitmap:first,timestamp:1000});assert.equal(w.messages.at(-1).tile,0);assert.equal(w.messages.at(-1).faces[0].source,'tile');assert.deepEqual(w.sizes[0],[538,475]);assert.ok(first.closed);
 const second=bitmap();await w.send({type:'frame',bitmap:second,timestamp:1001});assert.ok(second.closed);assert.equal(w.messages.at(-1).type,'error');assert.match(w.messages.at(-1).message,/detail inference failed/);
});
test('GPU initialization failure falls back to CPU without losing the frame',async()=>{
 const w=worker({gpuError:true});await w.send({type:'init',base:'http://localhost/',role:'full'});
 const image=bitmap();await w.send({type:'frame',bitmap:image,timestamp:1000});assert.equal(w.messages.at(-1).backend,'CPU');assert.ok(image.closed);
});
test('backend selection measures warmed inference rather than assuming GPU is faster',async()=>{
 for(const [gpuMs,cpuMs,expected] of [[3,20,'GPU'],[30,12,'CPU']]){
  const w=worker({gpuMs,cpuMs});await w.send({type:'init',base:'http://localhost/',role:'full'});
  const image=bitmap();await w.send({type:'frame',bitmap:image,timestamp:1000});const r=w.messages.at(-1);
  assert.equal(r.backend,expected);assert.equal(r.calibration.GPU,gpuMs);assert.equal(r.calibration.CPU,cpuMs);assert.ok(image.closed);
  assert.ok(w.times.every((t,i)=>i===0||t>w.times[i-1]));
 }
});
test('a lost GPU context retries the same frame on CPU',async()=>{
 const w=worker();await w.send({type:'init',base:'http://localhost/',role:'full'});await w.send({type:'frame',bitmap:bitmap(),timestamp:1000});
 w.loseGpu();const image=bitmap();await w.send({type:'frame',bitmap:image,timestamp:1016});assert.equal(w.messages.at(-1).backend,'CPU');assert.ok(image.closed);
});
