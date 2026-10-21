import type {FaceTrack} from './faceTracking';
export type Rect={x:number;y:number;width:number;height:number};
export type ThoughtBody=Rect & {key:string;owner:number;phrase:number;vx:number;vy:number;ax:number;ay:number;squash:number;squashVelocity?:number;shapeTime?:number;renderX?:number;renderY?:number;opacity?:number;visible:boolean};
export type World={bodies:ThoughtBody[];time:number;width:number;height:number;accumulator?:number;layoutAt?:number;layoutFaces?:FaceTrack[];signature?:string;layoutVersion?:number};
export const intersects=(a:Rect,b:Rect,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function faceObstacle(f:FaceTrack,width:number,height:number):Rect{
 // Smooth clearance absorbs small detector jumps; the raw face itself stays protected.
 const m=f.measured??f,left=Math.min(f.x-f.w*.65,m.x-m.w*.5),top=Math.min(f.y-f.h*.66,m.y-m.h*.5);
 return {x:left*width,y:top*height,width:(Math.max(f.x+f.w*.65,m.x+m.w*.5)-left)*width,height:(Math.max(f.y+f.h*.66,m.y+m.h*.5)-top)*height};
}
function deform(body:ThoughtBody,impulse:number){body.squashVelocity=clamp((body.squashVelocity??0)+impulse,-1.2,1.2);}
function pushOut(body:ThoughtBody,other:Rect,gap:number){
 if(!intersects(body,other,gap))return;
 const dx=body.x+body.width/2-other.x-other.width/2,dy=body.y+body.height/2-other.y-other.height/2;
 const px=(body.width+other.width)/2+gap-Math.abs(dx),py=(body.height+other.height)/2+gap-Math.abs(dy),horizontal=px<py,sign=(horizontal?dx:dy)>=0?1:-1;
 if(horizontal){body.x+=sign*(px+.001);if(body.vx*sign<0)body.vx=0;}else{body.y+=sign*(py+.001);if(body.vy*sign<0)body.vy=0;}
}
// Low restitution dissipates energy instead of continually exciting the springs.
export function resolveContact(a:ThoughtBody,b:ThoughtBody,gap=0,animate=true){
 if(!intersects(a,b,gap))return;
 const dx=a.x+a.width/2-b.x-b.width/2,dy=a.y+a.height/2-b.y-b.height/2;
 const px=(a.width+b.width)/2+gap-Math.abs(dx),py=(a.height+b.height)/2+gap-Math.abs(dy),horizontal=px<py,nx=horizontal?(dx>=0?1:-1):0,ny=horizontal?0:(dy>=0?1:-1);
 const ia=1/(a.width*a.height),ib=1/(b.width*b.height),total=ia+ib,depth=(horizontal?px:py)+.001;
 a.x+=nx*depth*ia/total;a.y+=ny*depth*ia/total;b.x-=nx*depth*ib/total;b.y-=ny*depth*ib/total;
 const closing=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(!animate||closing>=0)return;
 const impulse=-(1+.16)*closing/total;
 a.vx+=impulse*ia*nx;a.vy+=impulse*ia*ny;b.vx-=impulse*ib*nx;b.vy-=impulse*ib*ny;
 const amount=(horizontal?1:-1)*Math.min(.7,-closing/Math.min(a.width,b.width)*2);deform(a,amount);deform(b,amount);
}
function plan(previous:World|undefined,active:FaceTrack[],obstacles:Rect[],width:number,height:number,bounds:Rect,gap:number,print:boolean):ThoughtBody[]{
 const wide=width>height,perPerson=active.length<=2?3:2,placed:ThoughtBody[]=[],old=new Map(previous?.bodies.map(b=>[b.key,b])??[]);
 const slots=Array.from({length:perPerson},(_,i)=>active.map(face=>({face,i,key:`${face.id}:${i}`}))).flat();
 // Reserve surviving thoughts first. New arrivals get a first thought before extras.
 const reserved=new Map<string,Rect>();
 for(const {key,i} of slots){const body=old.get(key);if(i>0||!body)continue;const anchor={x:body.ax,y:body.ay,width:body.width,height:body.height};
  if(anchor.x>=bounds.x&&anchor.y>=bounds.y&&anchor.x+anchor.width<=bounds.x+bounds.width&&anchor.y+anchor.height<=bounds.y+bounds.height&&!obstacles.some(o=>intersects(anchor,o,gap))&&![...reserved.values()].some(o=>intersects(anchor,o,gap)))reserved.set(key,anchor);
 }
 for(const {face,i,key} of slots){
  const existing=old.get(key);let best=reserved.get(key);
  if(!best){
   const base=width*(wide?(active.length===1?(i>=2&&!print?.245:.275):active.length===2?.225:.17):.35);
   const occupied=[...obstacles,...[...reserved].filter(([k])=>k!==key).map(([,r])=>r),...placed.map(b=>({x:b.ax,y:b.ay,width:b.width,height:b.height}))];
   // Search only on a layout change. Distance to the old anchor prevents slot swaps.
   for(const scale of [1,.88,.76]){
    const w=base*scale,h=Math.min(w*.62,height*(wide?(i>=2&&!print?.24:.265):.205));
    const targetX=face.x*width+(i%2?1:-1)*(face.w*width/2+w*.62),targetY=face.y*height+(i<2?-1:1)*h*.7;
    let cost=Infinity;
    const columns=active.length>=5?24:40,rows=active.length>=5?16:28;
    const xs=[existing?.ax,...Array.from({length:columns+1},(_,n)=>bounds.x+n*(bounds.width-w)/columns)].filter((x):x is number=>x!==undefined);
    const ys=[existing?.ay,...Array.from({length:rows+1},(_,n)=>bounds.y+n*(bounds.height-h)/rows)].filter((y):y is number=>y!==undefined);
    for(const y of ys)for(const x of xs){
     if(x<bounds.x||y<bounds.y||x+w>bounds.x+bounds.width||y+h>bounds.y+bounds.height)continue;
     const candidate={x,y,width:w,height:h};if(occupied.some(o=>intersects(candidate,o,gap)))continue;
     const score=Math.hypot((x+w/2-targetX)/width,(y+h/2-targetY)/height)+(existing?Math.hypot(x-existing.ax,y-existing.ay)/width*1.8:0);
     if(score<cost){best=candidate;cost=score;}
    }
    if(best)break;
   }
  }
  if(!best)continue;
  const sameSize=existing&&Math.abs(existing.width-best.width)<1;
  // Extras yield their old positions to a new person's first thought.
  const keepPosition=sameSize&&!obstacles.some(o=>intersects(existing,o,gap))&&!placed.some(o=>intersects(existing,o,gap));
  placed.push({...best,key,owner:face.id,phrase:existing?.phrase??i+(face.id-1)*3,ax:best.x,ay:best.y,
   x:keepPosition?existing.x:best.x,y:keepPosition?existing.y:best.y,vx:keepPosition?existing.vx:0,vy:keepPosition?existing.vy:0,squash:existing?.squash??0,squashVelocity:existing?.squashVelocity??0,opacity:keepPosition?existing.opacity??0:0,visible:true});
 }
 return placed;
}
export function stepWorld(previous:World|undefined,faces:FaceTrack[],width:number,height:number,now:number,reduced=false,print=false):World{
 const valid=previous?.width===width&&previous.height===height?previous:undefined;
 const margin=width*.022,gap=width*.014,bounds={x:margin,y:height*(print?.035:.1),width:width-2*margin,height:height*(print?.93:.79)};
 const obstacles=faces.filter(f=>f.visible).map(f=>faceObstacle(f,width,height)),active=faces.filter(f=>f.visible&&f.ready).sort((a,b)=>a.id-b.id).slice(0,8);
 const signature=`${print}:${active.map(f=>f.id).join(',')}`;
 const blockedAnchor=valid?.bodies.some(b=>obstacles.some(o=>intersects({x:b.ax,y:b.ay,width:b.width,height:b.height},o,gap)));
 const moved=faces.some(f=>{const old=valid?.layoutFaces?.find(t=>t.id===f.id);return !old||Math.hypot(f.x-old.x,f.y-old.y)>.075;});
 const replan=!valid||valid.signature!==signature||((blockedAnchor||moved)&&now-(valid.layoutAt??0)>=120);
 const bodies=replan?plan(valid,active,obstacles,width,height,bounds,gap,print):valid.bodies.map(b=>({...b}));
 const elapsed=Math.min(.05,Math.max(0,(now-(valid?.time??now))/1000)),fixed=1/120;
 let accumulator=(valid?.accumulator??0)+elapsed;
 while(accumulator+1e-9>=fixed){
  for(const b of bodies){
   if(reduced){b.x=b.ax;b.y=b.ay;b.vx=b.vy=b.squash=0;b.squashVelocity=0;continue;}
   const phase=b.owner*1.7+b.phrase*2.1;
   b.vx+=((b.ax+Math.sin(now/3200+phase)*width*.002-b.x)*28-b.vx*11)*fixed;
   b.vy+=((b.ay+Math.cos(now/3700+phase)*height*.0025-b.y)*28-b.vy*11)*fixed;
   const limit=width*.18,speed=Math.hypot(b.vx,b.vy);if(speed>limit){b.vx*=limit/speed;b.vy*=limit/speed;}
   b.x+=b.vx*fixed;b.y+=b.vy*fixed;
   b.squashVelocity=((b.squashVelocity??0)-b.squash*100*fixed)*Math.exp(-fixed*9);
   b.squash=clamp(b.squash+b.squashVelocity*fixed,-.055,.055);
  }
  accumulator-=fixed;
 }
 // Project constraints every display frame, even when no fixed tick elapsed.
 for(let pass=0;pass<6;pass++)for(let i=0;i<bodies.length;i++){
  const b=bodies[i];if(reduced){b.x=b.ax;b.y=b.ay;b.vx=b.vy=b.squash=0;b.squashVelocity=0;}
  for(let j=0;j<i;j++)resolveContact(b,bodies[j],gap,!reduced);
  for(const obstacle of obstacles)pushOut(b,obstacle,gap);
  const x=clamp(b.x,bounds.x,bounds.x+bounds.width-b.width),y=clamp(b.y,bounds.y,bounds.y+bounds.height-b.height);
  if(x!==b.x)b.vx=0;if(y!==b.y)b.vy=0;b.x=x;b.y=y;
 }
 const visible:Rect[]=[];
 for(const b of bodies){
  let blocked=obstacles.some(o=>intersects(b,o,gap*.45))||visible.some(o=>intersects(b,o,gap*.45));
  if(blocked){
   // Recover only the trapped thought. Never teleport the whole group.
   const anchor={x:b.ax,y:b.ay,width:b.width,height:b.height};
   if(!obstacles.some(o=>intersects(anchor,o,gap*.45))&&!bodies.some(o=>o!==b&&intersects(anchor,o,gap*.45))){b.x=b.ax;b.y=b.ay;b.vx=b.vy=0;b.opacity=0;blocked=false;}
  }
  b.visible=!blocked;
  b.opacity=blocked?0:reduced?1:Math.min(1,(b.opacity??0)+elapsed/0.32);
  b.shapeTime=reduced?0:now/1000;
  // Fill display refreshes between fixed ticks, including 144/165 Hz panels.
  // The small extrapolation stays inside the reserved collision clearance.
  const projected={...b,x:clamp(b.x+b.vx*Math.max(0,accumulator),bounds.x,bounds.x+bounds.width-b.width),y:clamp(b.y+b.vy*Math.max(0,accumulator),bounds.y,bounds.y+bounds.height-b.height)};
  const safe=!obstacles.some(o=>intersects(projected,o,gap*.2))&&!bodies.some(o=>o!==b&&intersects(projected,o,gap*.2));
  b.renderX=reduced||!safe?b.x:projected.x;b.renderY=reduced||!safe?b.y:projected.y;
  if(b.visible)visible.push(b);
 }
 return {bodies,time:now,width,height,accumulator,signature,layoutAt:replan?now:valid.layoutAt,layoutFaces:replan?faces.map(f=>({...f})):valid.layoutFaces,layoutVersion:(valid?.layoutVersion??0)+(replan?1:0)};
}
