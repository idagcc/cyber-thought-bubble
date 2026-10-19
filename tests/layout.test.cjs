const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const fs=require('node:fs');const vm=require('node:vm');
const code=ts.transpileModule(fs.readFileSync('src/layout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const sandbox={exports:{}};vm.runInNewContext(code,sandbox);const {bubbleFrames,certificateLayout,coverCrop,wrapMeasured}=sandbox.exports;
test('default capture fills the landscape 6 by 4 certificate photo window exactly',()=>{
 const layout=certificateLayout();
 assert.equal(layout.width,1800);assert.equal(layout.height,1200);assert.equal(layout.width/layout.height,6/4);
 assert.ok(layout.photoWidth>layout.photoHeight);assert.equal(layout.photoWidth,layout.width);
 const crop=coverCrop(layout.photoWidth,layout.photoHeight,layout.photoWidth,layout.photoHeight);
 assert.equal(crop.sx,0);assert.equal(crop.sy,0);assert.equal(crop.sw,layout.photoWidth);assert.equal(crop.sh,layout.photoHeight);
 const portrait=certificateLayout('portrait');assert.equal(portrait.width,1200);assert.equal(portrait.height,1800);assert.equal(portrait.photoWidth,1200);assert.equal(portrait.photoHeight,1320);
});
test('photo cover crop fills wide print frames without distortion or empty bands',()=>{
 for(const orientation of ['landscape','portrait']){
  const {photoWidth,photoHeight}=certificateLayout(orientation);
  for(const [width,height] of [[1920,1080],[1280,720],[900,900],[900,1120],[3840,1080]]){
   const {sx,sy,sw,sh}=coverCrop(width,height,photoWidth,photoHeight),epsilon=1e-8;
   assert.ok(sx>=-epsilon&&sy>=-epsilon);assert.ok(sx+sw<=width+epsilon&&sy+sh<=height+epsilon);
   assert.ok(Math.abs(photoWidth/sw-photoHeight/sh)<epsilon,'the image uses one scale in both directions');
   assert.ok(Math.abs(sw-width)<epsilon||Math.abs(sh-height)<epsilon,'one entire source dimension remains visible');
   assert.ok(Math.abs(sx-(width-sw)/2)<epsilon&&Math.abs(sy-(height-sh)/2)<epsilon,'the crop stays centered');
  }
 }
 for(const dimensions of [[0,100,100,100],[100,-1,100,100],[100,100,NaN,100]])assert.throws(()=>coverCrop(...dimensions),/dimensions/);
});
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
test('thought bodies and tails stay separate on screen and both print formats',()=>{
 for(const [width,height] of [[1600,900],[1600,1000],[1366,768],[3840,2160],[900,1600],[1800,820],[1200,1320]]){
  for(const faceX of [.2,.5,.8]){const frames=bubbleFrames(width,height,faceX);
  for(let i=0;i<frames.length;i++){
   const frame=frames[i];assert.ok(frame.x>=0&&frame.y>=0&&frame.x+frame.width<=width&&frame.y+frame.height<=height);
   for(let j=0;j<frames.length;j++)if(j!==i){assert.equal(overlaps(frame,frames[j]),false);for(const dot of frame.tails)assert.equal(overlaps({x:dot.x-dot.radius,y:dot.y-dot.radius,width:dot.radius*2,height:dot.radius*2},frames[j]),false);}
   for(const dot of frame.tails){assert.ok(dot.x-dot.radius>=0&&dot.x+dot.radius<=width&&dot.y-dot.radius>=0&&dot.y+dot.radius<=height);assert.equal(overlaps({x:dot.x-dot.radius,y:dot.y-dot.radius,width:dot.radius*2,height:dot.radius*2},frame),false);}
  }
  }
 }
});
test('long unbroken names and editable phrases wrap without losing characters',()=>{
 for(const input of ['A'.repeat(180),'أ'.repeat(120),'A thoughtful moment. A safer digital world.']){
  const lines=wrapMeasured(input,30,s=>s.length);for(const line of lines)assert.ok(line.length<=30);assert.equal(lines.join('').replaceAll(' ',''),input.replaceAll(' ',''));
 }
});
