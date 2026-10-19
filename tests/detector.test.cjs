const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 let worker,pendingBitmap;const timers=new Map();let timerId=0;
 class Worker{constructor(){worker=this;this.messages=[];this.terminated=false;}postMessage(message){this.messages.push(message);}terminate(){this.terminated=true;}}
 const sandbox={exports:{},Worker,URL,document:{baseURI:'http://localhost/'},createImageBitmap:()=>new Promise(resolve=>{pendingBitmap=resolve;}),setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/detector.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 let error='';const results=[];const client=new sandbox.exports.DetectorClient(r=>results.push(r),e=>error=e);
 return {client,get worker(){return worker;},resolveBitmap:()=>{const bitmap={closed:false,close(){this.closed=true;}};pendingBitmap(bitmap);return bitmap;},timers,results,get error(){return error;}};
}
test('detector transfers only one frame at a time and resumes after a result',async()=>{
 const s=setup();s.worker.onmessage({data:{type:'ready'}});await s.client.ready;
 const first=s.client.submit({videoWidth:1920,videoHeight:1080},100);await s.client.submit({videoWidth:1920},101);
 s.resolveBitmap();await first;assert.equal(s.worker.messages.filter(m=>m.type==='frame').length,1);
 s.worker.onmessage({data:{type:'result',faces:[],timestamp:100,ms:15}});
 const next=s.client.submit({videoWidth:1920,videoHeight:1080},200);s.resolveBitmap();await next;assert.equal(s.worker.messages.filter(m=>m.type==='frame').length,2);s.client.close();
});
test('closing during bitmap creation releases the frame instead of posting to a dead worker',async()=>{
 const s=setup();s.worker.onmessage({data:{type:'ready'}});await s.client.ready;const frame=s.client.submit({videoWidth:1280,videoHeight:720},100);
 s.client.close();const bitmap=s.resolveBitmap();await frame;assert.equal(bitmap.closed,true);assert.equal(s.worker.messages.length,1);assert.ok(s.worker.terminated);
});
test('stalled detection terminates and reports an actionable error',async()=>{
 const s=setup();s.worker.onmessage({data:{type:'ready'}});await s.client.ready;const frame=s.client.submit({videoWidth:1280,videoHeight:720},100);s.resolveBitmap();await frame;
 [...s.timers.values()][0]();assert.ok(s.worker.terminated);assert.match(s.error,/stopped responding/);
});
test('a stalled camera bitmap times out too, and a late bitmap is released',async()=>{
 const s=setup();s.worker.onmessage({data:{type:'ready'}});await s.client.ready;const frame=s.client.submit({videoWidth:1280,videoHeight:720},100);
 [...s.timers.values()][0]();const bitmap=s.resolveBitmap();await frame;assert.ok(s.worker.terminated);assert.equal(bitmap.closed,true);assert.match(s.error,/stopped responding/);
});
