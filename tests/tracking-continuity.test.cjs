const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const sandbox={exports:{},Math,Set,Map};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/faceTracking.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
const {matchFaces,displayTracks,captureGroupReady}=sandbox.exports;
const face=(x,observed)=>({x,y:.36,w:.08,h:.14,...(observed===undefined?{}:{observed})});
const person=(x,observed)=>({x,y:.6,w:.24,h:.64,observed});

test('global association keeps both existing visitors when the closest pair would strand one',()=>{
 let id=0,tracks=matchFaces([],[face(.4),face(.48)],0,()=>++id);
 tracks=matchFaces(tracks,[face(.43),face(.35)],100,()=>++id);
 assert.equal(id,2);assert.equal(tracks.length,2);
 assert.equal(tracks.find(t=>t.x===.35).id,1);assert.equal(tracks.find(t=>t.x===.43).id,2);
});

test('moving through a 600ms face dropout preserves ownership and activation without a ghost',()=>{
 let id=0,tracks=[];
 for(let now=0;now<=3000;now+=100)tracks=matchFaces(tracks,[face(now<=2500?.3:.3+(now-2500)*.0003)],now,()=>++id);
 for(let now=3100;now<3600;now+=100)tracks=matchFaces(tracks,[],now,()=>++id);
 assert.ok(displayTracks(tracks,3300)[0].x>.48,'the visible anchor follows recent motion during a short gap');
 tracks=matchFaces(tracks,[face(.63)],3600,()=>++id);
 assert.equal(tracks.length,1);assert.equal(id,1);assert.equal(tracks[0].id,1);assert.equal(tracks[0].ready,true);
});

test('opposing trajectories preserve IDs across a crossing regardless of detector order',()=>{
 let id=0,tracks=[];
 for(let now=0;now<=3000;now+=100){
  const a=face(.25+now*.00015),b=face(.75-now*.00015);
  tracks=matchFaces(tracks,now%200?[b,a]:[a,b],now,()=>++id);
  assert.equal(tracks.length,2);assert.equal(tracks.find(t=>Math.abs(t.x-a.x)<1e-8).id,1);assert.equal(tracks.find(t=>Math.abs(t.x-b.x)<1e-8).id,2);
 }
 assert.equal(id,2);
});

test('eight-Hz body support retains a moving visitor for over 30 seconds while looking away',()=>{
 let id=0,tracks=[];
 const x=now=>.5+Math.sin(now/2200)*.1;
 for(let now=0;now<=36000;now+=40){
  const observed=Math.floor(now/125)*125,people=[person(x(observed),observed)];
  const faces=now<=2200||now>=35000?[face(x(now),now)]:[];
  tracks=matchFaces(tracks,faces,now,()=>++id,people);
  assert.equal(tracks.length,1);assert.equal(tracks[0].id,1);
  if(now>=2200)assert.equal(tracks[0].ready,true);
  if(now>2500&&now<35000){
   assert.equal(tracks[0].detected,false);assert.equal(tracks[0].faceSeen,2200);assert.equal(captureGroupReady(tracks,now),false);
   assert.equal(tracks[0].seen,observed);assert.ok(Math.abs(tracks[0].x-x(observed))<.02);
  }
 }
 assert.equal(id,1);assert.equal(captureGroupReady(tracks,36000),true);
});

test('cached body boxes cannot extend a departed visitor or create a body-only identity',()=>{
 let id=0,tracks=[];
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[face(.5,now)],now,()=>++id,[person(.5,now)]);
 tracks=matchFaces(tracks,[],3000,()=>++id,[person(.55,3000)]);
 for(let now=3100;now<=6000;now+=100){
  tracks=matchFaces(tracks,[],now,()=>++id,[person(.55,3000)]);
  if(tracks.length)assert.equal(tracks[0].seen,3000);
 }
 assert.equal(tracks.length,0);assert.equal(id,1);
 tracks=matchFaces(tracks,[face(.55,6100)],6100,()=>++id,[person(.55,6100)]);
 assert.equal(tracks[0].id,2);assert.equal(tracks[0].ready,false);
});

