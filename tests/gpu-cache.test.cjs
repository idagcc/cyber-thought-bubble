const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 let next=0,uploads=0,queries=0;const deleted=[];
 const gl={NO_ERROR:0,createShader:()=>({}),getShaderParameter:()=>true,createProgram:()=>({}),getProgramParameter:()=>true,createBuffer:()=>({}),getAttribLocation:()=>0,getUniformLocation:()=>({}),createTexture:()=>++next,deleteTexture:id=>deleted.push(id),texImage2D:()=>uploads++,isContextLost:()=>false,getError:()=>{queries++;return 0;}};
 for(const key of ['shaderSource','compileShader','attachShader','linkProgram','useProgram','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','activeTexture','uniform1i','enable','blendFunc','pixelStorei','clearColor','deleteShader','deleteProgram','deleteBuffer','viewport','uniform2f','clear','bindTexture','texParameteri','uniformMatrix3fv','uniform1f','drawArrays'])gl[key]=()=>{};
 const canvas={getContext:()=>gl,addEventListener(){},removeEventListener(){}};
 const sandbox={exports:{},Float32Array,window:{devicePixelRatio:1},require:()=>({displayRasterSize:(width,height)=>({width,height})})};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/gpuBubbles.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 return {renderer:sandbox.exports.GpuBubbles.create(canvas),deleted,uploads:()=>uploads,queries:()=>queries};
}
test('GPU cache limits retained textures by bytes, reuses active sprites and releases resources',()=>{
 const s=setup(),sprites=Array.from({length:40},()=>({width:1024,height:1024}));
 for(const sprite of sprites){s.renderer.begin(1920,1080,{width:3840,height:2160});s.renderer.drawImage(sprite,0,0,100,100);}
 assert.equal(s.uploads(),40);assert.equal(s.deleted.length,8,'40 four-MiB sprites retain only the 128 MiB budget');
 s.renderer.drawImage(sprites.at(-1),0,0,100,100);assert.equal(s.uploads(),40,'current sprite reuses its texture');
 s.renderer.drawImage(sprites[0],0,0,100,100);assert.equal(s.uploads(),41,'an evicted sprite uploads on demand');
 assert.equal(s.deleted.length,9);s.renderer.dispose();assert.equal(s.deleted.length,41,'all allocated textures are released');
});
test('GPU diagnostics do not synchronously query errors on every display frame',()=>{
 const s=setup();for(let i=0;i<120;i++){s.renderer.begin(1920,1080,{width:3840,height:2160});assert.equal(s.renderer.finish(),true);}
 assert.equal(s.queries(),2);s.renderer.dispose();
});
