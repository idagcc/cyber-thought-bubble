const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const sandbox={exports:{},Math,Set,Map};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/bubblePhysics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
const {stepWorld,intersects,faceObstacle,faceObstacles}=sandbox.exports;
const face=(id,x=.5,y=.4,w=.1,h=.2)=>({id,x,y,w,h,since:0,seen:0,visible:true,ready:true});
const live=world=>world.bodies.filter(b=>b.visible&&!b.retiring);
function assertSafe(world,faces){
 const bodies=live(world),{width,height}=world;
 for(const b of bodies){
  const rendered={...b,x:b.renderX??b.x,y:b.renderY??b.y},owner=faces.find(f=>f.id===b.owner);
  assert.ok(rendered.x>=0&&rendered.y>=0&&rendered.x+b.width<=width+.001&&rendered.y+b.height<=height+.001);
  assert.ok(rendered.y+b.height/2<owner.y*height,'thought stays in the upper part of its owner’s head');
  const measured=owner.measured??owner,headLeft=Math.min(owner.x-owner.w/2,measured.x-measured.w/2)*width,headRight=Math.max(owner.x+owner.w/2,measured.x+measured.w/2)*width;
  const upper=Math.min(owner.y-owner.h*.6,measured.y-measured.h*.6)*height,lower=Math.max(owner.y,measured.y)*height;
  const distance=Math.hypot(Math.max(rendered.x-headRight,0,headLeft-rendered.x-b.width),Math.max(rendered.y-lower,0,upper-rendered.y-b.height));
  assert.ok(distance<=width*.075+1,'thought stays near its owner');
  for(const f of faces)for(const head of faceObstacles(f,width,height))assert.equal(intersects(rendered,head),false,'all supplied heads stay clear');
  for(const other of bodies)if(other!==b)assert.equal(intersects(rendered,{...other,x:other.renderX??other.x,y:other.renderY??other.y}),false,'rendered bubbles never collide');
 }
}
test('a 270px owner movement carries the same thoughts without fading or leaving anchors behind',()=>{
 let world;const start=face(1);
 for(let frame=0;frame<=120;frame++)world=stepWorld(world,[start],1600,900,frame*1000/60);
 const original=live(world).map(b=>({...b}));assert.ok(original.length);
 for(let frame=1;frame<=180;frame++){
  const owner={...start,y:start.y+.3*frame/180};world=stepWorld(world,[owner],1600,900,2000+frame*1000/60);
  assertSafe(world,[owner]);
  for(const b of live(world)){const before=original.find(o=>o.key===b.key);assert.ok(before);assert.equal(b.opacity,1);assert.equal(b.phrase,before.phrase);assert.ok(Math.abs((b.y-before.y)-270*frame/180)<.01,'base position follows every movement frame');assert.ok(Math.abs((b.renderY-before.renderY)-270*frame/180)<8,'float remains bounded around the attached position');}
 }
 assert.equal(live(world).length,original.length);
});
test('six and eight real in-frame owners each retain a nearby primary while the group moves',()=>{
 for(const count of [6,8]){
  let world;
  for(let frame=0;frame<240;frame++){
   const faces=Array.from({length:count},(_,i)=>face(i+1,.12+i*.76/(count-1)+Math.sin(frame/70)*.018,.45+Math.sin(frame/90)*.02,.07,.17));
   world=stepWorld(world,faces,1600,900,frame*1000/60);assertSafe(world,faces);
   for(const owner of faces){const primary=live(world).find(b=>b.key===`${owner.id}:0`);assert.ok(primary,`owner ${owner.id} has a primary at frame ${frame}`);if(frame>90)assert.equal(primary.opacity,1);}
  }
 }
});
test('approaching people keep their primary thought opacity through collision-driven layout changes',()=>{
 let world,revisions=0;
 for(let frame=0;frame<900;frame++){
  const t=Math.max(0,(frame-150)/130),faces=[face(1,.25+.2*Math.sin(t),.42,.14,.27),face(2,.75-.2*Math.sin(t),.42,.14,.27)];
  const previous=world;world=stepWorld(world,faces,1600,900,frame*1000/60);assertSafe(world,faces);
  if(previous&&previous.layoutVersion!==world.layoutVersion)revisions++;
  if(frame>=150)for(const owner of faces){const primary=live(world).find(b=>b.key===`${owner.id}:0`);assert.ok(primary,`owner ${owner.id} remains visible at frame ${frame}`);assert.equal(primary.opacity,1,'layout changes do not restart the reveal');}
 }
 assert.ok(revisions>0,'exercise actual layout changes');
});
test('resizing, reduced motion and prints preserve safe ownership and clear fallback heads',()=>{
 const faces=[face(1,.3,.45,.09,.19),{...face(2,.7,.45,.09,.19),detected:false,presence:1}];let world;
 for(let frame=0;frame<=120;frame++)world=stepWorld(world,faces,1600,900,frame*1000/60);
 for(const [width,height,print] of [[1366,768,false],[1800,1000,true],[900,1600,false]]){
  world=stepWorld(world,faces,width,height,2200,true,print);assertSafe(world,faces);
  for(const owner of faces){const primary=live(world).find(b=>b.key===`${owner.id}:0`);assert.ok(primary);assert.equal(primary.opacity,1);assert.equal(primary.vx,0);assert.equal(primary.vy,0);}
 }
});
test('head prediction near the top edge reflows the primary without hiding it or weakening measured-face clearance',()=>{
 // Compact geometry from the real detector replay: smoothed/predicted head
 // approaches the upper boundary while a fresher measured box is lower/right.
 const before={...face(1,.370384,.183412,.103237,.183622),measured:{x:.442470,y:.297880,w:.104604,h:.185819}};
 const edge={...face(1,.359535,.165152,.103570,.184155),measured:{x:.457813,y:.301438,w:.096875,h:.182797}};
 let world;
 for(let frame=0;frame<=120;frame++)world=stepWorld(world,[before],1600,900,frame*1000/60);
 const original=live(world).find(b=>b.key==='1:0');assert.ok(original);assert.equal(original.opacity,1);
 for(let frame=1;frame<=30;frame++){
  const owner=frame%2?edge:before;world=stepWorld(world,[owner],1600,900,2000+frame*1000/60);
  assertSafe(world,[owner]);
  const primary=live(world).find(b=>b.key===original.key);assert.ok(primary,'primary remains allocated at the top boundary');assert.equal(primary.opacity,1);assert.equal(primary.phrase,original.phrase);
 }
});
test('portrait snapshots and aspect-ratio resizes preserve bubble shape, ownership and current phrase',()=>{
 const owner=face(1);let world;
 for(let frame=0;frame<=120;frame++)world=stepWorld(world,[owner],1600,900,frame*1000/60);
 const original=live(world).find(b=>b.key==='1:0');assert.ok(original);original.phrase=11;
 const originalRatio=original.width/original.height;
 for(const [width,height,print] of [[1200,1320,false],[1200,1320,true],[1800,1000,true]]){
  // Snapshot uses the live world to keep the displayed thought and owner.
  const resized=stepWorld(world,[owner],width,height,2100,true,print);assertSafe(resized,[owner]);
  const primary=live(resized).find(b=>b.key===original.key);assert.ok(primary);
  assert.equal(primary.phrase,11);assert.equal(primary.owner,owner.id);assert.equal(primary.opacity,1);
  assert.ok(Math.abs(primary.width/original.width-width/1600)<1e-9,'bubble uses the output-width scale');
  assert.ok(Math.abs(primary.width/primary.height-originalRatio)<1e-9,'portrait shape is not stretched by the independent scene height scale');
 }
});
test('a stacked eight-person group keeps every primary including the four heads at the top edge',()=>{
 const faces=Array.from({length:8},(_,i)=>face(i+1,(i%4+.5)/4,i<4?.1:.59,.056,.1));let world;
 for(let frame=0;frame<=180;frame++){
  const moved=faces.map(f=>({...f,x:f.x+Math.sin(frame/80)*.002,y:f.y+Math.sin(frame/100)*.002}));
  world=stepWorld(world,moved,1600,900,frame*1000/60);assertSafe(world,moved);
  for(const owner of moved){const primary=live(world).find(b=>b.key===`${owner.id}:0`);assert.ok(primary,`top/bottom owner ${owner.id} retains a primary at frame ${frame}`);if(frame>90)assert.equal(primary.opacity,1);}
 }
});
test('an overfull local head region never allocates extras while primary thoughts are missing',()=>{
 const faces=Array.from({length:8},(_,i)=>face(i+1,.5,.4,.1,.2));
 const bodies=live(stepWorld(undefined,faces,1600,900,0,true));
 assert.ok(bodies.length>0&&bodies.length<faces.length,'exercise insufficient local space');
 assert.ok(bodies.every(b=>b.key.endsWith(':0')),'all available space belongs to primary thoughts');
});
test('quiet thoughts float slowly inside a bounded envelope without changing owner anchors or phase on phrase rotation',()=>{
 const owner=face(1);let world,reference;const samples=new Map();
 for(let frame=0;frame<=720;frame++){
  world=stepWorld(world,[owner],1600,900,frame*1000/60);assertSafe(world,[owner]);
  if(frame===120)reference=live(world).map(b=>({...b}));
  if(frame>120)for(const b of live(world)){
   const first=reference.find(o=>o.key===b.key);assert.equal(b.ax,first.ax);assert.equal(b.ay,first.ay);assert.equal(b.x,first.x);assert.equal(b.y,first.y);assert.equal(b.opacity,1);
   assert.ok(Math.hypot(b.renderX-b.x,b.renderY-b.y)<=4,'floating cannot detach from the owner');
   const previous=samples.get(b.key);if(previous)assert.ok(Math.hypot(b.renderX-previous.x,b.renderY-previous.y)<.08,'float advances gently each frame');
   samples.set(b.key,{x:b.renderX,y:b.renderY,minX:Math.min(previous?.minX??Infinity,b.renderX),maxX:Math.max(previous?.maxX??-Infinity,b.renderX),minY:Math.min(previous?.minY??Infinity,b.renderY),maxY:Math.max(previous?.maxY??-Infinity,b.renderY)});
  }
 }
 for(const sample of samples.values())assert.ok(Math.hypot(sample.maxX-sample.minX,sample.maxY-sample.minY)>2,'visible motion is present while the person is still');
 const previous=live(world).map(b=>({...b}));for(const b of world.bodies)b.phrase+=12;
 world=stepWorld(world,[owner],1600,900,12000);
 for(const b of live(world)){const old=previous.find(o=>o.key===b.key);assert.equal(b.renderX,old.renderX);assert.equal(b.renderY,old.renderY);}
 for(const [reduced,print] of [[true,false],[false,true]]){
  const stopped=stepWorld(world,[owner],1600,900,12100,reduced,print);
  for(const b of live(stopped)){assert.equal(b.renderX,b.x);assert.equal(b.renderY,b.y);assert.equal(b.shapeTime,0);}
 }
});
test('a safe local clearance correction eases into place without a jump or reveal reset',()=>{
 const owner=face(1);let world;
 for(let frame=0;frame<=120;frame++)world=stepWorld(world,[owner],1600,900,frame*1000/60);
 const before=live(world).find(b=>b.key==='1:0'),larger={...owner,w:.115};
 world=stepWorld(world,[larger],1600,900,2016.6666667);assertSafe(world,[larger]);
 const first=live(world).find(b=>b.key===before.key);assert.ok(first);assert.equal(first.opacity,1);
 assert.ok(Math.hypot(first.ax-before.ax,first.ay-before.ay)>10,'exercise a new local target');
 assert.ok(Math.hypot(first.x-before.x,first.y-before.y)<1,'safe current artwork does not snap to its new anchor');
 for(let frame=2;frame<=120;frame++){world=stepWorld(world,[larger],1600,900,2000+frame*1000/60);assertSafe(world,[larger]);assert.equal(live(world).find(b=>b.key===before.key).opacity,1);}
 const settled=live(world).find(b=>b.key===before.key);assert.ok(Math.hypot(settled.x-settled.ax,settled.y-settled.ay)<.01);
});
test('local diagonal recovery keeps a thought on its established side between its head and another thought',()=>{
 const owner=face(1,.5,.5),body=(key,x,y,width,height)=>({key,owner:1,phrase:Number(key.split(':')[1]),x,y,width,height,ax:x,ay:y,vx:0,vy:0,squash:0,opacity:1,visible:true,ownerFace:owner});
 const previous={width:1600,height:900,time:2000,bodies:[body('1:0',480,96,240,150),body('1:1',530,254,160,99.2)]};
 const world=stepWorld(previous,[owner],1600,900,2016.6666667),extra=live(world).find(b=>b.key==='1:1');
 assertSafe(world,[owner]);assert.ok(extra);assert.equal(extra.opacity,1);
 assert.equal(extra.ax,520);assert.equal(extra.ay,262,'both local axes correct without moving to the opposite side');
 assert.ok(Math.hypot(extra.x-530,extra.y-254)<1,'safe artwork eases to the diagonal target');
});
test('thought quantity adapts from four for one visitor to primary-first crowd allocations',()=>{
 const single=[face(1,.5,.5,.12,.3)],pair=[face(1,.25,.5,.12,.3),face(5,.75,.5,.12,.3)];
 let world=stepWorld(undefined,single,1600,900,0,true);assertSafe(world,single);assert.equal(live(world).length,4);
 const primaryPhrase=live(world).find(b=>b.key==='1:0').phrase;
 world=stepWorld(world,pair,1600,900,100,true);assertSafe(world,pair);
 for(const owner of pair){const thoughts=live(world).filter(b=>b.owner===owner.id);assert.ok(thoughts.some(b=>b.key===`${owner.id}:0`));assert.ok(thoughts.length<=3);}
 const crowd=[1,5,6,7].map((id,i)=>face(id,.15+i*.7/3,.45,.07,.17));
 world=stepWorld(world,crowd,1600,900,200,true);assertSafe(world,crowd);
 for(const owner of crowd){const thoughts=live(world).filter(b=>b.owner===owner.id);assert.ok(thoughts.some(b=>b.key===`${owner.id}:0`));assert.ok(thoughts.length<=2);}
 assert.equal(live(world).find(b=>b.key==='1:0').phrase,primaryPhrase);
 assert.equal(new Set(live(world).map(b=>b.phrase)).size,live(world).length,'active thought indices stay distinct');
});
test('a narrow but clear edge slot retains the same primary instead of crossing its owner',()=>{
 const owner=face(1,.8592,.139,.0882,.1568),x=1475.2,y=25,width=120,height=74.4;
 const previous={width:1600,height:900,time:2000,bodies:[{key:'1:0',owner:1,phrase:7,x,y,width,height,ax:x,ay:y,vx:0,vy:0,squash:0,opacity:1,visible:true,ownerFace:owner}]};
 const world=stepWorld(previous,[owner],1600,900,2016.6666667),primary=live(world).find(b=>b.key==='1:0');
 assertSafe(world,[owner]);assert.ok(primary);assert.equal(primary.opacity,1);assert.equal(primary.phrase,7);
 assert.ok(primary.x>1400,'keeps the established right-hand slot with less than preferred clearance');
 assert.ok(Math.hypot(primary.x-x,primary.y-y)<1,'does not teleport across the head');
});
test('a measured-head lead fits the available side width instead of skipping from too big to too small',()=>{
 const owner={...face(1,.787376,.142525,.08593,.152765),measured:{x:.858383,y:.13217,w:.09237,h:.164214}};
 const x=1398.08,y=30.95,width=197.12,height=122.2144;
 const previous={width:1600,height:900,time:2000,bodies:[{key:'1:0',owner:1,phrase:9,x,y,width,height,ax:x,ay:y,vx:0,vy:0,squash:0,opacity:1,visible:true,ownerFace:owner}]};
 const world=stepWorld(previous,[owner],1600,900,2016.6666667),primary=live(world).find(b=>b.key==='1:0');
 assertSafe(world,[owner]);assert.ok(primary);assert.equal(primary.opacity,1);assert.equal(primary.phrase,9);
 assert.ok(primary.x>1400&&primary.width>=120&&primary.width<150,'uses the narrow clear gap on the same side');
});
test('touching the top boundary while easing a long local correction does not snap the other axis',()=>{
 const before=face(1,.7794,.2934,.31735,.56413),owner={...before,y:before.y-.001};
 const previous={width:1600,height:900,time:2000,bodies:[{key:'1:0',owner:1,phrase:3,x:570,y:22.75,width:184,height:114.08,ax:726,ay:22.5,vx:20,vy:0,squash:0,opacity:1,visible:true,ownerFace:before}]};
 let world=stepWorld(previous,[owner],1600,900,2016.6666667),primary=live(world).find(b=>b.key==='1:0');
 assert.ok(primary);assert.equal(primary.opacity,1);assert.ok(primary.ax-primary.x>100,'still needs to ease toward the local head region');
 assert.ok(Math.abs(primary.x-570)<3,'a vertical boundary cannot teleport the horizontal position');
 assert.ok(primary.y>=22.5);assert.equal(intersects(primary,faceObstacle(owner,1600,900)),false);
 for(let frame=2;frame<=120;frame++)world=stepWorld(world,[owner],1600,900,2000+frame*1000/60);
 primary=live(world).find(b=>b.key==='1:0');assert.ok(primary);assert.equal(primary.opacity,1);assert.ok(Math.abs(primary.x-primary.ax)<.1);assertSafe(world,[owner]);
});
test('a close-up head touching the top edge still receives a compact clear thought beside its upper head',()=>{
 const owner=face(1,.5,.04,.4,.7);let world;
 for(let frame=0;frame<120;frame++)world=stepWorld(world,[owner],1600,900,frame*1000/60);
 const primary=live(world).find(b=>b.key==='1:0');assert.ok(primary);assert.equal(primary.opacity,1);
 assert.equal(intersects({...primary,x:primary.renderX,y:primary.renderY},faceObstacle(owner,1600,900)),false);
 assert.ok(primary.renderY+primary.height/2<61,'top-edge side fallback stays in the small upper strip');
});
test('upper-edge margins stay available while an established thought occupies that space',()=>{
 const before=face(1,.5,.17,.1,.2);let world;
 for(let frame=0;frame<=120;frame++)world=stepWorld(world,[before],1600,900,frame*1000/60);
 const original=live(world).find(b=>b.key==='1:0');assert.ok(original);assert.ok(original.y<90);
 const owner={...before,y:.18};world=stepWorld(world,[owner],1600,900,2016.6666667);
 const primary=live(world).find(b=>b.key==='1:0');assert.ok(primary);assert.equal(primary.opacity,1);assertSafe(world,[owner]);
 assert.ok(Math.abs(primary.y-original.y-9)<1,'crossing the margin threshold cannot force a 67px jump');
});

