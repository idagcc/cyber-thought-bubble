const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
function load(file){
 const sandbox={exports:{},require:name=>name==='react'?{forwardRef:render=>render}:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,sandbox);
 return sandbox.exports;
}
const {captureFacesFit}=load('src/Camera.tsx'),{matchFaces,displayTracks}=load('src/faceTracking.ts'),{coverCrop}=load('src/layout.ts');
test('portrait capture rejects a fresh face outside its crop even while smoothed artwork is still inside',()=>{
 let id=0,tracks=[];
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[{x:.7,y:.4,w:.1,h:.2,observed:now}],now,()=>++id);
 tracks=matchFaces(tracks,[{x:.73,y:.4,w:.1,h:.2,observed:2300}],2300,()=>++id);
 const track=displayTracks(tracks,2300)[0],crop=coverCrop(1920,1080,1200,1320);
 for(const mirrored of [false,true]){
  const project=f=>({x:mirrored?1-(f.x*1920-crop.sx)/crop.sw:(f.x*1920-crop.sx)/crop.sw,y:(f.y*1080-crop.sy)/crop.sh,w:f.w*1920/crop.sw,h:f.h*1080/crop.sh});
  const face={...track,...project(track),measured:project(track.measured)};
  assert.ok(face.x-face.w/2>=0&&face.x+face.w/2<=1,'the displayed anchor has not yet reached the crop boundary');
  assert.equal(captureFacesFit([face]),false,'the latest measured head must fit before saving the photograph');
  assert.equal(captureFacesFit([{...face,measured:project({x:.7,y:.4,w:.1,h:.2})}]),true,'returning fully into the crop enables capture without waiting for display easing');
 }
});
test('every settled participant must fit, including one whose measured box exceeds the vertical crop',()=>{
 const settled={x:.5,y:.5,w:.1,h:.2,id:1,since:0,seen:3000,ready:true,visible:true};
 const other={...settled,id:2,x:.7,measured:{x:.7,y:.94,w:.1,h:.2}};
 assert.equal(captureFacesFit([settled,other]),false,'one fully visible participant cannot authorize clipping another settled participant');
 assert.equal(captureFacesFit([settled,{...other,ready:false}]),true,'unsettled detections retain the existing admission rule');
 assert.equal(captureFacesFit([{...settled,x:.98}]),false,'tracks without measured metadata still use their own bounds');
});
