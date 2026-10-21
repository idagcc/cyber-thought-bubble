const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const workers=[],pending=[],timers=new Map();let timerId=0;
 class Worker{constructor(){workers.push(this);this.messages=[];this.terminated=false;}postMessage(message){this.messages.push(message);}terminate(){this.terminated=true;}}
 const sandbox={exports:{},Worker,URL,navigator:{hardwareConcurrency:8},performance:{now:()=>10000},document:{baseURI:'http://localhost/'},createImageBitmap:()=>new Promise(resolve=>pending.push(resolve)),setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/detector.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 let error='';const results=[],client=new sandbox.exports.DetectorClient(r=>results.push(r),e=>error=e);
 const send=(worker,data)=>worker.onmessage({data});
 return {client,workers,send,merge:sandbox.exports.mergeDetections,ready:async()=>{for(const worker of workers)send(worker,{type:'ready'});await client.ready;},resolveBitmap:()=>{const bitmap={closed:false,close(){this.closed=true;}};pending.shift()(bitmap);return bitmap;},pending,timers,results,get error(){return error;}};
}
const video={videoWidth:1920,videoHeight:1080};
const result=(timestamp,extra={})=>({type:'result',faces:[],timestamp,ms:5,backend:'GPU',...extra});
test('full view and detail crops run on separate workers without queuing frames',async()=>{
 const s=setup();await s.ready();assert.deepEqual(s.workers.map(w=>w.messages[0].role),['full','detail']);
 const first=s.client.submit(video,100);await s.client.submit(video,101);assert.equal(s.pending.length,2);
 s.resolveBitmap();s.resolveBitmap();await first;
 for(const worker of s.workers)assert.equal(worker.messages.filter(m=>m.type==='frame').length,1);
 s.send(s.workers[0],result(100));const next=s.client.submit(video,116);assert.equal(s.pending.length,1);
 s.resolveBitmap();await next;assert.equal(s.workers[0].messages.filter(m=>m.type==='frame').length,2);s.client.close();
});
test('closing during bitmap creation releases both late frames and terminates every worker',async()=>{
 const s=setup();await s.ready();const frame=s.client.submit(video,100);s.client.close();
 const a=s.resolveBitmap(),b=s.resolveBitmap();await frame;assert.ok(a.closed&&b.closed);
 assert.ok(s.workers.every(w=>w.terminated&&w.messages.length===1));
});
test('stalled detection or bitmap creation stops every worker and reports recovery',async()=>{
 for(const bitmapReady of [false,true]){
  const s=setup();await s.ready();const frame=s.client.submit(video,100);
  if(bitmapReady){s.resolveBitmap();s.resolveBitmap();await frame;}
  [...s.timers.values()][0]();assert.ok(s.workers.every(w=>w.terminated));assert.match(s.error,/stopped responding/);
  if(!bitmapReady){assert.ok(s.resolveBitmap().closed===false);const late=s.resolveBitmap();await frame;assert.ok(late.closed);}
 }
});
test('CPU fallback uses a bounded second full-frame worker and rejects late results',async()=>{
 const s=setup();await s.ready();s.send(s.workers[0],result(100,{backend:'CPU'}));
 assert.equal(s.workers.length,3);assert.equal(s.workers[2].messages[0].delegate,'CPU');s.send(s.workers[2],{type:'ready'});
 const first=s.client.submit(video,116);s.resolveBitmap();s.resolveBitmap();await first;
 const second=s.client.submit(video,132);s.resolveBitmap();await second;
 s.send(s.workers[2],result(132,{backend:'CPU'}));s.send(s.workers[0],result(116,{backend:'CPU'}));
 assert.deepEqual(s.results.map(r=>r.timestamp),[100,132]);assert.equal(s.workers.length,3);s.client.close();
});
test('cached detail observations keep their original age and empty tiles remove old faces',async()=>{
 const s=setup();await s.ready();const face={x:.2,y:.3,w:.08,h:.12,confidence:.9};
 s.send(s.workers[1],result(100,{tile:0,faces:[face]}));s.send(s.workers[0],result(200));
 assert.equal(s.results.at(-1).faces[0].observed,100);
 s.send(s.workers[0],result(351));assert.equal(s.results.at(-1).faces.length,0);
 s.send(s.workers[1],result(360,{tile:0,faces:[face]}));s.send(s.workers[1],result(370,{tile:0,faces:[]}));
 s.send(s.workers[0],result(380));assert.equal(s.results.at(-1).faces.length,0);s.client.close();
});
test('fusion keeps fresh full-view boxes while preserving distinct neighbouring faces',()=>{
 const s=setup(),a={x:.3,y:.3,w:.09,h:.14,confidence:.6,observed:200},old={...a,x:.302,confidence:.99,observed:100},neighbour={...a,x:.38};
 const merged=s.merge([old,a,neighbour]);assert.equal(merged.length,2);assert.ok(merged.includes(a));assert.ok(merged.includes(neighbour));s.client.close();
});
test('startup failure rejects readiness and closes both workers',async()=>{
 const s=setup();s.send(s.workers[0],{type:'error',message:'Model unavailable'});await assert.rejects(s.client.ready,/Model unavailable/);assert.ok(s.workers.every(w=>w.terminated));
});
