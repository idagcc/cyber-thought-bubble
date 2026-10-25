const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const fs=require('node:fs');const vm=require('node:vm');
function load(file){const sandbox={exports:{},Math,Set,Map};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);return sandbox.exports;}
const {matchFaces,displayTracks,centreCandidate,captureTrackSafe,captureGroupReady}=load('src/faceTracking.ts'),{stepWorld,intersects}=load('src/bubblePhysics.ts');
test('multiple faces retain IDs and activation through brief losses, then reset after a departure',()=>{
 let id=0;const next=()=>++id,a={x:.3,y:.4,w:.1,h:.2},b={...a,x:.6};
 let tracks=matchFaces([],[a,b],0,next);for(let now=100;now<=2100;now+=100)tracks=matchFaces(tracks,[b,a],now,next);
 assert.equal(tracks[0].id,2);assert.equal(tracks[1].id,1);assert.ok(tracks.every(t=>t.ready));
 tracks=matchFaces(tracks,[a],2200,next);assert.equal(tracks.find(t=>t.id===2).ready,true);assert.equal(tracks.find(t=>t.id===2).detected,false);
 tracks=matchFaces(tracks,[a,b],2300,next);assert.equal(tracks.find(t=>t.id===2).since,0);assert.equal(tracks.find(t=>t.id===2).ready,true);
 tracks=matchFaces(tracks,[a],4200,next);assert.equal(tracks.find(t=>t.id===2).visible,false);
 tracks=matchFaces(tracks,[a,b],4300,next);assert.equal(tracks.find(t=>t.id===2).since,4300);assert.equal(tracks.find(t=>t.id===2).ready,false);
});
test('centre selection ignores bystanders at edges and resists small score changes',()=>{
 const faces=[{x:.49,y:.4,w:.1,id:1,visible:true},{x:.54,y:.4,w:.1,id:2,visible:true},{x:.1,y:.4,w:.2,id:3,visible:true}];
 assert.equal(centreCandidate(faces,null).id,1);faces[0].x=.53;faces[1].x=.5;assert.equal(centreCandidate(faces,1).id,1);
 faces[0].visible=false;assert.equal(centreCandidate(faces,1).id,2);
});
test('capture never substitutes another person after loss or an ambiguous crossing',()=>{
 const person={x:.5,y:.4,w:.1,h:.2,id:1,visible:true,ready:true};
 assert.equal(captureTrackSafe([person,{...person,id:2,x:.8}],1),true);
 assert.equal(captureTrackSafe([{...person,visible:false},{...person,id:2}],1),false);
 assert.equal(captureTrackSafe([person,{...person,id:2,x:.55}],1),false);
});
test('moving crowds, collisions, resizes and long pauses never paint intersecting thoughts',()=>{
 let world;
 for(let frame=0;frame<240;frame++){
  const width=frame<120?1600:1366,height=frame<120?900:768;
  const people=frame<180?4:8;
  const faces=Array.from({length:people},(_,i)=>({x:.12+i*.76/(people-1)+Math.sin(frame/22+i)*.015,y:.45,w:.075,h:.2,id:i+1,since:0,seen:0,visible:true,ready:true}));
  assert.ok(faces.every(f=>f.x-f.w/2>0&&f.x+f.w/2<1),'every person is actually inside the camera');
  world=stepWorld(world,faces,width,height,frame*40+(frame>210?60000:0));
  const visible=world.bodies.filter(b=>b.visible).map(b=>({...b,x:b.renderX??b.x,y:b.renderY??b.y}));
  for(const face of faces)assert.ok(visible.some(b=>b.key===`${face.id}:0`),'each person keeps a primary thought in this feasible group');
  for(let i=0;i<visible.length;i++){
   const b=visible[i];assert.ok(Number.isFinite(b.x)&&b.x>=0&&b.x+b.width<=width&&b.y>=height*.1&&b.y+b.height<=height*.89+1e-8);
   for(let j=0;j<i;j++)assert.equal(intersects(b,visible[j]),false);
   for(const f of faces)assert.equal(intersects(b,{x:(f.x-f.w*.65)*width,y:(f.y-f.h*.8)*height,width:f.w*width*1.3,height:f.h*height*1.46}),false);
   if(!b.retiring){
    const owner=faces.find(f=>f.id===b.owner);
    const dx=Math.max((owner.x-owner.w/2)*width-b.x-b.width,b.x-(owner.x+owner.w/2)*width,0),dy=Math.max((owner.y-owner.h/2)*height-b.y-b.height,b.y-(owner.y+owner.h/2)*height,0);
    assert.ok(Math.hypot(dx,dy)<=width*.08,'a thought stays within a short gap of its own head');
    assert.ok(b.y+b.height/2<=(owner.y-owner.h*.15)*height+.01,'thoughts stay above the facial centre');
   }
  }
 }
});
test('reduced motion and print layouts keep a primary thought with only local optional extras',()=>{
 const faces=[{x:.5,y:.4,w:.1,h:.26,id:1,since:0,seen:0,visible:true,ready:true}];
 for(const [w,h,print] of [[1600,900,false],[1800,820,true],[900,1600,false]]){
  const world=stepWorld(undefined,faces,w,h,2000,true,print),visible=world.bodies.filter(b=>b.visible);
  assert.ok(visible.some(b=>b.key==='1:0'));assert.ok(visible.length>=1&&visible.length<=4);
  for(const b of world.bodies){assert.equal(b.vx,0);assert.equal(b.squash,0);}
 }
});
function thought(x,y,vx,vy,width=100,height=70){return {x,y,width,height,key:String(x),owner:1,phrase:0,vx,vy,ax:x,ay:y,squash:0,squashVelocity:0,visible:true};}
const {resolveContact}=load('src/bubblePhysics.ts');
test('cloud collisions share momentum and rebound while both shells yield',()=>{
 const a=thought(0,0,60,0),b=thought(98,0,-20,0),momentum=a.vx+b.vx;
 resolveContact(a,b);
 assert.ok(b.vx>a.vx,'clouds separate after contact');
 assert.ok(Math.abs(a.vx+b.vx-momentum)<1e-9,'momentum is conserved');
 assert.ok(Math.abs((b.vx-a.vx)/80-.16)<1e-9,'bounce loses energy');
 assert.ok(a.squashVelocity>0&&b.squashVelocity>0,'both shells compress horizontally');
 assert.equal(intersects(a,b),false);
 // A second positional pass must not add another impulse to separating clouds.
 const velocity=a.vx;resolveContact(a,b);assert.equal(a.vx,velocity);
});
test('vertical and unequal-size contacts retain momentum and reduced motion has no bounce',()=>{
 const a=thought(0,0,0,45,140,80),b=thought(0,78,0,-15,90,60),ma=a.width*a.height,mb=b.width*b.height,p=ma*a.vy+mb*b.vy;
 resolveContact(a,b);
 assert.ok(Math.abs(ma*a.vy+mb*b.vy-p)<1e-7);assert.ok(a.squashVelocity<0&&b.squashVelocity<0);
 const c=thought(0,0,0,0),d=thought(95,0,0,0);resolveContact(c,d,0,false);
 assert.equal(c.squashVelocity,0);assert.equal(d.squashVelocity,0);assert.equal(intersects(c,d),false);
});
test('tracking corrections do not make thought shells bounce or deform',()=>{
 const faces=[{x:.5,y:.4,w:.1,h:.26,id:1,since:0,seen:0,visible:true,ready:true}];
 let world=stepWorld(undefined,faces,1600,900,2000,true);world.bodies[0].squash=.1;
 for(let frame=1;frame<=120;frame++){
  world=stepWorld(world,faces,1600,900,2000+frame*1000/120);
  assert.ok(world.bodies.every(b=>b.squash===0&&b.squashVelocity===0),'a prior collision cannot keep exciting the thought artwork');
 }
 const settled=stepWorld(world,faces,1600,900,4000,true);
 assert.ok(settled.bodies.every(b=>b.squash===0&&b.squashVelocity===0&&b.shapeTime===0));
});