test('a typical solo camera head receives at least three nearby thoughts without size jitter',()=>{
 const owner={...face(1,.496875000001,.319444444448,.09687500538,.17222223179),measured:{x:.496875,y:.319444444444,w:.096875,h:.172222222222}};
 let world=stepWorld(undefined,[owner],1600,900,0),initial=new Map(live(world).map(b=>[b.key,b.width]));
 assert.ok(initial.size>=3,'a solo cluster must not be limited to two oversized thoughts');
 for(let frame=1;frame<=180;frame++){
  const moved={...owner,x:owner.x+Math.sin(frame/30)*.0002};
  world=stepWorld(world,[moved],1600,900,frame*1000/60);assertSafe(world,[moved]);
  assert.ok(live(world).length>=3);
  for(const b of live(world))assert.equal(b.width,initial.get(b.key),'small head noise does not resize established artwork');
 }
});

test('face reacquisition does not fill the empty corridor between inferred and actual heads',()=>{
 const owner={...face(1,.865,.133,.09,.16),measured:{x:.405,y:.512,w:.3,h:.5}};
 const body={key:'1:0',owner:1,phrase:3,x:900,y:90,width:124,height:76.88,ax:1300,ay:90,vx:0,vy:0,squash:0,opacity:1,visible:true,ownerFace:{...owner,measured:undefined}};
 assert.equal(intersects(body,faceObstacle(owner,1600,900)),true,'the old combined envelope incorrectly blocks this corridor');
 for(const head of faceObstacles(owner,1600,900))assert.equal(intersects(body,head),false,'neither head actually occupies this space');
 const world=stepWorld({width:1600,height:900,time:2000,bodies:[body]},[owner],1600,900,2008.4),primary=live(world).find(b=>b.key==='1:0');
 assert.ok(primary);assert.equal(primary.opacity,1);assert.equal(primary.phrase,3);
 assert.ok(Math.hypot(primary.x-body.x,primary.y-body.y)<3,'safe in-transit artwork cannot teleport across the empty corridor');
 for(const head of faceObstacles(owner,1600,900))assert.equal(intersects({...primary,x:primary.renderX,y:primary.renderY},head),false);
});

