const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const sandbox={exports:{},Math,Map,Set};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/bubblePhysics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
const {stepWorld,faceObstacles,intersects}=sandbox.exports;
const face=(id,x=.5,y=.5,w=.12,h=.3)=>({id,x,y,w,h,since:0,seen:0,ready:true,visible:true});
const painted=b=>({...b,x:b.renderX??b.x,y:b.renderY??b.y});
function assertClear(world,faces){
 const visible=world.bodies.filter(b=>b.visible&&(b.opacity??1)>0).map(painted);
 for(let i=0;i<visible.length;i++){
  for(const f of faces)for(const head of faceObstacles(f,world.width,world.height))assert.equal(intersects(visible[i],head),false,'fading artwork still clears every head');
  for(let j=0;j<i;j++)assert.equal(intersects(visible[i],visible[j]),false,'fading artwork never overlaps active thoughts');
 }
}

test('a crowded upper-side slot retires locally instead of sending an opaque extra across its owner',()=>{
 // Geometry from the live movement replay: two compact thoughts are stacked on
 // the left of a large head. Its rising upper-head ceiling removes the second
 // slot, while that extra has a distant target on the opposite side.
 const measured={x:.63359375,y:.30972222222222223,w:.3484375,h:.6194444444444445};
 const before={...face(2,.6575256943673973,.30659502971029634,.2825402548753737,.5022937864451089),measured};
 const after={...before,x:.6650462831475237,y:.3067593673187939,w:.2848758894601362,h:.5064460257069089};
 const body=(slot,x,y,width,height,ax=x,ay=y)=>({key:`2:${slot}`,owner:2,phrase:slot,x,y,width,height,ax,ay,renderX:x,renderY:y,vx:0,vy:0,squash:0,opacity:1,visible:true,ownerFace:before});
 const primary=body(0,610.999,93.94414203584473,124,76.88,595);
 const extra=body(1,614.999,170.82514203584472,120,74.4,1359.3646578660914,90.15678954916217);
 const world={width:1600,height:900,time:94275.7,bodies:[primary,extra,body(2,1400.4539898471305,165.86414203584474,128,79.36)]};
 const next=stepWorld(world,[after],1600,900,94284);
 const kept=next.bodies.find(b=>b.key===primary.key),retiring=next.bodies.find(b=>b.key===extra.key);
 assert.ok(kept?.visible&&!kept.retiring,'the primary remains attached and visible');
 assert.equal(kept.opacity,1);assert.equal(kept.phrase,primary.phrase);
 assert.ok(retiring?.retiring,'an optional slot with only a remote replacement fades locally');
 assert.ok(retiring.opacity>0&&retiring.opacity<1,'retirement starts from the current reveal opacity');
 assert.equal(retiring.phrase,extra.phrase);
 assert.ok(Math.hypot(painted(retiring).x-extra.x,painted(retiring).y-extra.y)<20,'no opaque jump to the opposite side');
 assertClear(next,[after]);
});

test('a fading extra follows an active owner on each frame and holds its pose after that owner leaves',()=>{
 const original=face(1);let world;
 for(let frame=0;frame<=120;frame++)world=stepWorld(world,[original],1600,900,frame*1000/60);
 const fourth=world.bodies.find(b=>b.key==='1:3'&&!b.retiring);
 assert.ok(fourth&&fourth.opacity===1,'the initial solo scene has a fully visible fourth thought');
 const start=painted(fourth);let previous= fourth;
 for(let frame=1;frame<=5;frame++){
  const owner={...original,x:original.x+.003*frame,y:original.y+.002*frame};
  const faces=[owner,face(5,.86,.5,.08,.2)];
  world=stepWorld(world,faces,1600,900,2000+frame*1000/60);
  const fading=world.bodies.find(b=>b.key===fourth.key);
  assert.ok(fading?.retiring,'two visitors reduce the maximum to three thoughts each');
  assert.ok(Math.abs(painted(fading).x-start.x-.003*frame*1600)<.001,'retirement follows horizontal owner motion');
  assert.ok(Math.abs(painted(fading).y-start.y-.002*frame*900)<.001,'retirement follows vertical owner motion');
  assert.ok(fading.opacity<previous.opacity&&fading.opacity>0,'retirement opacity decreases without restarting');
  assert.equal(fading.phrase,fourth.phrase);assertClear(world,faces);previous=fading;
 }
 const held=painted(previous),remaining=face(5,.86,.5,.08,.2);
 world=stepWorld(world,[remaining],1600,900,2100);
 const departed=world.bodies.find(b=>b.key===fourth.key);
 assert.ok(departed?.retiring);assert.equal(painted(departed).x,held.x);assert.equal(painted(departed).y,held.y);
 assert.ok(departed.opacity<previous.opacity);assertClear(world,[remaining]);
});
