import type {Face} from './presence';
export const TRACK_HOLD_MS=450;
const TRACK_RETENTION_MS=1200;
export type FaceTrack=Face & {id:number;since:number;seen:number;ready:boolean;visible:boolean;detected?:boolean;observed?:number;from?:Face;updated?:number;vx?:number;vy?:number;measured?:Face};
const distance=(a:Face,b:Face)=>Math.hypot(a.x-b.x,a.y-b.y);
function displayed(track:FaceTrack,now:number):Face{
 const from=track.from??track,alpha=1-Math.exp(-Math.max(0,now-(track.updated??now))/65);
 return {x:from.x+(track.x-from.x)*alpha,y:from.y+(track.y-from.y)*alpha,w:from.w+(track.w-from.w)*alpha,h:from.h+(track.h-from.h)*alpha};
}
// Interpolate at display rate rather than stepping the artwork at detector rate.
// The measured box is retained for conservative face avoidance.
export function displayTracks(tracks:FaceTrack[],now:number):FaceTrack[]{
 return tracks.filter(t=>t.visible&&now-t.seen<=TRACK_HOLD_MS).map(t=>({...t,...displayed(t,now),measured:{x:t.x,y:t.y,w:t.w,h:t.h}}));
}
export function matchFaces(previous:FaceTrack[],faces:Face[],now:number,nextId:()=>number):FaceTrack[]{
 const available=new Set(previous.filter(t=>now-t.seen<TRACK_RETENTION_MS)),matches=new Map<number,FaceTrack>();
 // Predict only a short distance. Matching is independent of detector ordering.
 const pairs=faces.flatMap((face,i)=>[...available].map(track=>{
  const dt=Math.min(.18,Math.max(0,(now-track.seen)/1000));
  const predicted={...track,x:track.x+(track.vx??0)*dt,y:track.y+(track.vy??0)*dt};
  return {i,track,d:distance(face,predicted)};
 })).filter(p=>p.d<Math.min(.2,Math.max(.065,p.track.w*.85)+(now-p.track.seen)*.00008)&&faces[p.i].w/p.track.w>.5&&faces[p.i].w/p.track.w<2)
 .sort((a,b)=>a.d-b.d);
 for(const p of pairs)if(available.has(p.track)&&!matches.has(p.i)){matches.set(p.i,p.track);available.delete(p.track);}
 const result=faces.map((face,i)=>{
  const old=matches.get(i),seen=face.observed??now;
  if(old&&seen<=old.seen)return {...old,visible:now-old.seen<=TRACK_HOLD_MS};
  const continuous=old&&seen-old.seen<=TRACK_HOLD_MS,since=continuous?old.since:seen,dt=old?Math.max(.016,(seen-old.seen)/1000):1;
  return {...face,id:old?.id??nextId(),since,seen,ready:seen-since>=2000,visible:now-seen<=TRACK_HOLD_MS,detected:true,
   from:old&&continuous?displayed(old,now):face,updated:now,
   vx:old?Math.max(-.6,Math.min(.6,(face.x-old.x)/dt*.5+(old.vx??0)*.5)):0,
   vy:old?Math.max(-.6,Math.min(.6,(face.y-old.y)/dt*.5+(old.vy??0)*.5)):0};
 });
 return [...result,...[...available].map(t=>{const visible=now-t.seen<=TRACK_HOLD_MS;return {...t,visible,ready:t.ready&&visible,detected:false};})];
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
// Visual grace never authorizes a photograph from a stale detector result.
export function captureGroupReady(tracks:FaceTrack[],now?:number):boolean{
 return tracks.some(t=>t.visible&&t.ready&&t.detected!==false&&(now===undefined||now-(t.observed??t.seen)<=300)&&t.x-t.w/2>=0&&t.x+t.w/2<=1&&t.y-t.h/2>=0&&t.y+t.h/2<=1);
}