test('group capture accepts settled people across the frame and recovers after movement',()=>{
 const person={x:.17,y:.4,w:.1,h:.2,id:1,visible:true,ready:true};
 assert.equal(captureGroupReady([person,{...person,id:2,x:.82}]),true);
 assert.equal(captureGroupReady([{...person,visible:false}]),false);
 assert.equal(captureGroupReady([{...person,ready:false}]),false);
 assert.equal(captureGroupReady([{...person,x:.02}]),false);
 assert.equal(captureGroupReady([{...person,id:7,x:.82}]),true,'a new tracking ID may join the shared photo');
});
test('three and four people each keep their own thought on the wall and landscape print',()=>{
 for(const people of [3,4])for(const [width,height,print] of [[1600,900,false],[1950,1167,false],[1800,820,true]]){
  const faces=Array.from({length:people},(_,i)=>({x:.15+i*.7/(people-1),y:.45,w:.09,h:.2,id:i+1,since:0,seen:2500,visible:true,ready:true}));
  const world=stepWorld(undefined,faces,width,height,2500,true,print),owners=new Set(world.bodies.filter(b=>b.visible).map(b=>b.owner));
  assert.equal(owners.size,people,`${people} people at ${width}×${height} each receive a thought`);
  for(const face of faces)assert.ok(owners.has(face.id));
 }
});