test('a newly available body can attach to an existing visitor without another face observation',()=>{
 let id=0,tracks=[];
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[face(.5,now)],now,()=>++id);
 tracks=matchFaces(tracks,[],2300,()=>++id,[person(.5,2300)]);
 tracks=matchFaces(tracks,[],2425,()=>++id,[person(.53,2425)]);
 assert.equal(tracks.length,1);assert.equal(tracks[0].id,1);assert.ok(Math.abs(tracks[0].x-.53)<1e-8);
 assert.equal(tracks[0].ready,true);assert.equal(captureGroupReady(tracks,2425),false);
});

test('out-of-order cached evidence never rewinds support or actual face observation time',()=>{
 let id=0,tracks=matchFaces([],[face(.5,1000)],1000,()=>++id,[person(.5,1000)]);
 tracks=matchFaces(tracks,[face(.52,1100)],1100,()=>++id,[person(.5,1000)]);
 tracks=matchFaces(tracks,[face(.5,1000)],1200,()=>++id,[person(.53,1200)]);
 assert.equal(tracks[0].faceSeen,1100);assert.equal(tracks[0].seen,1200);assert.equal(tracks[0].bodySeen,1200);
 assert.equal(tracks[0].detected,false);
 const x=tracks[0].x;
 tracks=matchFaces(tracks,[],1250,()=>++id,[person(.49,1050)]);
 assert.equal(tracks[0].x,x);assert.equal(tracks[0].bodySeen,1200);assert.equal(tracks[0].seen,1200);
});

test('motion smoothing stays substantially closer to the moving head without frame-rate steps',()=>{
 let id=0,tracks=[];
 for(let frame=0;frame<=60;frame++){const now=frame*1000/30;tracks=matchFaces(tracks,[face(.2+now*.0002)],now,()=>++id);}
 const shown=displayTracks(tracks,2000)[0],lag=(shown.measured.x-shown.x)*1600;
 assert.ok(lag>=0&&lag<30,`moving head lag ${lag}px at 320px/s`);
 const later=displayTracks(tracks,2016)[0];assert.ok(later.x>shown.x);assert.equal(later.id,shown.id);
});

test('false face boxes on hands cannot hijack a moving body-supported head or spawn visitors',()=>{
 let id=0,tracks=[];
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[face(.5,now)],now,()=>++id,[person(.5,now)]);
 for(let now=2325;now<=10000;now+=125){
  const x=.5+Math.sin(now/2000)*.1;
  const falseFaces=[{x,y:.56,w:.028,h:.045,confidence:.58,observed:now},{x:x+.06,y:.62,w:.05,h:.07,confidence:.62,observed:now}];
  tracks=matchFaces(tracks,falseFaces,now,()=>++id,[person(x,now)]);
  assert.equal(tracks.length,1);assert.equal(tracks[0].id,1);assert.equal(tracks[0].ready,true);
  assert.equal(tracks[0].faceSeen,2200);assert.equal(tracks[0].detected,false);
  assert.ok(Math.abs(tracks[0].x-x)<1e-8);assert.ok(Math.abs(tracks[0].y-.36)<1e-8);assert.ok(Math.abs(tracks[0].w-.08)<1e-8);
  assert.equal(captureGroupReady(tracks,now),false);
 }
 assert.equal(id,1);
 tracks=matchFaces(tracks,[face(tracks[0].x,10125)],10125,()=>++id,[person(tracks[0].x,10125)]);
 assert.equal(tracks[0].id,1);assert.equal(tracks[0].ready,true);assert.equal(tracks[0].detected,true);
});

test('a separate nearby visitor remains eligible even when their face overlaps another body',()=>{
 let id=0,tracks=[];
 const owner={x:.5,y:.6,w:.4,h:.64};
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[face(.5,now)],now,()=>++id,[{...owner,observed:now}]);
 const neighbour={x:.66,y:.52,w:.2,h:.5,observed:2300};
 tracks=matchFaces(tracks,[face(.5,2300),face(.66,2300)],2300,()=>++id,[{...owner,observed:2300},neighbour]);
 assert.equal(tracks.length,2);assert.equal(tracks.find(t=>t.x===.5).id,1);assert.equal(tracks.find(t=>t.x===.66).id,2);
});

