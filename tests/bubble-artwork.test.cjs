const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
function artwork(){
 let created=0;
 function context(){
  const calls=[];
  const ctx={calls,createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})};
  for(const name of ['save','restore','translate','rotate','scale','drawImage','beginPath','moveTo','bezierCurveTo','closePath','fill','clip','fillRect','stroke','ellipse'])ctx[name]=(...args)=>calls.push([name,...args]);
  return ctx;
 }
 const sandbox={exports:{},document:{createElement(){return {id:++created,getContext:context};}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/bubbleArtwork.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 return {...sandbox.exports,context,created:()=>created};
}
test('independent glass motion reuses cached skins without creating artwork per frame',()=>{
 const a=artwork();a.prepareGlassArtwork();const created=a.created(),first=a.context();
 a.drawGlassArtwork(first,1,10,20,400,240,1,2);
 const skins=first.calls.filter(c=>c[0]==='drawImage').map(c=>c[1]);assert.equal(skins.length,3);assert.equal(new Set(skins).size,3);
 for(let frame=1;frame<=120;frame++){
  const ctx=a.context();a.drawGlassArtwork(ctx,1,10,20,400,240,1+frame/60,2);
  assert.deepEqual(ctx.calls.filter(c=>c[0]==='drawImage').map(c=>c[1]),skins);
 }
 assert.equal(a.created(),created,'motion must only composite existing images');
 const later=a.context();a.drawGlassArtwork(later,1,10,20,400,240,7,2);
 const positions=ctx=>ctx.calls.filter(c=>c[0]==='translate').map(c=>c.slice(1));
 const start=positions(first),end=positions(later),deltas=end.map((p,i)=>p.map((v,j)=>v-start[i][j]));
 assert.ok(deltas.every(d=>Math.hypot(...d)>.1),'each skin moves');
 assert.equal(new Set(deltas.map(d=>JSON.stringify(d))).size,3,'skins drift independently');
});
test('zero animation time uses the still composite for reduced motion and photographs',()=>{
 const a=artwork(),ctx=a.context();a.drawGlassArtwork(ctx,5,10,20,400,240,0,99);
 assert.deepEqual(ctx.calls,[['drawImage',a.glassArtwork(1),10,20,400,240]]);
 assert.equal(a.glassArtwork(-3),a.glassArtwork(1),'variant normalization preserves the artwork cache');
});