test('animated three-to-four-person transitions keep every allocated thought visible',()=>{
 const fixture=[.623,.120,.369,.881].map((x,i)=>({x,y:.28,w:.072,h:.128,id:i+1,since:0,seen:2500,visible:true,ready:true}));
 let world;
 for(let frame=0;frame<300;frame++){
  const faces=frame<60?fixture.slice(0,3):fixture;
  world=stepWorld(world,faces,1600,900,2500+frame*1000/60);
  const visible=world.bodies.filter(b=>b.visible),owners=new Set(visible.map(b=>b.owner));
  assert.equal(owners.size,faces.length,`all ${faces.length} people retain a visible thought at frame ${frame}`);
  for(let i=0;i<visible.length;i++){
   for(let j=0;j<i;j++)assert.equal(intersects(visible[i],visible[j]),false);
   for(const f of faces)assert.equal(intersects(visible[i],{x:(f.x-f.w*.65)*1600,y:(f.y-f.h*.66)*900,width:f.w*1600*1.3,height:f.h*900*1.32}),false);
  }
 }
});

test('detection gaps preserve visible thoughts but never authorize stale capture',()=>{
 let id=0,tracks=[],face={x:.5,y:.4,w:.1,h:.2};
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[face],now,()=>++id);
 const first=stepWorld(undefined,displayTracks(tracks,2200),1600,900,2200,true);
 tracks=matchFaces(tracks,[],2300,()=>++id);
 const held=displayTracks(tracks,2450),world=stepWorld(first,held,1600,900,2450,true);
 assert.equal(held.length,1);assert.ok(first.bodies.some(b=>b.key==='1:0'));
 assert.deepEqual(world.bodies.map(b=>[b.key,b.phrase]),first.bodies.map(b=>[b.key,b.phrase]),'a brief gap preserves each allocated thought and its content');assert.equal(world.layoutVersion,first.layoutVersion);
 assert.equal(captureGroupReady(held,2450),false);assert.equal(displayTracks(tracks,4100).length,0);
 assert.equal(captureGroupReady([{...face,id:1,since:0,seen:2200,ready:true,visible:true}],2600),false);
 assert.equal(captureGroupReady([{...face,id:1,since:0,seen:2500,observed:2100,ready:true,visible:true}],2600),false,'receipt time cannot make an old source frame fresh');
});
test('detector jitter preserves local head offsets without slot hopping',()=>{
 const face={x:.5,y:.4,w:.1,h:.2,id:1,since:0,seen:2200,ready:true,visible:true};
 let world=stepWorld(undefined,[face],1600,900,2200),offsets=new Map(world.bodies.map(b=>[b.key,[b.ax-face.x*1600,b.ay-face.y*900]]));
 for(let frame=1;frame<=600;frame++){
  const jitter={...face,x:face.x+Math.sin(frame)*.0015,y:face.y+Math.cos(frame)*.0015};
  const next=stepWorld(world,[jitter],1600,900,2200+frame*1000/60);
  assert.equal(next.layoutVersion,1);
  for(const b of next.bodies){
   const old=world.bodies.find(a=>a.key===b.key),offset=offsets.get(b.key);
   assert.ok(Math.hypot(b.ax-jitter.x*1600-offset[0],b.ay-jitter.y*900-offset[1])<.01,'the same thought stays at the same local head offset');
   assert.ok(Math.hypot(b.x-old.x,b.y-old.y)<3,'small detector motion cannot teleport a thought');assert.equal(b.visible,true);
  }
  world=next;
 }
});
test('thoughts reveal gradually for a full second without changing their anchors',()=>{
 const faces=[{x:.5,y:.4,w:.1,h:.2,id:1,since:0,seen:2200,ready:true,visible:true}];
 let world=stepWorld(undefined,faces,1600,900,2200);
 const anchors=world.bodies.map(b=>[b.ax,b.ay]),samples=[];
 for(let frame=1;frame<=72;frame++){
  const next=stepWorld(world,faces,1600,900,2200+frame*1000/60);
  assert.deepEqual(next.bodies.map(b=>[b.ax,b.ay]),anchors);
  next.bodies.forEach((b,i)=>{assert.ok(b.opacity>=world.bodies[i].opacity);assert.ok(b.opacity-world.bodies[i].opacity<.016);});
  if(frame===30)samples.push(next.bodies[0].opacity);
  world=next;
 }
 assert.ok(samples[0]>.4&&samples[0]<.5);assert.equal(world.bodies[0].opacity,1);
});
test('interpolation advances between detector frames and measured boxes remain available',()=>{
 let id=0,tracks=matchFaces([],[{x:.5,y:.4,w:.1,h:.2}],0,()=>++id);
 tracks=matchFaces(tracks,[{x:.55,y:.4,w:.11,h:.2}],100,()=>++id);
 const start=displayTracks(tracks,100)[0],middle=displayTracks(tracks,132)[0],end=displayTracks(tracks,164)[0];
 assert.equal(start.x,.5);assert.ok(start.x<middle.x&&middle.x<end.x&&end.x<.55);assert.equal(end.measured.x,.55);assert.equal(end.id,1);
});
test('quiet physics remains consistent across 30, 60 and 120 Hz and tab suspension',()=>{
 const faces=[{x:.5,y:.4,w:.1,h:.2,id:1,since:0,seen:0,ready:true,visible:true}],results=[];
 for(const hz of [30,60,120]){
  let world=stepWorld(undefined,faces,1600,900,0);
  for(let frame=1;frame<=hz*3;frame++)world=stepWorld(world,faces,1600,900,frame*1000/hz);
  results.push(world);
 }
 for(const world of results)for(let i=0;i<world.bodies.length;i++)assert.ok(Math.hypot(world.bodies[i].x-results[0].bodies[i].x,world.bodies[i].y-results[0].bodies[i].y)<.2);
 const suspended=stepWorld(results[0],faces,1600,900,90000);
 for(let i=0;i<suspended.bodies.length;i++)assert.ok(Math.hypot(suspended.bodies[i].x-results[0].bodies[i].x,suspended.bodies[i].y-results[0].bodies[i].y)<3);
});

