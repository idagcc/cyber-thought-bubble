const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
function renderer(){
 const paints=[],draws=[],glassTimes=[],listeners={};
 function context(){return {font:'',save(){},restore(){},scale(){},measureText(text){return {width:text.length*(parseFloat(this.font.split(' ')[1])||20)*.55};},fillText(text,x,y){paints.push({text,x,y});},drawImage(image,...bounds){draws.push({image,bounds});}};}
 const sandbox={exports:{},performance:{now:()=>5000},document:{fonts:{addEventListener(event,fn){listeners[event]=fn;}},createElement(){return {kind:'label',getContext:context};}},require(name){if(name==='./bubbleArtwork')return {glassArtwork:()=>({kind:'shell'}),drawGlassArtwork(ctx,variant,x,y,width,height,time){glassTimes.push(time);ctx.drawImage({kind:'shell'},x,y,width,height);},prepareGlassArtwork(){}};if(name==='./bubblePhysics')return {intersects:()=>false,faceObstacle:()=>({})};if(name==='./layout')return {wrapMeasured:(text,width,measure)=>{const lines=[];let line='';for(const word of text.split(' ')){const next=line?line+' '+word:word;if(line&&measure(next)>width){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);return lines;}};return {};}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/photo.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 const face={x:.5,y:.4,w:.1,h:.2,id:1,since:0,seen:5000,ready:true,visible:true},body={x:100,y:100,width:400,height:240,key:'1:0',owner:1,phrase:0,vx:0,vy:0,ax:100,ay:100,squash:0,visible:true,opacity:1};
 return {draw:(lang='en',text='Keep your information safe.',x=100,shapeTime=0)=>sandbox.exports.drawThoughts(context(),[{...body,x,shapeTime}],[face],[{en:text,ar:'أحافظ على معلوماتي'}],lang,1600,900),paints,draws,glassTimes,listeners};
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
