export type Face={x:number;y:number;w:number;h:number;confidence?:number;source?:'full'|'tile'};
export type Presence={since:number|null;last:Face|null;ready:boolean};
export function updatePresence(previous:Presence,face:Face|null,now:number):Presence {
 if(!face)return {since:null,last:null,ready:false};
 const moved=previous.last&&Math.hypot(face.x-previous.last.x,face.y-previous.last.y)>Math.max(.13,previous.last.w*.8);
 const since=previous.since===null||moved?now:previous.since;
 return {since,last:face,ready:now-since>=2000};
}