test('12 Hz tracking keeps visible moving thoughts continuous and measured faces clear',()=>{
 let tracks=[],world,id=0,samples=0,maxStep=0;
 for(let frame=0;frame<1200;frame++){
  const now=frame*1000/60;
  if(frame%5===0)tracks=matchFaces(tracks,[{x:.5+Math.sin(frame/180)*.18,y:.4+Math.sin(frame/230)*.10,w:.1,h:.2}],now,()=>++id);
  const faces=displayTracks(tracks,now),next=stepWorld(world,faces,1600,900,now);
  for(const b of next.bodies){
   const old=world?.bodies.find(o=>o.key===b.key);
   if(b.visible)for(const f of faces){const m=f.measured;assert.equal(intersects(b,{x:(m.x-m.w/2)*1600,y:(m.y-m.h/2)*900,width:m.w*1600,height:m.h*900}),false);}
   if(old&&old.opacity>.8&&b.opacity>.8){maxStep=Math.max(maxStep,Math.hypot(b.renderX-old.renderX,b.renderY-old.renderY));samples++;}
  }
  world=next;
 }
 assert.ok(samples>1500);assert.ok(maxStep<5,`no tracking jumps: largest visible step ${maxStep}px`);
});
test('thoughts follow their owner on every 144 and 165 Hz display refresh',()=>{
 for(const hz of [144,165]){
  const face={x:.5,y:.4,w:.1,h:.2,id:1,since:0,seen:0,ready:true,visible:true};
  let world=stepWorld(undefined,[face],1600,900,0);const first=world.bodies[0],offsetX=first.x-face.x*1600,offsetY=first.y-face.y*900;
  for(let frame=1;frame<=18;frame++){
   const moved={...face,x:face.x+frame*.00025},next=stepWorld(world,[moved],1600,900,frame*1000/hz),a=world.bodies[0],b=next.bodies[0];
   assert.equal(b.key,first.key);assert.equal(b.phrase,first.phrase);assert.ok(b.visible);
   assert.ok(b.renderX-a.renderX>0&&b.renderX-a.renderX<1,'each refresh follows the small owner movement smoothly');
   assert.ok(Math.abs(b.x-moved.x*1600-offsetX)<.01&&Math.abs(b.y-moved.y*900-offsetY)<.01,'the underlying body follows its owner without accumulating separation');
   assert.ok(Math.hypot(b.renderX-b.x,b.renderY-b.y)<=4,'decorative float remains a small render offset from the attached body');
   world=next;
  }
 }
});