test('a later false face cannot steal an established person-box association',()=>{
 let id=0,tracks=[];
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[face(.5,now)],now,()=>++id,[person(.5,now)]);
 const phantom={...face(.51,2200),y:.39,id:2,since:2200,seen:2200,ready:false,visible:true,faceSeen:2200};
 tracks.push(phantom);
 tracks=matchFaces(tracks,[],2325,()=>++id,[person(.515,2325)]);
 assert.equal(tracks.find(t=>t.id===1).bodySeen,2325);assert.equal(tracks.find(t=>t.id===2).bodySeen,undefined);
 assert.equal(tracks.find(t=>t.id===1).ready,true);
});

test('reused cached faces never relearn the head offset when a new body box changes shape',()=>{
 let id=0,tracks=[];
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[face(.5,now)],now,()=>++id,[person(.5,now)]);
 const original={...tracks[0].headOffset};
 tracks=matchFaces(tracks,[face(.5,2200)],2300,()=>++id,[{...person(.52,2300),y:.64,h:.72}]);
 for(const key of ['x','y','w','h'])assert.equal(tracks[0].headOffset[key],original[key]);
 assert.equal(tracks[0].faceSeen,2200);assert.equal(tracks[0].bodySeen,2300);
 assert.ok(Math.abs(tracks[0].y-(.64+original.y*.72))<1e-8);
});

test('weak, undersized detections near an owned head cannot change its reference geometry',()=>{
 let id=0,tracks=[];
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[{...face(.5,now),confidence:.95}],now,()=>++id,[person(.5,now)]);
 const original={...tracks[0].headOffset};
 for(let now=2325;now<=6000;now+=125){
  tracks=matchFaces(tracks,[{...face(.56,now),y:.31,w:.045,h:.08,confidence:.52}],now,()=>++id,[person(.5,now)]);
  assert.equal(tracks.length,1);assert.equal(tracks[0].id,1);assert.equal(tracks[0].faceSeen,2200);
  for(const key of ['x','y','w','h'])assert.equal(tracks[0].headOffset[key],original[key]);
 }
 assert.equal(id,1);
});

test('small distant face-only visitors keep the original admission behavior outside owned bodies',()=>{
 let id=0,tracks=[];
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[face(.4,now)],now,()=>++id,[person(.4,now)]);
 for(let now=2300;now<=4500;now+=100){
  const distant={x:.85,y:.3,w:.025,h:.045,confidence:.55,source:'tile',observed:now};
  tracks=matchFaces(tracks,[face(.4,now),distant],now,()=>++id,[person(.4,now)]);
 }
 assert.equal(tracks.length,2);assert.equal(id,2);assert.equal(tracks.find(t=>t.id===2).ready,true);
 assert.equal(tracks.find(t=>t.id===2).person,undefined);
});

test('interleaved face and body timestamps cannot manufacture fast vertical motion',()=>{
 let id=0,tracks=[];
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[face(.5,now)],now,()=>++id,[person(.5,now)]);
 tracks=matchFaces(tracks,[face(.5,2300)],2300,()=>++id,[person(.5,2200)]);
 tracks=matchFaces(tracks,[],2310,()=>++id,[{...person(.5,2310),h:.8}]);
 assert.ok(Math.abs(tracks[0].vy)<.001,'changing body height does not imply body-center movement');
 const shown=displayTracks(tracks,2400)[0];
 assert.ok(Math.abs(shown.y-tracks[0].y)<tracks[0].h*.45);
});

test('display extrapolation stays within half a head even with a noisy velocity estimate',()=>{
 const track={...face(.5,0),id:1,since:0,seen:0,ready:true,visible:true,updated:0,from:face(.5),vx:.8,vy:-.8};
 const shown=displayTracks([track],500)[0];
 assert.ok(Math.abs(shown.x-track.x)<=track.w*.45+1e-8);
 assert.ok(Math.abs(shown.y-track.y)<=track.h*.45+1e-8);
});

test('alternating full-view and crop box offsets do not become motion estimates',()=>{
 let id=0,tracks=[];
 for(let frame=0;frame<100;frame++){
  const source=frame%2?'tile':'full',now=frame*1000/30;
  const detection={...face(source==='tile'?.512:.5,now),y:source==='tile'?.39:.36,source};
  tracks=matchFaces(tracks,[detection],now,()=>++id);
 }
 assert.equal(id,1);assert.ok(Math.abs(tracks[0].faceVx)<.001);assert.ok(Math.abs(tracks[0].faceVy)<.001);
});