test('a small head contact keeps the primary attached and retires a remotely targeted extra locally',()=>{
 const before={...face(2,.59425,.304868,.257541,.457851),measured:{x:.603125,y:.305556,w:.3375,h:.6}};
 const owner={...face(2,.599812,.304871,.260409,.462949),measured:{x:.633594,y:.309722,w:.348438,h:.619444}};
 const body=(key,x,y,width,height,ax,ay,vx=0,vy=0)=>({key,owner:2,phrase:Number(key.split(':')[1]),x,y,width,height,ax,ay,vx,vy,squash:0,opacity:1,visible:true,ownerFace:before});
 const first=body('2:0',552.423,92.39,124,76.88,546.05,92.39,-6.411),extra=body('2:1',537.139,169.364,144,89.28,1267.069,90.026,286.313,-31.124);
 const world=stepWorld({width:1600,height:900,time:2000,bodies:[first,extra]},[owner],1600,900,2008.4),after=world.bodies.find(b=>b.key===extra.key),primary=live(world).find(b=>b.key===first.key);
 assert.ok(primary);assert.equal(primary.opacity,1);assert.equal(primary.phrase,first.phrase);
 assert.ok(Math.hypot(primary.x-first.x,primary.y-first.y)<15,'the primary remains attached');
 assert.ok(after?.retiring);assert.ok(after.opacity>0&&after.opacity<1);
 assert.ok(Math.hypot(after.x-extra.x,after.y-extra.y)<15,'a small contact cannot teleport to the distant destination');
 for(const b of live(world))for(const head of faceObstacles(owner,1600,900))assert.equal(intersects({...b,x:b.renderX,y:b.renderY},head),false);
});