test('cached crop results never refresh observation time, activation or stale capture',()=>{
 let id=0;const next=()=>++id,face={x:.5,y:.4,w:.1,h:.2,observed:100};
 let tracks=matchFaces([],[face],100,next);
 for(let now=150;now<2200;now+=50)tracks=matchFaces(tracks,[face],now,next);
 assert.equal(tracks[0].seen,100);assert.equal(tracks[0].ready,false);assert.equal(tracks[0].visible,false);assert.equal(captureGroupReady(tracks,2200),false);
 tracks=matchFaces(tracks,[{...face,observed:2200}],2200,next);assert.equal(tracks[0].since,2200);assert.equal(tracks[0].ready,false);
});

test('groups prioritize one local primary thought per person before optional extras',()=>{
 for(const people of [3,4,8])for(const [width,height,print]of[[1600,900,false],[1800,820,true]]){
  const faces=Array.from({length:people},(_,i)=>({x:.12+i*.76/(people-1),y:.45,w:.07,h:.17,id:i+1,since:0,seen:2500,ready:true,visible:true}));
  const world=stepWorld(undefined,faces,width,height,2500,true,print),visible=world.bodies.filter(b=>b.visible);
  for(const face of faces){const owned=visible.filter(b=>b.owner===face.id);assert.ok(owned.length>0&&owned.length<=2);assert.ok(owned.some(b=>b.key===`${face.id}:0`));}
  for(let i=0;i<visible.length;i++)for(let j=0;j<i;j++)assert.equal(intersects(visible[i],visible[j]),false);
 }
});

test('a one-second look away keeps the same thoughts and returns without reactivation',()=>{
 let id=0,tracks=[],world,layoutVersion;const face={x:.76,y:.4,w:.1,h:.2},next=()=>++id;
 for(let now=0;now<=5000;now+=20){
  if(now%100===0)tracks=matchFaces(tracks,now>3500&&now<4600?[]:[face],now,next);
  world=stepWorld(world,displayTracks(tracks,now),1600,900,now);
  if(now===3500)layoutVersion=world.layoutVersion;
  if(now>=3500){
   assert.ok(world.bodies.length>0);assert.ok(world.bodies.every(b=>b.opacity===1));
   assert.equal(tracks[0].id,1);assert.equal(tracks[0].ready,true);
   if(now>=3600&&now<4600)assert.equal(captureGroupReady(displayTracks(tracks,now),now),false);
  }
 }
 assert.equal(world.layoutVersion,layoutVersion);assert.equal(id,1);
});

