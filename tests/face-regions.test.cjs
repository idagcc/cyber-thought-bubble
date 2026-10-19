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
function worker(results){
 const messages=[],times=[],sizes=[],options=[];let next=0;
 class OffscreenCanvas{constructor(width,height){this.width=width;this.height=height;}getContext(){return {drawImage(){}};}}
 const scope={URL,performance:{now:()=>100},OffscreenCanvas,importScripts(){},self:{postMessage(m){messages.push(m);}},vision:{FilesetResolver:{forVisionTasks:async()=>({})},FaceDetector:{createFromOptions:async(_files,config)=>{options.push(config);return {detectForVideo(canvas,time){times.push(time);sizes.push([canvas.width,canvas.height]);const result=results[next++];if(result instanceof Error)throw result;return {detections:result??[]};}};}}}};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('public/face-regions.js','utf8'),scope);vm.runInContext(fs.readFileSync('public/detector-worker.js','utf8'),scope);
 return {scope,messages,times,sizes,options,send:data=>scope.self.onmessage({data})};
}
test('worker returns full-frame and recovered small faces once, with three ordered passes',async()=>{
 const a=detection(800,150,100,100),b=detection(400,250,80,80),small=detection(180,80,50,50),duplicate=detection(29,250,80,80,.95);
 const w=worker([[a,b],[small],[duplicate]]);await w.send({type:'init',base:'http://localhost/'});
 const bitmap={width:1280,height:720,closed:false,close(){this.closed=true;}};await w.send({type:'frame',bitmap,timestamp:1000});
 const result=w.messages.find(m=>m.type==='result');assert.equal(result.faces.length,3);assert.equal(result.passes,3);assert.equal(result.timestamp,1000);assert.ok(bitmap.closed);
 assert.deepEqual(w.times,[1000,1001,1002]);assert.deepEqual(w.sizes,[[1280,720],[538,475],[538,475]]);assert.equal(w.options[0].minDetectionConfidence,.5);
});
test('worker releases the bitmap when a detail pass fails',async()=>{
 const w=worker([[],new Error('detail inference failed')]);await w.send({type:'init',base:'http://localhost/'});
 const bitmap={width:1280,height:720,closed:false,close(){this.closed=true;}};await w.send({type:'frame',bitmap,timestamp:1000});
 assert.ok(bitmap.closed);assert.equal(w.messages.at(-1).type,'error');assert.match(w.messages.at(-1).message,/detail inference failed/);
});