test('a strong lower-row face can activate when its body is hidden by another visitor',()=>{
 let id=0,tracks=[];
 const body=now=>({x:.5,y:.6,w:.4,h:.64,observed:now});
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[{...face(.5,now),confidence:.95}],now,()=>++id,[body(now)]);
 for(let now=2300;now<=5500;now+=100){
  const lower={x:.55,y:.55,w:.06,h:.11,confidence:.95,observed:now};
  tracks=matchFaces(tracks,[{...face(.5,now),confidence:.95},lower],now,()=>++id,[body(now)]);
  const owners=tracks.filter(t=>t.bodySeen===now);assert.equal(owners.length,1,'one body observation has one owner');
 }
 assert.equal(id,2);assert.equal(tracks.length,2);assert.equal(tracks.find(t=>t.id===2).ready,true);
});

test('overlapping person boxes cannot force visible face tracks to exchange ownership',()=>{
 let id=0,tracks=[];
 for(let now=0;now<=4000;now+=100){
  const faces=[{...face(.4,now),confidence:.95},{...face(.6,now),confidence:.95}];
  const bodies=[{x:now%200?.52:.48,y:.6,w:.42,h:.64,observed:now},{x:now%200?.48:.52,y:.6,w:.42,h:.64,observed:now}];
  tracks=matchFaces(tracks,now%200?faces.reverse():faces,now,()=>++id,bodies);
  assert.equal(tracks.length,2);assert.equal(tracks.find(t=>t.x===.4).id,1);assert.equal(tracks.find(t=>t.x===.6).id,2);
  assert.notEqual(tracks[0].person,tracks[1].person,'person boxes are assigned exclusively');
 }
 assert.equal(id,2);
});

test('small alternating face-box noise is damped visually while raw measurements remain intact',()=>{
 let id=0,tracks=[];const shown=[];
 for(let frame=0;frame<360;frame++){
  const now=frame*1000/60;
  if(frame%2===0){
   const sign=frame%4?1:-1,raw={x:.5+sign*.004,y:.36+sign*.003,w:.08+sign*.004,h:.14+sign*.005,observed:now};
   tracks=matchFaces(tracks,[raw],now,()=>++id);
   assert.equal(tracks[0].x,raw.x);assert.equal(tracks[0].w,raw.w);
   const displayed=displayTracks(tracks,now)[0];assert.equal(displayed.measured.x,raw.x);assert.equal(displayed.measured.w,raw.w);
  }
  if(frame>120)shown.push(displayTracks(tracks,now)[0]);
 }
 const span=key=>Math.max(...shown.map(t=>t[key]))-Math.min(...shown.map(t=>t[key]));
 assert.ok(span('x')*1600<3,'12.8px raw center noise becomes less than3px visual movement');
 assert.ok(span('w')*1600<3,'size noise is independently smoothed');
 assert.equal(id,1);assert.equal(captureGroupReady(tracks,5900),true);
});

test('body-only box jitter is gently followed without refreshing face capture or ownership',()=>{
 let id=0,tracks=[],previous,maxStep=0;
 for(let frame=0;frame<600;frame++){
  const now=frame*1000/60,observed=Math.floor(now/125)*125,sign=Math.floor(observed/125)%2?1:-1;
  const box={x:.5,y:frame<150?.6:.6+sign*.02,w:.24,h:frame<150?.64:.64-sign*.04,observed};
  tracks=matchFaces(tracks,frame<150?[face(.5,now)]:[],now,()=>++id,[box]);
  const displayed=displayTracks(tracks,now)[0];
  if(previous&&frame>200)maxStep=Math.max(maxStep,Math.abs(displayed.y-previous.y)*900);
  if(frame>200){assert.equal(tracks[0].ready,true);assert.equal(captureGroupReady(tracks,now),false);}
  previous=displayed;
 }
 assert.equal(id,1);assert.ok(maxStep<3.5,`body-box noise stays smooth: ${maxStep}px per display frame`);
});

test('adaptive damping remains responsive to sustained body-only walking',()=>{
 let id=0,tracks=[],maxLag=0;
 for(let frame=0;frame<=360;frame++){
  const now=frame*1000/60,observed=Math.floor(now/125)*125,x=.3+Math.max(0,observed-2500)*.0001;
  tracks=matchFaces(tracks,now<=2200?[face(.3,now)]:[],now,()=>++id,[person(x,observed)]);
  const displayed=displayTracks(tracks,now)[0];
  if(now>3500)maxLag=Math.max(maxLag,(.3+(now-2500)*.0001-displayed.x)*1600);
 }
 assert.equal(id,1);assert.equal(tracks[0].ready,true);
 assert.ok(maxLag<32,`sustained walking stays attached: ${maxLag}px lag at160px/s`);
});

