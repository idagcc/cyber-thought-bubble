import type {Face} from './presence';
export const TRACK_HOLD_MS=1200;
export const TRACK_FADE_MS=650;
const TRACK_VISIBLE_MS=TRACK_HOLD_MS+TRACK_FADE_MS;
const TRACK_RETENTION_MS=2400;
export type Person={x:number;y:number;w:number;h:number;confidence?:number;observed?:number};
type HeadOffset={x:number;y:number;w:number;h:number;aspect?:number;referenceW?:number;referenceH?:number};
export type FaceTrack=Face & {id:number;since:number;seen:number;ready:boolean;visible:boolean;presence?:number;detected?:boolean;observed?:number;from?:Face;updated?:number;vx?:number;vy?:number;measured?:Face;person?:Person;bodySeen?:number;faceSeen?:number;headOffset?:HeadOffset;faceSamples?:Partial<Record<'full'|'tile'|'unknown',Face>>;faceVx?:number;faceVy?:number;bodyVx?:number;bodyVy?:number;faceSpeedX?:number;faceSpeedY?:number;bodySpeedX?:number;bodySpeedY?:number;visualSource?:'face'|'body';faceHistory?:Face[];recovery?:{face:Face;observed:number}};
const distance=(a:Face,b:Face)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v:number,low:number,high:number)=>Math.max(low,Math.min(high,v));
const observation=(box:Person,now:number)=>box.observed??now;
const visibilityWindow=(track:{ready:boolean;person?:Person;confidence?:number})=>!track.ready&&!track.person&&(track.confidence??1)<.65?350:TRACK_VISIBLE_MS;
const validBox=(box:Person)=>Number.isFinite(box.x)&&Number.isFinite(box.y)&&Number.isFinite(box.w)&&Number.isFinite(box.h)&&box.w>0&&box.h>0;
function predicted(track:FaceTrack,time:number):Face{
 const dt=clamp((time-track.seen)/1000,0,.85);
 return {x:track.x+(track.vx??0)*dt,y:track.y+(track.vy??0)*dt,w:track.w,h:track.h};
}
function lastFace(track:FaceTrack):Face|undefined{
 return track.faceHistory?.at(-1)??Object.values(track.faceSamples??{}).filter((face):face is Face=>!!face).sort((a,b)=>observation(b,-Infinity)-observation(a,-Infinity))[0]??(track.detected!==false?track.measured:undefined);
}
function displayed(track:FaceTrack,now:number):Face{
 const from=track.from??track,elapsed=Math.max(0,now-(track.updated??now));
 const body=track.visualSource==='body'||track.visualSource===undefined&&track.detected===false&&!!track.person;
 const actual=lastFace(track),faceAge=Math.max(0,now-(track.faceSeen??track.observed??track.seen));
 // Keep a still-fresh face through an asynchronous body update, then blend into
 // the inferred head. Both the target and its velocity change continuously.
 const faceWeight=body&&actual?clamp((300-faceAge)/150,0,1):0;
 const mix=(bodyValue:number,faceValue:number)=>bodyValue+(faceValue-bodyValue)*faceWeight;
 const target=actual&&faceWeight?{x:mix(track.x,actual.x),y:mix(track.y,actual.y),w:mix(track.w,actual.w),h:mix(track.h,actual.h)}:track;
 const vx=body?mix(track.bodyVx??track.vx??0,track.faceVx??0):track.faceVx??track.vx??0;
 const vy=body?mix(track.bodyVy??track.vy??0,track.faceVy??0):track.faceVy??track.vy??0;
 const speedX=body?mix(track.bodySpeedX??Math.abs(vx),track.faceSpeedX??Math.abs(vx)):track.faceSpeedX??Math.abs(vx);
 const speedY=body?mix(track.bodySpeedY??Math.abs(vy),track.faceSpeedY??Math.abs(vy)):track.faceSpeedY??Math.abs(vy);
 // Signed motion divided by absolute motion distinguishes a sustained walk from
 // detector noise that reverses direction. This affects artwork only, never matching.
 const coherenceX=clamp(Math.abs(vx)/Math.max(.0001,speedX),0,1),coherenceY=clamp(Math.abs(vy)/Math.max(.0001,speedY),0,1);
 const response=(velocity:number,size:number,coherence:number)=>{
  const motion=clamp((Math.abs(velocity)/Math.max(.02,size)-.35)/1.5,0,1),steady=clamp((coherence-.45)/.5,0,1);
  const fast=motion*steady,slow=body?mix(240,150):150,quick=body?mix(65,55):55,tau=slow+(quick-slow)*fast;
  return 1-Math.exp(-elapsed/tau);
 };
 const alphaX=response(vx,target.w,coherenceX),alphaY=response(vy,target.h,coherenceY),sizeAlpha=1-Math.exp(-elapsed/230);
 // Predict coherent motion through a short gap; noisy motion has almost no lead.
 const age=body?mix(Math.max(0,now-track.seen)/1000,faceAge/1000):Math.max(0,now-track.seen)/1000;
 const lead=age<=.2?age:.2+.18*(1-Math.exp(-(age-.2)/.18));
 const x=target.x+clamp(vx*lead*coherenceX*coherenceX,-target.w*.45,target.w*.45),y=target.y+clamp(vy*lead*coherenceY*coherenceY,-target.h*.45,target.h*.45);
 return {x:from.x+(x-from.x)*alphaX,y:from.y+(y-from.y)*alphaY,w:from.w+(target.w-from.w)*sizeAlpha,h:from.h+(target.h-from.h)*sizeAlpha};
}
// Interpolate at display rate while preserving fresh measured face boxes for avoidance.
export function displayTracks(tracks:FaceTrack[],now:number):FaceTrack[]{
 return tracks.filter(t=>t.visible&&now-t.seen<=visibilityWindow(t)).map(t=>{
  const shown=displayed(t,now),fresh=now-(t.faceSeen??t.observed??t.seen)<=300?lastFace(t):undefined;
  // Actual faces are hard avoidance evidence. A body-derived head is an estimate,
  // so its smoothed position should not shove artwork away from a noisy raw box.
  return {...t,...shown,presence:clamp(1-(now-t.seen-TRACK_HOLD_MS)/TRACK_FADE_MS,0,1),measured:fresh??shown};
 });
}
// Hungarian assignment with an unmatched column per row. Prefer a complete valid
// association before optimizing distances, so one nearest pair cannot strand a neighbour.
function assign(rows:number,columns:number,cost:(row:number,column:number)=>number):Map<number,number>{
 const result=new Map<number,number>();if(!rows||!columns)return result;
 const unmatched=10000,total=columns+rows,u=Array(rows+1).fill(0),v=Array(total+1).fill(0),p=Array(total+1).fill(0),way=Array(total+1).fill(0);
 const costs=Array.from({length:rows},(_,i)=>Array.from({length:columns},(_,j)=>{const n=cost(i,j);return Number.isFinite(n)?Math.min(n,100):1e8;}));
 for(let i=1;i<=rows;i++){
  p[0]=i;let j0=0;const min=Array(total+1).fill(Infinity),used=Array(total+1).fill(false);
  do{
   used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;
   for(let j=1;j<=total;j++)if(!used[j]){const current=(j<=columns?costs[i0-1][j-1]:unmatched)-u[i0]-v[j];if(current<min[j]){min[j]=current;way[j]=j0;}if(min[j]<delta){delta=min[j];j1=j;}}
   for(let j=0;j<=total;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else min[j]-=delta;
   j0=j1;
  }while(p[j0]!==0);
  do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0!==0);
 }
 for(let j=1;j<=columns;j++)if(p[j]&&costs[p[j]-1][j-1]<unmatched)result.set(p[j]-1,j-1);
 return result;
}
function headCost(head:Face,person:Person):number{
 const left=person.x-person.w*.58,top=person.y-person.h*.6;
 if(head.x<left||head.x>person.x+person.w*.58||head.y<top||head.y>person.y+person.h*.12||head.w>person.w*1.15)return Infinity;
 return Math.hypot((head.x-person.x)/person.w,(head.y-(person.y-person.h*.34))/person.h);
}
function headFromPerson(person:Person,offset:HeadOffset):Face{
 let w=offset.w*person.w,h=offset.h*person.h;
 // A torso narrows when somebody turns or lowers their arms. It must not stretch
 // the remembered head into a tall sliver or an oversized face obstacle.
 if(offset.referenceW&&offset.referenceH){
  const scale=clamp(Math.sqrt(w*h/(offset.referenceW*offset.referenceH)),.45,1.6);
  w=offset.referenceW*scale;h=offset.referenceH*scale;
 }else if(offset.aspect&&offset.aspect>0){w=Math.sqrt(w*h*offset.aspect);h=w/offset.aspect;}
 return {x:person.x+offset.x*person.w,y:person.y+offset.y*person.h,w,h};
}
function trackedHeadCost(face:Face,expected:Face):number{
 const widthRatio=face.w/expected.w,heightRatio=face.h/expected.h;
 const dx=Math.abs(face.x-expected.x)/Math.max(.04,expected.w*1.1),dy=Math.abs(face.y-expected.y)/Math.max(.05,expected.h*.8);
 if(widthRatio<.45||widthRatio>2.1||heightRatio<.4||heightRatio>2.4||dx>1||dy>1)return Infinity;
 // Weak detections may refine an already plausible head, but must not relocate
 // it to another shape while stronger body evidence still supports its position.
 if(face.confidence!==undefined&&face.confidence<.65&&(dx>.4||dy>.35||widthRatio<.75||widthRatio>1.35||heightRatio<.75||heightRatio>1.35))return Infinity;
 return Math.hypot(dx,dy)+Math.abs(Math.log(widthRatio))*.3+Math.abs(Math.log(heightRatio))*.15;
}
function offsetFor(face:Face,person:Person):HeadOffset{
 return {x:(face.x-person.x)/person.w,y:(face.y-person.y)/person.h,w:face.w/person.w,h:face.h/person.h,aspect:face.w/face.h,referenceW:face.w,referenceH:face.h};
}
export function matchFaces(previous:FaceTrack[],faces:Face[],now:number,nextId:()=>number,people:Person[]=[]):FaceTrack[]{
 const tracks=previous.filter(t=>now-t.seen<TRACK_RETENTION_MS),heads=faces.filter(validBox),persons=people.filter(p=>validBox(p)&&now-observation(p,now)<TRACK_RETENTION_MS);
 const expectedHead=(track:FaceTrack,person:Person,time:number):Face=>{
  if(!track.headOffset)return predicted(track,time);
  const head=headFromPerson(person,track.headOffset),dt=clamp((time-observation(person,now))/1000,-.25,.25);
  return {...head,x:head.x+clamp((track.bodyVx??0)*dt,-head.w*.45,head.w*.45),y:head.y+clamp((track.bodyVy??0)*dt,-head.h*.45,head.h*.45)};
 };
 const personCost=(person:Person,track:FaceTrack):number=>{
  const time=observation(person,now);
  if(!track.person)return 3+headCost(predicted(track,time),person);
  const age=Math.max(0,(time-(track.bodySeen??track.seen))/1000),dt=Math.min(.85,age);
  const expected={...track.person,x:track.person.x+(track.bodyVx??track.vx??0)*dt,y:track.person.y+(track.bodyVy??track.vy??0)*dt};
  const ratio=person.w/expected.w,heightRatio=person.h/expected.h,gate=Math.min(.35,Math.max(.08,expected.w*.65)+age*.13),d=distance(person,expected);
  if(ratio<.35||ratio>2.8||heightRatio<.35||heightRatio>2.8||d>gate)return Infinity;
  return d/gate+Math.abs(Math.log(ratio))*.2+Math.abs(Math.log(heightRatio))*.2;
 };
 // Remember which visitor already consumed an observation. A delayed crop can
 // otherwise become a second person after the full-view face has moved away.
 const claimedHeads=new Map<number,number>();
 for(let i=0;i<heads.length;i++){
  const face=heads[i];if(face.observed===undefined)continue;
  const claims: {track:number;score:number}[]=[];
  for(let j=0;j<tracks.length;j++){
   const track=tracks[j];if(face.observed>(track.faceSeen??track.observed??track.seen))continue;
   const samples=[...(track.faceHistory??[]),...Object.values(track.faceSamples??{}).filter((sample):sample is Face=>!!sample)];
   let score=Infinity;
   for(const sample of samples){
    if(sample.observed===undefined||Math.abs(sample.observed-face.observed)>40)continue;
    const wr=face.w/sample.w,hr=face.h/sample.h;
    const dx=Math.abs(face.x-sample.x)/Math.max(.005,Math.min(face.w,sample.w)*.35),dy=Math.abs(face.y-sample.y)/Math.max(.005,Math.min(face.h,sample.h)*.35);
    if(wr>=.6&&wr<=1.7&&hr>=.6&&hr<=1.7&&dx<=1&&dy<=1)score=Math.min(score,dx+dy);
   }
   if(Number.isFinite(score))claims.push({track:j,score});
  }
  claims.sort((a,b)=>a.score-b.score);
  if(claims[0]&&(!claims[1]||claims[1].score-claims[0].score>.2))claimedHeads.set(i,claims[0].track);
 }
 // Already-consumed old rows must not occupy an assignment column ahead of a
 // newer face. Cached current observations can still support their owner when
 // there is no plausible replacement in this result.
 const supersededHeads=new Set<number>();
 for(const [i,j] of claimedHeads){
  const face=heads[i],track=tracks[j],latest=track.faceSeen??track.observed??track.seen;
  if(observation(face,now)<latest||heads.some((candidate,k)=>{
   if(k===i||observation(candidate,now)<=latest+15)return false;
   const dt=clamp((observation(candidate,now)-latest)/1000,0,.5);
   const x=face.x+(track.faceVx??0)*dt,y=face.y+(track.faceVy??0)*dt;
   const wr=candidate.w/face.w,hr=candidate.h/face.h;
   return wr>.6&&wr<1.7&&hr>.6&&hr<1.7&&Math.abs(candidate.x-x)<=Math.max(.02,face.w*.75)&&Math.abs(candidate.y-y)<=Math.max(.03,face.h*.65);
  }))supersededHeads.add(i);
 }
 // Face continuity takes precedence over body proposals. In a crowd, a wide or
 // overlapping person box must not force a visible face onto another person's ID.
 const matches=assign(heads.length,tracks.length,(i,j)=>{
  if(supersededHeads.has(i))return Infinity;
  const face=heads[i],track=tracks[j],time=observation(face,now),age=Math.max(0,(time-track.seen)/1000);
  const claimed=claimedHeads.get(i);if(claimed!==undefined)return claimed===j?8:Infinity;
  let expected=predicted(track,time);
  const samples=Object.values(track.faceSamples??{}).filter((sample):sample is Face=>!!sample);
  const last=samples.sort((a,b)=>observation(b,-Infinity)-observation(a,-Infinity))[0];
  if(last&&time-(track.faceSeen??track.observed??track.seen)<=500){
   const dt=clamp((time-observation(last,track.faceSeen??track.seen))/1000,0,.5);
   expected={...last,x:last.x+(track.faceVx??0)*dt,y:last.y+(track.faceVy??0)*dt};
  }
  if(track.person&&now-(track.bodySeen??-Infinity)<=500)return trackedHeadCost(face,expected);
  const ratio=face.w/expected.w,gate=Math.min(.3,Math.max(.065,expected.w*.85)+age*.16),d=distance(face,expected);
  if(ratio<.4||ratio>2.5||d>gate)return Infinity;
  return d/gate+Math.abs(Math.log(ratio))*.2;
 });
 const headPeople=new Map<number,number>(),trackPeople=new Map<number,number>(),usedPeople=new Set<number>();
 const matchedHeads=[...matches.keys()];
 const faceBodies=assign(matchedHeads.length,persons.length,(i,j)=>{
  const head=matchedHeads[i],track=tracks[matches.get(head)!],fit=headCost(heads[head],persons[j]);
  const continuity=track.person?personCost(persons[j],track):0;
  return Number.isFinite(fit)?fit+(Number.isFinite(continuity)?continuity*.15:.8):Infinity;
 });
 for(const [i,p] of faceBodies){const head=matchedHeads[i];headPeople.set(head,p);trackPeople.set(matches.get(head)!,p);usedPeople.add(p);}
 const occupiedTracks=new Set(matches.values()),missingTracks=tracks.map((_,i)=>i).filter(i=>!occupiedTracks.has(i));
 const availablePeople=persons.map((_,i)=>i).filter(i=>!usedPeople.has(i));
 const missingBodies=assign(availablePeople.length,missingTracks.length,(i,j)=>personCost(persons[availablePeople[i]],tracks[missingTracks[j]]));
 for(const [i,j] of missingBodies){const p=availablePeople[i];trackPeople.set(missingTracks[j],p);usedPeople.add(p);}
 // A close approach may outgrow the conservative body-derived head. Only a
 // single unambiguous owner/body may reacquire through this wider path, and two
 // distinct consistent strong observations are required before relocating it.
 const deferredHeads=new Set<number>(),recoveries=new Map<number,FaceTrack['recovery']>();
 if(persons.length===1){
  const owner=[...trackPeople].find(([,p])=>p===0)?.[0],track=owner===undefined?undefined:tracks[owner];
  const competitors=tracks.some((t,i)=>i!==owner&&t.visible&&now-t.seen<=visibilityWindow(t));
  if(track&&owner!==undefined&&!occupiedTracks.has(owner)&&track.ready&&!competitors&&now-(track.faceSeen??track.observed??track.seen)>500&&now-observation(persons[0],now)<=300&&(persons[0].confidence??1)>=.6){
   const candidates=heads.map((face,i)=>({face,i})).filter(({face,i})=>{
    if(matches.has(i)||claimedHeads.has(i)||(face.confidence??0)<.8||now-observation(face,now)>200||!Number.isFinite(headCost(face,persons[0])))return false;
    const w=track.headOffset?.referenceW??track.w,h=track.headOffset?.referenceH??track.h,wr=face.w/w,hr=face.h/h;
    return wr>=.45&&wr<=4&&hr>=.45&&hr<=4&&wr/hr>.7&&wr/hr<1.4&&face.w<=persons[0].w*.7&&face.h<=persons[0].h*.7;
   });
   if(candidates.length===1){
    const {face,i}=candidates[0],time=observation(face,now),prior=track.recovery;
    const consistent=prior&&time>prior.observed+8&&time-prior.observed<=400&&Math.abs(face.x-prior.face.x)<=Math.max(.04,face.w*.35)&&Math.abs(face.y-prior.face.y)<=Math.max(.04,face.h*.35)&&face.w/prior.face.w>.7&&face.w/prior.face.w<1.4;
    if(consistent){matches.set(i,owner);headPeople.set(i,0);occupiedTracks.add(owner);recoveries.set(owner,undefined);}
    else{deferredHeads.add(i);recoveries.set(owner,{face,observed:time});}
   }
  }
 }
 const newHeads=heads.map((_,i)=>i).filter(i=>!matches.has(i)&&!claimedHeads.has(i)&&!deferredHeads.has(i)),newPeople=persons.map((_,i)=>i).filter(i=>!usedPeople.has(i));
 const newBodies=assign(newHeads.length,newPeople.length,(i,j)=>headCost(heads[newHeads[i]],persons[newPeople[j]]));
 for(const [i,j] of newBodies){headPeople.set(newHeads[i],newPeople[j]);usedPeople.add(newPeople[j]);}
 const personTracks=new Map([...trackPeople].map(([track,person])=>[person,track]));
 const matchedTracks=new Set(matches.values()),result:FaceTrack[]=[];
 const update=(old:FaceTrack|undefined,face:Face|undefined,person:Person|undefined):FaceTrack=>{
  const oldFaceTime=old?.faceSeen??old?.observed??old?.seen??-Infinity,oldBodyTime=old?.bodySeen??-Infinity;
  const incomingFaceTime=face?observation(face,now):-Infinity,incomingBodyTime=person?observation(person,now):-Infinity;
  const currentFace=face&&incomingFaceTime>=oldFaceTime?face:undefined;
  const currentPerson=person&&incomingBodyTime>=oldBodyTime?person:old?.person;
  const faceTime=Math.max(oldFaceTime,incomingFaceTime),bodyTime=Math.max(oldBodyTime,incomingBodyTime);
  const freshFace=!!currentFace&&incomingFaceTime>oldFaceTime,freshBody=!!person&&incomingBodyTime>oldBodyTime;
  const seen=Math.max(old?.seen??-Infinity,incomingFaceTime,incomingBodyTime);
  const continuous=!!old&&seen-old.seen<=(visibilityWindow(old)===350?500:TRACK_VISIBLE_MS),since=continuous?old.since:seen;
  const activated=continuous&&old!.ready||seen-since>=2000,visible=now-seen<=visibilityWindow({ready:!!activated,person:currentPerson,confidence:currentFace?.confidence??old?.confidence});
  if(old&&!freshFace&&!freshBody)return {...old,visible,ready:old.ready&&visible,detected:!!currentFace&&now-faceTime<=300};
  let faceVx=old?.faceVx??0,faceVy=old?.faceVy??0,bodyVx=old?.bodyVx??faceVx,bodyVy=old?.bodyVy??faceVy;
  let faceSpeedX=old?.faceSpeedX??0,faceSpeedY=old?.faceSpeedY??0,bodySpeedX=old?.bodySpeedX??0,bodySpeedY=old?.bodySpeedY??0;
  let faceSamples=old?.faceSamples,faceHistory=old?.faceHistory;
  if(freshFace&&currentFace){
   faceHistory=[...(faceHistory??[]).filter(sample=>incomingFaceTime-observation(sample,oldFaceTime)<=450),{...currentFace,observed:incomingFaceTime}].slice(-16);
   const source=currentFace.source??'unknown',sample=old?.faceSamples?.[source];
   if(sample){
    const dt=Math.max(.025,(incomingFaceTime-observation(sample,oldFaceTime))/1000),weight=Math.min(.5,dt/.1);
    faceVx=clamp((currentFace.x-sample.x)/dt*weight+faceVx*(1-weight),-.8,.8);
    faceVy=clamp((currentFace.y-sample.y)/dt*weight+faceVy*(1-weight),-.8,.8);
    faceSpeedX=Math.min(.8,Math.abs((currentFace.x-sample.x)/dt))*weight+faceSpeedX*(1-weight);
    faceSpeedY=Math.min(.8,Math.abs((currentFace.y-sample.y)/dt))*weight+faceSpeedY*(1-weight);
   }
   faceSamples={...faceSamples,[source]:currentFace};
  }
  if(freshBody&&currentPerson&&old?.person&&Number.isFinite(oldBodyTime)){
   const dt=Math.max(.05,(incomingBodyTime-oldBodyTime)/1000),weight=Math.min(.4,dt/.3);
   bodyVx=clamp((currentPerson.x-old.person.x)/dt*weight+bodyVx*(1-weight),-.8,.8);
   bodyVy=clamp((currentPerson.y-old.person.y)/dt*weight+bodyVy*(1-weight),-.8,.8);
   bodySpeedX=Math.min(.8,Math.abs((currentPerson.x-old.person.x)/dt))*weight+bodySpeedX*(1-weight);
   bodySpeedY=Math.min(.8,Math.abs((currentPerson.y-old.person.y)/dt))*weight+bodySpeedY*(1-weight);
  }
  let offset=old?.headOffset;
  if(offset&&!offset.referenceW){
   const reference=Object.values(old?.faceSamples??{}).filter((sample):sample is Face=>!!sample).sort((a,b)=>observation(b,-Infinity)-observation(a,-Infinity))[0];
   if(reference)offset={...offset,aspect:reference.w/reference.h,referenceW:reference.w,referenceH:reference.h};
  }
  if(freshFace&&currentFace&&currentPerson&&Math.abs(incomingFaceTime-bodyTime)<=200&&(!offset||currentFace.confidence===undefined||currentFace.confidence>=.7)){
   // Body inference runs less often than faces. Align its source time before
   // learning the head offset, otherwise walking gets baked into that offset.
   const dt=(incomingFaceTime-bodyTime)/1000;
   const aligned={...currentPerson,x:currentPerson.x+clamp(bodyVx*dt,-currentFace.w*.45,currentFace.w*.45),y:currentPerson.y+clamp(bodyVy*dt,-currentFace.h*.45,currentFace.h*.45)};
   offset=offsetFor(currentFace,aligned);
  }
  else if(!offset&&old&&currentPerson)offset=offsetFor(predicted(old,bodyTime),currentPerson);
  let anchor:Face=old??currentFace!,visualSource=old?.visualSource??'face';
  if(currentFace&&incomingFaceTime>=(old?.seen??-Infinity)){anchor=currentFace;visualSource='face';}
  if(currentPerson&&offset&&bodyTime>Math.max(incomingFaceTime,old?.seen??-Infinity)){anchor=headFromPerson(currentPerson,offset);visualSource='body';}
  // Face and person workers observe different boxes at different times. Estimate
  // their motion independently; the short gap between their results is not a frame interval.
  const bodySupported=!!currentPerson&&now-bodyTime<=500;
  const vx=bodySupported?bodyVx:faceVx,vy=bodySupported?bodyVy:faceVy;
  return {...old,...(currentFace??{}),...anchor,id:old?.id??nextId(),since,seen,ready:visible&&(continuous&&old!.ready||seen-since>=2000),visible,detected:!!currentFace&&now-faceTime<=300,
   observed:faceTime,faceSeen:faceTime,bodySeen:Number.isFinite(bodyTime)?bodyTime:undefined,person:currentPerson,headOffset:offset,
   from:old&&continuous?displayed(old,now):anchor,updated:now,vx,vy,faceVx,faceVy,bodyVx,bodyVy,faceSpeedX,faceSpeedY,bodySpeedX,bodySpeedY,visualSource,faceSamples,faceHistory,measured:currentFace??{x:anchor.x,y:anchor.y,w:anchor.w,h:anchor.h}};
 };
 for(let i=0;i<heads.length;i++){
  const trackIndex=matches.get(i),old=trackIndex===undefined?undefined:tracks[trackIndex];
  if(!old&&(claimedHeads.has(i)||deferredHeads.has(i)))continue;
  const personIndex=headPeople.get(i)??(trackIndex===undefined?undefined:trackPeople.get(trackIndex));
  if(!old&&!(personIndex!==undefined&&!personTracks.has(personIndex))){
   const face=heads[i];
   // Do not promote rejected detections on an owned torso, or duplicate detections
   // around its head, to new visitors. A separate person box always remains eligible.
   const onOwnedPerson=[...personTracks].some(([p,t])=>{
    const person=persons[p],head=expectedHead(tracks[t],person,observation(face,now));
    const inside=Math.abs(face.x-person.x)<=person.w*.65&&Math.abs(face.y-person.y)<=person.h*.65;
    const duplicate=Math.abs(face.x-head.x)<Math.min(face.w,head.w)*.3&&Math.abs(face.y-head.y)<Math.min(face.h,head.h)*.3;
    return inside&&(duplicate||face.confidence!==undefined&&(face.confidence<.65||face.y>head.y+head.h*.7&&face.confidence<.8));
   });
   if(onOwnedPerson)continue;
  }
  result.push(update(old,heads[i],personIndex===undefined?undefined:persons[personIndex]));
 }
 for(let i=0;i<tracks.length;i++)if(!matchedTracks.has(i)){
  const personIndex=trackPeople.get(i),track=tracks[i];
  if(personIndex!==undefined)result.push(update(track,undefined,persons[personIndex]));
  else{const visible=now-track.seen<=visibilityWindow(track);result.push({...track,visible,ready:track.ready&&visible,detected:false});}
 }
 return result.map(track=>{
  const index=tracks.findIndex(old=>old.id===track.id);
  if(recoveries.has(index))return {...track,recovery:recoveries.get(index)};
  return track.recovery&&now-track.recovery.observed>400?{...track,recovery:undefined}:track;
 });
}
export function centreCandidate(tracks:FaceTrack[],previous:number|null):FaceTrack|undefined{
 const eligible=tracks.filter(t=>t.visible&&t.x>.3&&t.x<.7&&t.y>.08&&t.y<.78&&t.w>.045);
 const score=(t:FaceTrack)=>Math.abs(t.x-.5)+Math.abs(t.y-.38)*.12;
 eligible.sort((a,b)=>score(a)-score(b));
 const existing=eligible.find(t=>t.id===previous);
 return existing&&(!eligible[0]||score(existing)<score(eligible[0])+.045)?existing:eligible[0];
}
export function captureTrackSafe(tracks:FaceTrack[],id:number):boolean{
 const person=tracks.find(t=>t.id===id&&t.visible&&t.ready&&t.detected!==false);if(!person)return false;
 return !tracks.some(t=>t.id!==id&&t.visible&&Math.abs(t.x-person.x)<(t.w+person.w)*.4&&Math.abs(t.y-person.y)<(t.h+person.h)*.4);
}
// Visual/body continuity never authorizes a photograph without a fresh face observation.
export function captureGroupReady(tracks:FaceTrack[],now?:number):boolean{
 return tracks.some(t=>{
  const measured=t.measured??t;
  return t.visible&&t.ready&&t.detected!==false&&(now===undefined||now-(t.faceSeen??t.observed??t.seen)<=300)&&measured.x-measured.w/2>=0&&measured.x+measured.w/2<=1&&measured.y-measured.h/2>=0&&measured.y+measured.h/2<=1;
 });
}
