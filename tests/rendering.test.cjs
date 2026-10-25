const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
function renderer({icons=false}={}){
 const paints=[],draws=[],glassTimes=[],listeners={};
 const layout={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/layout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,layout);
 const physics={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/bubblePhysics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,physics);
 function context(){const stack=[];return {font:'',clipBounds:null,save(){stack.push(this.clipBounds);},restore(){this.clipBounds=stack.pop();},translate(){},scale(){},beginPath(){},rect(x,y,width,height){this.pendingClip={x,y,width,height};},clip(){this.clipBounds=this.pendingClip;},measureText(text){return {width:text.length*(parseFloat(this.font.split(' ')[1])||20)*.55};},fillText(text,x,y){paints.push({text,x,y,size:parseFloat(this.font.split(' ')[1]),width:this.measureText(text).width,clip:this.clipBounds,direction:this.direction});},drawImage(image,...bounds){draws.push({image,bounds});}};}
 const sandbox={exports:{},performance:{now:()=>5000},document:{fonts:{addEventListener(event,fn){listeners[event]=fn;}},createElement(){return {kind:'label',getContext:context};}},require(name){if(name==='./bubbleArtwork')return {glassArtwork:()=>({kind:'shell'}),drawGlassArtwork(ctx,variant,x,y,width,height,time){glassTimes.push(time);ctx.drawImage({kind:'shell'},x,y,width,height);},prepareGlassArtwork(){}};if(name==='./bubblePhysics')return physics.exports;if(name==='./layout')return layout.exports;if(name==='./carnival')return {carnivalArtwork:icons?{cloud:{kind:'icon',naturalWidth:100,naturalHeight:100}}:{}};return {};}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/photo.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 const face={x:.5,y:.4,w:.1,h:.2,id:1,since:0,seen:5000,ready:true,visible:true},body={x:100,y:100,width:400,height:240,key:'1:0',owner:1,phrase:0,vx:0,vy:0,ax:100,ay:100,squash:0,visible:true,opacity:1};
 return {draw:(lang='en',text='Keep your information safe.',x=100,shapeTime=0,density=2,departed=false)=>sandbox.exports.drawThoughts(context(),[{...body,x,shapeTime,ownerFace:face,opacity:departed?.5:1}],departed?[]:[face],[{en:text,ar:'أحافظ على معلوماتي'}],lang,1600,900,undefined,density),drawSized:(text,lang,width,height)=>sandbox.exports.drawThoughts(context(),[{...body,width,height,ownerFace:face}],[face],[{en:text,ar:text}],lang,1600,900),tailFrames:sandbox.exports.thoughtTailFrames,physics:physics.exports,paints,draws,glassTimes,listeners};
}
test('moving bubble letters reuse one fixed-origin raster instead of being hinted every frame',()=>{
 const r=renderer();r.draw();const initial=r.paints.length;assert.ok(initial>0);
 const firstLabel=r.draws.find(d=>d.image.kind==='label').image;
 for(let frame=1;frame<=120;frame++)r.draw('en','Keep your information safe.',100+frame/12,frame/60);
 assert.equal(r.paints.length,initial,'no letter is rerasterized during movement');
 const labels=r.draws.filter(d=>d.image.kind==='label');assert.equal(labels.length,121);assert.ok(labels.every(d=>d.image===firstLabel));
 assert.equal(labels.at(-1).bounds[0]-labels[0].bounds[0],10,'the complete text layer follows the bubble continuously');
 assert.equal(r.glassTimes.at(-1),2,'the glass animates while the text raster stays fixed');
});
test('phrase, language and loaded fonts refresh text without reusing stale lettering',()=>{
 const r=renderer();r.draw();const initial=r.paints.length;r.draw();assert.equal(r.paints.length,initial);
 r.draw('en','A different thought.');assert.ok(r.paints.length>initial);const changed=r.paints.length;
 r.draw('ar');assert.ok(r.paints.length>changed);const arabic=r.paints.length;
 r.draw('ar');assert.equal(r.paints.length,arabic);r.listeners.loadingdone();r.draw('ar');assert.ok(r.paints.length>arabic);
});
test('4K lettering has enough pixels and reuses its raster until the display density changes',()=>{
 const r=renderer();r.draw('en','Sharp at 4K',100,1,2.4);
 const first=r.draws.find(d=>d.image.kind==='label').image;
 assert.ok(first.width>=400*2.4);assert.ok(first.height>=240*2.4);
 const paints=r.paints.length;r.draw('en','Sharp at 4K',100,2,2.4);assert.equal(r.paints.length,paints);
 r.draw('en','Sharp at 4K',100,3,2);assert.ok(r.paints.length>paints);
});

test('departing thoughts still render their shell and text after the face leaves the crop',()=>{
 const r=renderer();r.draw('en','Keep your information safe.',100,1,2,true);
 assert.ok(r.draws.some(d=>d.image.kind==='shell'));assert.ok(r.draws.some(d=>d.image.kind==='label'));
});

const tailFace=(id,x=.5)=>({id,x,y:.5,w:.12,h:.2,since:0,seen:5000,ready:true,visible:true});
const tailBody=(key,owner,x=650,y=100,width=300,height=130)=>({key,owner,x,y,width,height,phrase:0,vx:0,vy:0,ax:x,ay:y,squash:0,visible:true,opacity:1});
test('thought tails stay above the head with a short clear connection, and omit distant owners',()=>{
 const r=renderer(),face=tailFace(1),body=tailBody('1:0',1),tails=r.tailFrames([body],[face],1600,900).get(body.key);
 assert.equal(tails.length,2,'a nearby overhead thought has two connecting dots');
 for(const tail of tails){
  assert.equal(r.physics.intersects(tail,body),false);
  assert.equal(r.physics.intersects(tail,r.physics.faceObstacle(face,1600,900)),false);
  assert.ok(tail.y+tail.height<(face.y-face.h/2)*900,'every tail dot stays above the face');
 }
 assert.ok(tails[1].width<tails[0].width,'dots become smaller toward their owner');
 const head=r.physics.faceObstacle(face,1600,900),close={...body,y:head.y-16-body.height};
 const compact=r.tailFrames([close],[face],1600,900).get(close.key);
 assert.equal(compact.length,2,'dots adapt to the compact gap used by the overhead layout');
 for(const dot of compact){assert.equal(r.physics.intersects(dot,close),false);assert.equal(r.physics.intersects(dot,head),false);}
 const distant=tailBody('1:0',1,40,100,240,130);
 assert.equal(r.tailFrames([distant],[face],1600,900).get(distant.key).length,0,'a distant bubble gets no misleading connector');
});
test('tail clearance uses every bubble rendered position and all neighbouring heads',()=>{
 const r=renderer(),face=tailFace(1),body=tailBody('1:0',1),baseline=r.tailFrames([body],[face],1600,900).get(body.key);
 assert.equal(baseline.length,2);
 const first=baseline[0],blocker={...tailBody('2:0',2,1200,600,first.width+8,first.height+8),renderX:first.x-4,renderY:first.y-4};
 const blocked=r.tailFrames([body,blocker],[face],1600,900).get(body.key);
 assert.ok(blocked.length<baseline.length,'a rendered body blocks the dot even when its physics coordinates are elsewhere');
 for(const tail of blocked)assert.equal(r.physics.intersects(tail,{...blocker,x:blocker.renderX,y:blocker.renderY}),false);
 const neighbour={...tailFace(2),x:(first.x+first.width/2)/1600,y:(first.y+first.height/2)/900,w:.025,h:.04};
 const guarded=r.tailFrames([body],[face,neighbour],1600,900).get(body.key);
 assert.ok(guarded.length<baseline.length);
 for(const tail of guarded)assert.equal(r.physics.intersects(tail,r.physics.faceObstacle(neighbour,1600,900)),false);
});
test('nearby thought connectors reserve space across owners without depending on paint order',()=>{
 const r=renderer(),faces=[{...tailFace(1,.471),y:.568,w:.08,h:.15},{...tailFace(2,.625),y:.586,w:.08,h:.15}];
 const a=tailBody('1:0',1,859,285,200,93),b=tailBody('2:0',2,655,208,140,118);
 assert.equal(r.physics.intersects(a,b),false,'the two thought bodies are separate');
 const separateA=r.tailFrames([a,{...b,opacity:0}],faces,1600,900).get(a.key),separateB=r.tailFrames([{...a,opacity:0},b],faces,1600,900).get(b.key);
 assert.ok(separateA.some(a=>separateB.some(b=>r.physics.intersects(a,b))),'independently placed tails would collide in this scene');
 const joined=r.tailFrames([a,b],faces,1600,900),dots=[...joined.values()].flat();
 assert.ok(dots.length<separateA.length+separateB.length,'the conflicting dot yields');
 for(let i=0;i<dots.length;i++){
  for(let j=0;j<i;j++)assert.equal(r.physics.intersects(dots[i],dots[j]),false);
  for(const body of [a,b])assert.equal(r.physics.intersects(dots[i],body),false);
  for(const face of faces)assert.equal(r.physics.intersects(dots[i],r.physics.faceObstacle(face,1600,900)),false);
 }
 assert.deepEqual([...r.tailFrames([b,a],faces,1600,900)],[...joined],'changing painter order cannot transfer the tail slot');
});


test('compact thoughts omit icons and fit complete English and Arabic text inside a clipped interior',()=>{
 for(const [lang,text] of [['en','I keep confidential work conversations out of public places.'],['ar','أحافظ على سرية معلومات العمل ولا أشاركها في الأماكن العامة.']]){
  const r=renderer({icons:true});r.drawSized(text,lang,140,86);
  assert.ok(r.paints.length>0,'compact text remains visible');
  assert.equal(r.draws.some(d=>d.image.kind==='icon'),false,'decorative artwork yields space to compact text');
  assert.equal(r.paints.map(p=>p.text).join('').replaceAll(' ',''),text.replaceAll(' ',''),'the ordinary phrase fits without losing content');
  for(const paint of r.paints){
   assert.ok(paint.clip,'each cached text raster has an explicit interior clip');
   assert.ok(paint.size>=6&&paint.size<9,'compact copy fits at a modestly smaller font');
   assert.ok(paint.width<=paint.clip.width+.01);
   assert.ok(paint.y-paint.size/2>=paint.clip.y&&paint.y+paint.size/2<=paint.clip.y+paint.clip.height);
   assert.equal(paint.direction,lang==='ar'?'rtl':'ltr');
  }
 }
 const normal=renderer({icons:true});normal.draw();assert.ok(normal.draws.some(d=>d.image.kind==='icon'),'normal single-person thoughts keep their artwork');
});

test('an oversized edited phrase stays readable at its start and cannot paint outside the bubble interior',()=>{
 const r=renderer({icons:true});r.drawSized('Keep private information safe. '.repeat(30),'en',120,74);
 assert.ok(r.paints.length>0&&r.paints[0].text.startsWith('Keep'),'overflow does not hide all text');
 assert.ok(r.paints.at(-1).text.endsWith('…'),'unavoidable overflow is explicit');
 for(const paint of r.paints){
  const clip=paint.clip;assert.ok(clip.x>0&&clip.y>0&&clip.x+clip.width<120&&clip.y+clip.height<74);
  assert.ok(paint.width<=clip.width+.01);assert.ok(paint.y-paint.size/2>=clip.y&&paint.y+paint.size/2<=clip.y+clip.height);
 }
});