test('turning into a narrow body box preserves head proportions and recovers the existing visitor',()=>{
 let id=13,tracks=[];
 const initialFace={x:.528125,y:.19166666666666668,w:.215625,h:.38333333333333336,confidence:.95,observed:100000};
 const initialBody={x:.437,y:.4930411009550611,w:.8640625,h:1,observed:100000};
 for(let now=100000;now<=102200;now+=100)tracks=matchFaces(tracks,[{...initialFace,observed:now}],now,()=>++id,[{...initialBody,observed:now}]);
 const aspect=tracks[0].w/tracks[0].h;
 for(let now=102325;now<=104075;now+=125){
  const progress=(now-102200)/(104075-102200);
  const body={x:initialBody.x+(.5359375-initialBody.x)*progress,y:initialBody.y+(.5027777777777778-initialBody.y)*progress,w:initialBody.w+(.25625-initialBody.w)*progress,h:initialBody.h+(.9666666666666667-initialBody.h)*progress,confidence:.57,observed:now};
  tracks=matchFaces(tracks,[],now,()=>++id,[body]);
  assert.equal(tracks.length,1);assert.ok(Math.abs(tracks[0].w/tracks[0].h-aspect)<1e-10);
 }
 const returning={x:.48046875,y:.17083333333333334,w:.0859375,h:.1527777777777778,confidence:.7682119607925415,observed:104162.7};
 tracks=matchFaces(tracks,[returning],104179.3,()=>++id,[{x:.5359375,y:.5027777777777778,w:.25625,h:.9666666666666667,observed:104075}]);
 assert.equal(id,14);assert.equal(tracks.length,1);assert.equal(tracks[0].id,14);assert.equal(tracks[0].ready,true);assert.equal(tracks[0].detected,true);
});

test('body-box expansion cannot inflate the remembered head without fresh face evidence',()=>{
 let id=0,tracks=[];
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[face(.5,now)],now,()=>++id,[person(.5,now)]);
 tracks=matchFaces(tracks,[],2325,()=>++id,[{x:.5,y:.6,w:.66,h:1,observed:2325}]);
 assert.equal(id,1);assert.ok(tracks[0].w<=.08*1.6+1e-10);assert.ok(tracks[0].h<=.14*1.6+1e-10);
 assert.ok(Math.abs(tracks[0].w/tracks[0].h-.08/.14)<1e-10);
});

test('capture frame admission follows measured faces when smoothing crosses a portrait crop edge',()=>{
 const project=f=>({...f,x:(f.x*1920-(1920-1080*1200/1320)/2)/(1080*1200/1320),w:f.w*1920/(1080*1200/1320)});
 for(const [before,after,expected] of [[.7,.73,false],[.73,.7,true]]){
  let id=0,tracks=[];
  for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[{x:before,y:.4,w:.1,h:.2,observed:now}],now,()=>++id);
  tracks=matchFaces(tracks,[{x:after,y:.4,w:.1,h:.2,observed:2300}],2300,()=>++id);
  const displayed=displayTracks(tracks,2300)[0],crop={...project(displayed),measured:project(displayed.measured)};
  assert.equal(captureGroupReady([crop],2300),expected);
  assert.notEqual(crop.x,crop.measured.x,'the test retains a genuine smoothing difference');
 }
});

test('an already consumed late crop cannot become a second visitor after its owner moves',()=>{
 let id=0,tracks=[];
 const crop={x:.631640625,y:.388194444,w:.06171875,h:.109722222,confidence:.78777,source:'tile',observed:21701.4};
 tracks=matchFaces(tracks,[crop],21718,()=>++id);
 const fresh={x:.60546875,y:.409722222,w:.0578125,h:.102777778,confidence:.79534,source:'full',observed:21859.7};
 tracks=matchFaces(tracks,[fresh,crop],21876.3,()=>++id);
 assert.equal(id,1);assert.equal(tracks.length,1);assert.equal(tracks[0].faceSeen,fresh.observed);assert.equal(tracks[0].x,fresh.x);
 tracks=matchFaces(tracks,[{...fresh,x:.596,observed:21910},crop],21927,()=>++id);
 assert.equal(id,1);assert.equal(tracks[0].faceSeen,21910);
});