test('a departed face holds for 1.2 seconds then fades; reacquisition reverses smoothly',()=>{
 for(const returning of [false,true]){
  let id=0,tracks=[],world,previousOpacity=0;const next=()=>++id,face={x:.5,y:.4,w:.1,h:.2};
  for(let now=0;now<=6500;now+=20){
   if(now%100===0)tracks=matchFaces(tracks,now<=3500||(returning&&now>=5000)?[face]:[],now,next);
   const old=world;world=stepWorld(world,displayTracks(tracks,now),1600,900,now);
   if(now>=3500&&now<=4700)assert.ok(world.bodies.every(b=>b.opacity===1));
   if(now>4700&&now<5000){
    assert.ok(world.bodies.length>0);assert.ok(world.bodies[0].opacity<previousOpacity);
    assert.ok(previousOpacity-world.bodies[0].opacity<.04);
   }
   if(returning&&now>=5000){
    assert.equal(tracks[0].id,1);assert.ok(tracks[0].ready);
    assert.ok(world.bodies[0].opacity>=previousOpacity);assert.ok(world.bodies[0].opacity-previousOpacity<.02);
    assert.equal(world.layoutVersion,old.layoutVersion);
   }
   previousOpacity=world.bodies[0]?.opacity??0;
  }
  if(returning)assert.equal(world.bodies[0].opacity,1);else assert.equal(world.bodies.length,0);
 }
});

test('leaving the visible crop fades the existing artwork at its last rendered position',()=>{
 const face={x:.5,y:.4,w:.1,h:.2,id:1,since:0,seen:0,ready:true,visible:true};let world;
 for(let now=0;now<=1500;now+=20)world=stepWorld(world,[face],1600,900,now);
 const original=world.bodies.map(b=>({key:b.key,x:b.renderX,y:b.renderY}));
 for(let now=1520;now<=2200;now+=20){
  const old=world;world=stepWorld(world,[],1600,900,now);
  for(const b of world.bodies){
   const anchor=original.find(a=>a.key===b.key);assert.equal(b.renderX,anchor.x);assert.equal(b.renderY,anchor.y);
   assert.equal(b.ownerFace.id,1);assert.ok(b.opacity<old.bodies.find(a=>a.key===b.key).opacity);assert.equal(b.visible,true);
  }
 }
 assert.equal(world.bodies.length,0);
});

test('off-centre head turns preserve thought identity and a stable side of the head',()=>{
 for(const x of [.14,.5,.86]){
  let tracks=[],world,id=0,offsets,maxStep=0;
  for(let frame=0;frame<600;frame++){
   const now=frame*1000/60;
   if(frame%5===0)tracks=matchFaces(tracks,[{x:x+Math.sin(frame/8)*.008,y:.4+Math.cos(frame/9)*.005,w:.1+Math.sin(frame/7)*.016,h:.2+Math.cos(frame/7)*.008}],now,()=>++id);
   const old=world,faces=displayTracks(tracks,now);world=stepWorld(world,faces,1600,900,now);
   if(frame===220)offsets=new Map(world.bodies.map(b=>[b.key,{x:b.ax-faces[0].x*1600,y:b.ay-faces[0].y*900,phrase:b.phrase,width:b.width}]));
   if(frame>220){
    assert.equal(world.bodies.length,offsets.size);
    for(const b of world.bodies){
     const before=old.bodies.find(a=>a.key===b.key),offset=offsets.get(b.key),dx=b.ax-faces[0].x*1600,dy=b.ay-faces[0].y*900;
     assert.ok(offset,'each original thought keeps its owner and slot');assert.equal(b.phrase,offset.phrase);
     assert.ok(Math.hypot(dx-offset.x,dy-offset.y)<32,'head-box changes only make small local placement adjustments');
     const side=distance=>Math.abs(distance)<1?0:Math.sign(distance);
     assert.equal(side(dx+b.width/2),side(offset.x+offset.width/2),'a thought keeps its side of the head');
     assert.equal(b.opacity,1);assert.ok(b.visible);maxStep=Math.max(maxStep,Math.hypot(b.renderX-before.renderX,b.renderY-before.renderY));
    }
   }
  }
  assert.ok(maxStep<3,`small head turns stay calm at x=${x}: ${maxStep}px`);
 }
});

test('print thoughts are fully opaque and contain no departing owners',()=>{
 const face={x:.5,y:.4,w:.1,h:.2,id:1,since:0,seen:0,ready:true,visible:true,presence:.3};
 const printed=stepWorld(undefined,[face],1800,820,4000,true,true);
 assert.ok(printed.bodies.length);assert.ok(printed.bodies.every(b=>b.opacity===1&&!b.retiring));
 assert.equal(stepWorld(printed,[],1800,820,4020,true,true).bodies.length,0);
});