test('a stale historical row cannot reserve its owner and force the newer face onto a neighbour',()=>{
 let id=0,tracks=[];
 const owner={...face(.5,1000),source:'tile',confidence:.9};
 tracks=matchFaces(tracks,[owner,{...face(.56,1000),source:'full',confidence:.9}],1000,()=>++id);
 tracks=matchFaces(tracks,[{...face(.53,1100),source:'full',confidence:.9},owner],1100,()=>++id);
 assert.equal(id,2);assert.equal(tracks.find(t=>t.id===1).faceSeen,1100);assert.equal(tracks.find(t=>t.id===1).x,.53);
 assert.equal(tracks.find(t=>t.id===2).faceSeen,1000);
});

test('historical crop ownership does not suppress a genuinely separate nearby face',()=>{
 let id=0,tracks=[];
 const old={...face(.5,1000),source:'tile',confidence:.9};
 tracks=matchFaces(tracks,[old],1000,()=>++id);
 tracks=matchFaces(tracks,[old,{...face(.53,1100),confidence:.9,source:'full'},{...face(.65,1100),confidence:.9,source:'tile'}],1100,()=>++id);
 assert.equal(id,2);assert.equal(tracks.length,2);assert.equal(tracks.find(t=>t.id===1).x,.53);assert.equal(tracks.find(t=>t.id===2).x,.65);
});

test('one-off weak unsupported heads expire visually while repeated small real faces still activate',()=>{
 let id=0,tracks=[];
 const weak=now=>({x:.85,y:.9,w:.03,h:.05,confidence:.55,source:'tile',observed:now});
 tracks=matchFaces(tracks,[weak(0)],0,()=>++id);
 tracks=matchFaces(tracks,[weak(0)],400,()=>++id);
 assert.equal(tracks.length,1);assert.equal(displayTracks(tracks,400).length,0);assert.equal(tracks[0].ready,false);
 tracks=matchFaces(tracks,[weak(600)],600,()=>++id);
 assert.equal(id,1);assert.equal(tracks[0].since,600);assert.equal(displayTracks(tracks,600).length,1);
 for(let now=800;now<=2800;now+=200)tracks=matchFaces(tracks,[weak(now)],now,()=>++id);
 assert.equal(id,1);assert.equal(tracks[0].ready,true);assert.equal(displayTracks(tracks,2800).length,1);
});

function approachTrack(withNeighbour=false){
 let id=0,tracks=[];const next=()=>++id;
 const head=now=>({x:.389,y:.133,w:.075,h:.133,confidence:.95,source:'full',observed:now});
 const body=now=>({x:.6,y:.5,w:.65,h:.99,confidence:.95,observed:now});
 for(let now=0;now<=2200;now+=100)tracks=matchFaces(tracks,[head(now),...(withNeighbour?[{...face(.85,now),confidence:.95}]:[])],now,next,[body(now)]);
 for(let now=2300;now<=3000;now+=100)tracks=matchFaces(tracks,[],now,next,[{...body(now),x:.5,w:.97}]);
 const close=now=>({x:.60625,y:.46667,w:.234375,h:.416667,confidence:.842345,source:'full',observed:now});
 const wide=now=>({...body(now),x:.5,w:.97});
 return {tracks,next,close,wide,count:()=>id};
}

test('a single body-supported visitor can return much closer after two consistent fresh face observations',()=>{
 const a=approachTrack();let tracks=matchFaces(a.tracks,[a.close(3100)],3100,a.next,[a.wide(3100)]);
 assert.equal(a.count(),1);assert.equal(tracks.length,1);assert.equal(tracks[0].id,1);assert.equal(tracks[0].ready,true);
 assert.equal(tracks[0].detected,false);assert.equal(captureGroupReady(tracks,3100),false);assert.ok(tracks[0].recovery);
 tracks=matchFaces(tracks,[a.close(3100)],3120,a.next,[a.wide(3120)]);
 assert.equal(tracks[0].detected,false,'repeating the cached proposal is not confirmation');
 tracks=matchFaces(tracks,[a.close(3133)],3133,a.next,[a.wide(3133)]);
 assert.equal(a.count(),1);assert.equal(tracks.length,1);assert.equal(tracks[0].id,1);assert.equal(tracks[0].ready,true);
 assert.equal(tracks[0].detected,true);assert.equal(tracks[0].faceSeen,3133);assert.equal(tracks[0].x,a.close(3133).x);
 assert.equal(tracks[0].w,a.close(3133).w);assert.equal(tracks[0].recovery,undefined);
});

test('one broad body cannot relocate an old owner when another visitor is still visible',()=>{
 const a=approachTrack(true);let tracks=matchFaces(a.tracks,[a.close(3100)],3100,a.next,[a.wide(3100)]);
 assert.equal(a.count(),3);assert.equal(tracks.length,3);assert.ok(tracks.find(t=>t.id===1).x<.3);
 assert.equal(tracks.find(t=>t.id===1).faceSeen,2200);assert.equal(tracks.find(t=>t.id===2).faceSeen,2200);
 assert.equal(tracks.find(t=>t.id===3).x,a.close(3100).x);assert.equal(tracks.find(t=>t.id===1).recovery,undefined);
});

test('two unmatched strong faces leave broad-body ownership ambiguous and remain separate visitors',()=>{
 const a=approachTrack();const another={...a.close(3100),x:.83,w:.12,h:.214};
 const tracks=matchFaces(a.tracks,[a.close(3100),another],3100,a.next,[a.wide(3100)]);
 assert.equal(a.count(),3);assert.equal(tracks.length,3);assert.equal(tracks.find(t=>t.id===1).faceSeen,2200);
 assert.equal(tracks.find(t=>t.id===1).recovery,undefined);
});

test('body-only measured geometry does not retain nested historical track objects',()=>{
 const a=approachTrack(),track=a.tracks[0];
 assert.equal(track.measured.id,undefined);assert.equal(track.measured.person,undefined);assert.equal(track.measured.measured,undefined);
 assert.deepEqual(Object.keys(track.measured).sort(),['h','w','x','y']);
});

test('a body result just after a fresh face cannot move hard avoidance to its inferred head',()=>{
 const actual={x:.22890625,y:.3069444444,w:.3453125,h:.6138888889,confidence:.67265433,source:'full',observed:96259};
 const prior={...actual,id:27,since:93325.7,seen:96259,faceSeen:96259,bodySeen:96159,ready:true,visible:true,detected:false,
  person:{x:.4984375,y:.5,w:.915625,h:1,confidence:.96484,observed:96159},
  headOffset:{x:-.1178822847,y:-.2346825729,w:.307568438,h:.5305555556,aspect:.5625,referenceW:.2984375,referenceH:.5305555556},
  from:{x:.28544,y:.294,w:.31122,h:.5532},updated:96270.2,faceSamples:{full:actual},visualSource:'face',
  vx:-.00193,vy:-.0000514,faceVx:-.617067,faceVy:.010014,bodyVx:-.001929,bodyVy:-.0000514,
  faceSpeedX:.524606,faceSpeedY:.34196,bodySpeedX:.003454,bodySpeedY:.000093};
 const body={x:.48046875,y:.5,w:.9515625,h:1,confidence:.96484,observed:96292.4};
 const tracks=matchFaces([prior],[],96361.5,()=>28,[body]);
 assert.ok(tracks[0].x>.36,'raw body-derived geometry remains available for association');
 const immediate=displayTracks(tracks,96361.5)[0],later=displayTracks(tracks,96384)[0];
 assert.equal(later.measured.x,actual.x);assert.equal(later.measured.w,actual.w);
 assert.ok(later.x<=immediate.x+.01,'the artwork keeps following the recent leftward face motion');
 assert.equal(captureGroupReady(tracks,96384),false,'a body result still does not authorize capture');
 const beforeHandoff=displayTracks(tracks,96408.9)[0],afterHandoff=displayTracks(tracks,96409.1)[0];
 assert.ok(Math.abs(afterHandoff.x-beforeHandoff.x)*1600<2,'the handoff has no threshold discontinuity');
 const stale=displayTracks(tracks,96600)[0];
 assert.equal(stale.measured.x,stale.x);assert.equal(stale.measured.w,stale.w);
});
