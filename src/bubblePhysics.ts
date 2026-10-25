import type {FaceTrack} from './faceTracking';
export type Rect={x:number;y:number;width:number;height:number};
export type ThoughtBody=Rect & {key:string;owner:number;phrase:number;vx:number;vy:number;ax:number;ay:number;squash:number;squashVelocity?:number;shapeTime?:number;renderX?:number;renderY?:number;opacity?:number;ownerFace?:FaceTrack;retiring?:boolean;visible:boolean};
export type World={bodies:ThoughtBody[];time:number;width:number;height:number;accumulator?:number;layoutAt?:number;layoutFaces?:FaceTrack[];signature?:string;layoutVersion?:number};
export const intersects=(a:Rect,b:Rect,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function faceObstacle(f:FaceTrack,width:number,height:number):Rect{
 // Smooth clearance absorbs small detector jumps; the raw face itself stays protected.
 const m=f.measured??f,left=Math.min(f.x-f.w*.65,m.x-m.w*.5),top=Math.min(f.y-f.h*.8,m.y-m.h*.65);
 return {x:left*width,y:top*height,width:(Math.max(f.x+f.w*.65,m.x+m.w*.5)-left)*width,height:(Math.max(f.y+f.h*.66,m.y+m.h*.5)-top)*height};
}
export function faceObstacles(f:FaceTrack,width:number,height:number):Rect[]{
 const displayed=faceObstacle({...f,measured:undefined},width,height);
 const measured=f.measured;
 // A returning face can be far from the old body-based estimate. Both heads
 // stay protected, without filling the empty corridor between them with a box.
 return measured?[displayed,{x:(measured.x-measured.w*.5)*width,y:(measured.y-measured.h*.65)*height,width:measured.w*width,height:measured.h*1.15*height}]:[displayed];
}
function deform(body:ThoughtBody,impulse:number){body.squashVelocity=clamp((body.squashVelocity??0)+impulse,-1.2,1.2);}
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
function inside(rect:Rect,bounds:Rect){return rect.x>=bounds.x&&rect.y>=bounds.y&&rect.x+rect.width<=bounds.x+bounds.width+.001&&rect.y+rect.height<=bounds.y+bounds.height+.001;}
// Bound the distance to the head, not just a soft preference in a screen-wide search.
function nearHead(rect:Rect,face:FaceTrack,width:number,height:number){
 const measured=face.measured??face;
 // Proximity and collision avoidance must use the same head envelope. During
 // movement a fresh measured head may lead its smoothly displayed position.
 const left=Math.min(face.x-face.w*.5,measured.x-measured.w*.5)*width,right=Math.max(face.x+face.w*.5,measured.x+measured.w*.5)*width;
 const upper=Math.min(face.y-face.h*.6,measured.y-measured.h*.6)*height,lower=Math.max(face.y,measured.y)*height;
 const distance=Math.hypot(Math.max(rect.x-right,0,left-rect.x-rect.width),Math.max(rect.y-lower,0,upper-rect.y-rect.height));
 // At the top boundary there may be no room for the preferred raised centre.
 // An upper-side thought may align with the head centre; full head clearance
 // still applies, including the raw measured box during prediction/smoothing.
 const upperSideAtEdge=rect.y<=height*.1+.001&&(rect.x+rect.width<=left||rect.x>=right);
 const ceiling=upperSideAtEdge?Math.max(face.y*height,height*.025+width*.075*.62/2):(face.y-face.h*.15)*height;
 return distance<=clamp(Math.max(face.w,measured.w)*width*.6,width*.03,width*.075)+.001&&rect.y+rect.height/2<=ceiling+.001;
}
function transported(body:ThoughtBody,face:FaceTrack,width:number,height:number){
 const dx=(face.x-(body.ownerFace?.x??face.x))*width,dy=(face.y-(body.ownerFace?.y??face.y))*height;
 return {...body,x:body.x+dx,y:body.y+dy,ax:body.ax+dx,ay:body.ay+dy};
}
function plan(previous:World|undefined,active:FaceTrack[],obstacles:Rect[],width:number,height:number,bounds:Rect,gap:number,density=1,retry=false,preferOld=true):ThoughtBody[]{
 const wide=width>height,placed:ThoughtBody[]=[],old=new Map(previous?.bodies.map(b=>[b.key,b])??[]);
 // Primary thoughts always have priority. Extras are optional and stay local.
 const ordered=[...active].sort((a,b)=>a.x-b.x||a.id-b.id);
 const perPerson=active.length===1?4:active.length===2?3:2;
 const slots=Array.from({length:perPerson},(_,i)=>ordered.map(face=>({face,i,key:`${face.id}:${i}`}))).flat();
 const usedPhrases=new Set<number>(),reservedPhrases=new Map<string,number>();
 for(const {key} of slots){const prior=old.get(key);if(prior&&!usedPhrases.has(prior.phrase)){usedPhrases.add(prior.phrase);reservedPhrases.set(key,prior.phrase);}}
 for(const {face,i,key} of slots){
  const prior=old.get(key),existing=prior?transported(prior,face,width,height):undefined;
  const occupied=[...obstacles,...placed.map(b=>({x:b.ax,y:b.ay,width:b.width,height:b.height}))];
  const safe=(rect:Rect,clearance=gap)=>inside(rect,bounds)&&nearHead(rect,face,width,height)&&!occupied.some(o=>intersects(rect,o,Math.max(0,clearance-.001)));
  let best:Rect|undefined;
  const anchor=existing&&{x:existing.ax,y:existing.ay,width:existing.width,height:existing.height};
  // Keeping a safe offset means it moves with the person on every display frame.
  if(!retry&&anchor&&safe(anchor,gap*.6))best=anchor;
  // Recover a few pixels of clearance locally before considering another slot.
  // The reserved gap absorbs small box changes without moving the anchor at all.
  if(!retry&&!best&&anchor){
   for(const clearance of [gap,gap*.05]){
    const xs=[clamp(anchor.x,bounds.x,bounds.x+bounds.width-anchor.width),...occupied.flatMap(o=>[o.x-anchor.width-clearance,o.x+o.width+clearance])];
    const ys=[clamp(anchor.y,bounds.y,bounds.y+bounds.height-anchor.height),...occupied.flatMap(o=>[o.y-anchor.height-clearance,o.y+o.height+clearance])];
    const nearby=xs.flatMap(x=>ys.map(y=>({...anchor,x,y}))).filter(candidate=>Math.hypot(candidate.x-anchor.x,candidate.y-anchor.y)<=width*.045&&safe(candidate,clearance*.6));
    nearby.sort((a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)-Math.hypot(b.x-anchor.x,b.y-anchor.y));
    best=nearby[0];if(best)break;
   }
  }
  if(!retry&&!best&&anchor){
   // Fit a constrained edge in small fixed size steps, with spare clearance.
   // Sizes only decrease, so jitter cannot repeatedly resize/rasterize the text.
   const quantum=Math.max(2,width*.0025),minimum=width*(wide?.075:.2);
   for(let w=Math.floor((anchor.width-.001)/quantum)*quantum;w>=minimum;w-=quantum){
    const h=anchor.height*w/anchor.width;
    const candidates=[.5,0,1].flatMap(horizontal=>[.5,0,1].map(vertical=>({x:clamp(anchor.x+(anchor.width-w)*horizontal,bounds.x,bounds.x+bounds.width-w),y:clamp(anchor.y+(anchor.height-h)*vertical,bounds.y,bounds.y+bounds.height-h),width:w,height:h})));
    const fitting=candidates.filter(candidate=>safe(candidate,gap*.05));
    fitting.sort((a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)-Math.hypot(b.x-anchor.x,b.y-anchor.y));
    if(fitting.length){best=fitting[0];break;}
   }
  }
  const desired=width*(wide?Math.min(active.length<=2?.22:.17,.86/active.length):.36)*(i?.82:1)*density;
  const base=existing?Math.min(desired,existing.width):desired,head=faceObstacle(face,width,height),cx=face.x*width;
  const oldSide=existing&&Math.abs(existing.x+existing.width/2-cx)>face.w*width*.4?Math.sign(existing.x+existing.width/2-cx):0;
  // A smaller thought on the established side is preferable to a large thought
  // jumping across its owner. Existing artwork never grows just to change slots.
  for(const preserveSide of best?[]:oldSide&&preferOld?[true,false]:[false]){
   const minimum=width*(wide?.075:.2),quantum=Math.max(2,width*.0025);
   const widths=[...[1,.9,.8,.7,.6,.5].map(scale=>base*scale),minimum,
    Math.floor((head.x-gap-bounds.x)/quantum)*quantum,
    Math.floor((bounds.x+bounds.width-head.x-head.width-gap)/quantum)*quantum
   ].filter(w=>w>=minimum&&w<=base+.001).sort((a,b)=>b-a);
   for(const w of new Set(widths)){
   const h=Math.min(w*.62,height*.23),top=head.y-gap-h;
   const candidates=[
    ...[0,-.25,.25,-.5,.5,-.75,.75,-1,1].map(offset=>({x:cx-w/2+offset*(w+gap),y:top})),
    ...[head.y-h*.8,head.y-h*.4,(face.y-face.h*.15)*height-h/2].flatMap(y=>[{x:head.x-gap-w,y},{x:head.x+head.width+gap,y}])
   ].map(p=>({x:clamp(p.x,bounds.x,bounds.x+bounds.width-w),y:clamp(p.y,bounds.y,bounds.y+bounds.height-h),width:w,height:h}));
   let cost=Infinity;
   for(const candidate of candidates){
    if(preserveSide&&Math.sign(candidate.x+w/2-cx)!==oldSide||!safe(candidate))continue;
    const clusterBias=retry&&active.length===1&&!old.has(`${face.id}:0`)?candidate.y-bounds.y:0;
    const score=Math.hypot(candidate.x+w/2-cx,(candidate.y+h/2-(face.y-face.h*.6)*height)*1.1)+(preferOld&&existing?Math.hypot(candidate.x-existing.ax,candidate.y-existing.ay)*.65:0)+(retry&&!preferOld&&candidate.x>cx?.001:0)+clusterBias;
    if(score<cost){best=candidate;cost=score;}
   }
   if(best)break;
   }
   if(best)break;
  }
  if(!best)continue;
  // Optional thoughts can yield space as the head grows or the crowd changes.
  // Fade them beside their owner instead of teleporting an opaque shell to a
  // distant slot. The primary thought always keeps priority and continuity.
  if(existing&&i>0&&Math.hypot(best.x+best.width/2-existing.x-existing.width/2,best.y+best.height/2-existing.y-existing.height/2)>width*.12)continue;
  // A safe current position can ease toward restored clearance. Only actual
  // head/body intersections require an immediate correction.
  const keepPosition=existing&&Math.abs(existing.width-best.width)<.01;
  let phrase=reservedPhrases.get(key);if(phrase===undefined){phrase=0;while(usedPhrases.has(phrase))phrase++;usedPhrases.add(phrase);}
  placed.push({...best,key,owner:face.id,phrase,ax:best.x,ay:best.y,
   x:keepPosition?existing.x:best.x,y:keepPosition?existing.y:best.y,vx:keepPosition?existing.vx:0,vy:keepPosition?existing.vy:0,
   squash:0,squashVelocity:0,opacity:existing?.opacity??0,ownerFace:face,visible:true});
 }
 if(!retry&&placed.filter(b=>b.key.endsWith(':0')).length<active.length){
  let best=placed;
  for(const scale of [1,.9,.8,.7,.6,.5,.45]){
   for(const preserveOffsets of [true,false]){
    const candidate=plan(previous,active,obstacles,width,height,bounds,gap,scale,true,preserveOffsets);
    if(candidate.filter(b=>b.key.endsWith(':0')).length>best.filter(b=>b.key.endsWith(':0')).length)best=candidate;
    if(best.filter(b=>b.key.endsWith(':0')).length===active.length)return best;
   }
  }
  return best.filter(b=>b.key.endsWith(':0'));
 }
 if(!retry&&active.length===1&&!old.has(`${active[0].id}:0`)&&placed.length<3){
  // At first appearance, budget space for a cluster instead of allowing two
  // oversized thoughts to occupy every local slot. Established artwork keeps
  // its size when people enter or leave; extras alone never force a resize.
  let best=placed;
  const room=width*.004,clusterBounds={x:bounds.x+room,y:bounds.y+room,width:bounds.width-room*2,height:bounds.height-room*2};
  for(const scale of [.85,.7,.6,.5,.475,.45]){
   const candidate=plan(previous,active,obstacles,width,height,clusterBounds,gap,scale,true);
   if(candidate.length>best.length)best=candidate;
   if(best.length>=3)break;
  }
  return best;
 }
 return placed;
}
export function stepWorld(previous:World|undefined,faces:FaceTrack[],width:number,height:number,now:number,reduced=false,print=false):World{
 const still=reduced||print;
 const sx=width/(previous?.width??width),sy=height/(previous?.height??height);
 const valid=!previous||sx===1&&sy===1?previous:{...previous,width,height,bodies:previous.bodies.map(b=>{
  // Map the position into the new scene, but scale artwork uniformly. A portrait
  // snapshot must not stretch a landscape bubble; unsafe positions are replanned.
  const height=b.height*sx,mapY=(y:number)=>(y+b.height/2)*sy-height/2;
  return {...b,x:b.x*sx,y:mapY(b.y),ax:b.ax*sx,ay:mapY(b.ay),width:b.width*sx,height,vx:b.vx*sx,vy:b.vy*sy,
   renderX:b.renderX===undefined?undefined:b.renderX*sx,renderY:b.renderY===undefined?undefined:mapY(b.renderY)};
 })};
 const obstacles=faces.filter(f=>f.visible).flatMap(f=>faceObstacles(f,width,height)),active=faces.filter(f=>f.visible&&f.ready).sort((a,b)=>a.id-b.id).slice(0,8);
 // Heads close to the upper edge need the otherwise decorative outer margin.
 // Keep compact side slots available there instead of dropping a person's thought.
 const edgeRoom=active.some(f=>(f.y-f.h*.15)*height<height*.1+width*.075*.62/2)||!!valid?.bodies.some(b=>!b.retiring&&b.y<height*.1&&active.some(f=>f.id===b.owner));
 const margin=width*(edgeRoom?.003:.022),gap=width*.01,top=height*(edgeRoom?.025:print?.035:.1);
 const bounds={x:margin,y:top,width:width-2*margin,height:height*(print?.965:.89)-top};
 const signature=`${print}:${active.map(f=>f.id).join(',')}`;
 const bodies=plan(valid,active,obstacles,width,height,bounds,gap);
 const replan=!valid||valid.signature!==signature||bodies.length!==valid.bodies.filter(b=>!b.retiring).length||bodies.some(b=>{
  const old=valid.bodies.find(o=>o.key===b.key);if(!old)return true;
  const moved=transported(old,b.ownerFace!,width,height);
  return Math.hypot(b.ax-moved.ax,b.ay-moved.ay)>.01||Math.abs(b.width-old.width)>.01;
 });
 const elapsed=Math.min(.05,Math.max(0,(now-(valid?.time??now))/1000)),fixed=1/120;
 let accumulator=(valid?.accumulator??0)+elapsed;
 while(accumulator+1e-9>=fixed){
  for(const b of bodies){
   if(still){b.x=b.ax;b.y=b.ay;b.vx=b.vy=b.squash=0;b.squashVelocity=0;continue;}
   b.vx+=((b.ax-b.x)*64-b.vx*16)*fixed;
   b.vy+=((b.ay-b.y)*64-b.vy*16)*fixed;
   const limit=width*.18,speed=Math.hypot(b.vx,b.vy);if(speed>limit){b.vx*=limit/speed;b.vy*=limit/speed;}
   b.x+=b.vx*fixed;b.y+=b.vy*fixed;
   b.squashVelocity=((b.squashVelocity??0)-b.squash*100*fixed)*Math.exp(-fixed*9);
   b.squash=clamp(b.squash+b.squashVelocity*fixed,-.055,.055);
  }
  accumulator-=fixed;
 }
 // Collision-free anchors are authoritative. Resolve only affected thoughts;
 // do not bounce a crowd or restart its reveal animation after a layout change.
 const attached=new Set(bodies.filter(b=>{
  const old=valid?.bodies.find(previous=>previous.key===b.key);
  return !old?.ownerFace||nearHead(old,old.ownerFace,width,height);
 }).map(b=>b.key));
 for(let pass=0;pass<=bodies.length;pass++){
  const blocked=new Set<ThoughtBody>();
  for(let i=0;i<bodies.length;i++){
   const b=bodies[i];
   if(!inside(b,bounds)||attached.has(b.key)&&!nearHead(b,b.ownerFace!,width,height)||obstacles.some(o=>intersects(b,o)))blocked.add(b);
   for(let j=0;j<i;j++)if(intersects(b,bodies[j])){blocked.add(b);blocked.add(bodies[j]);}
  }
  if(!blocked.size)break;
  for(const b of blocked){
   const occupied=[...obstacles,...bodies.filter(other=>other!==b)];
   const clear=(rect:Rect)=>inside(rect,bounds)&&(!attached.has(b.key)||nearHead(rect,b.ownerFace!,width,height))&&!occupied.some(o=>intersects(rect,o));
   const clamped={...b,x:clamp(b.x,bounds.x,bounds.x+bounds.width-b.width),y:clamp(b.y,bounds.y,bounds.y+bounds.height-b.height)};
   let correction:Rect|undefined=clear(clamped)?clamped:undefined;
   if(!correction){
    const xs=[clamped.x,...occupied.flatMap(o=>[o.x-b.width-.001,o.x+o.width+.001])];
    const ys=[clamped.y,...occupied.flatMap(o=>[o.y-b.height-.001,o.y+o.height+.001])];
    const nearby=xs.flatMap(x=>ys.map(y=>({...b,x,y}))).filter(rect=>Math.hypot(rect.x-b.x,rect.y-b.y)<=width*.08&&clear(rect));
    nearby.sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y));
    correction=nearby[0];
   }
   // Hitting a boundary while easing is a local correction, not a reason to
   // teleport the other axis to a distant destination.
   b.x=correction?.x??b.ax;b.y=correction?.y??b.ay;b.vx=b.vy=0;
  }
 }
 const visible:Rect[]=[];
 for(const b of bodies){
  const blocked=obstacles.some(o=>intersects(b,o))||visible.some(o=>intersects(b,o));
  b.visible=!blocked;
  b.ownerFace=faces.find(f=>f.id===b.owner)??b.ownerFace;
  const target=print?1:b.ownerFace?.presence??1,current=b.opacity??0;
  b.opacity=print?1:current<target?Math.min(target,current+elapsed/1.1):Math.max(target,current-elapsed/.65);
  b.shapeTime=still?0:now/1000;
  // Fill display refreshes between fixed ticks, including 144/165 Hz panels.
  // The small extrapolation stays inside the reserved collision clearance.
  const projected={...b,x:clamp(b.x+b.vx*Math.max(0,accumulator),bounds.x,bounds.x+bounds.width-b.width),y:clamp(b.y+b.vy*Math.max(0,accumulator),bounds.y,bounds.y+bounds.height-b.height)};
  const safe=!obstacles.some(o=>intersects(projected,o,gap*.2))&&!bodies.some(o=>o!==b&&intersects(projected,o,gap*.2));
  const base={...b,x:still||!safe?b.x:projected.x,y:still||!safe?b.y:projected.y};
  // Float is a small render offset, separate from tracking and layout. Stable
  // owner/slot phases survive phrase changes and never feed back into anchors.
  const phase=b.owner*2.399+Number(b.key.split(':')[1]??0)*1.71,time=now/1000;
  const floatX=still?0:Math.sin(time*.53+phase)*Math.min(3,width*.0015);
  const floatY=still?0:Math.cos(time*.41+phase*1.3)*Math.min(4,height*.0033);
  const floatRadius=Math.max(Math.min(3,width*.0015),Math.min(4,height*.0033));
  const floating=(amount:number)=>({...base,x:base.x+floatX*amount,y:base.y+floatY*amount});
  const floatSafe=(rect:Rect)=>inside(rect,bounds)&&nearHead(rect,b.ownerFace!,width,height)&&!obstacles.some(o=>intersects(rect,o))&&!bodies.some(o=>o!==b&&intersects(rect,{...o,x:o.renderX??o.x,y:o.renderY??o.y},o.renderX===undefined?floatRadius:0));
  let amount=still?0:1;
  if(amount&&!floatSafe(floating(amount))){
   let low=0,high=1;
   for(let n=0;n<10;n++){const mid=(low+high)/2;if(floatSafe(floating(mid)))low=mid;else high=mid;}
   amount=low;
  }
  const rendered=floating(amount);b.renderX=rendered.x;b.renderY=rendered.y;
  if(b.visible)visible.push(b);
 }
 // Optional thoughts fade beside their owner; departing owners keep their last
 // pose. Neither holds space in the next layout or pushes the live thoughts.
 if(!print)for(const old of valid?.bodies??[]){
  if(bodies.some(b=>b.key===old.key)||!old.ownerFace)continue;
  const opacity=Math.max(0,(old.opacity??0)-elapsed/.65);
  if(opacity<=0)continue;
  const owner=faces.find(face=>face.id===old.owner&&face.visible);
  const dx=owner?(owner.x-old.ownerFace.x)*width:0,dy=owner?(owner.y-old.ownerFace.y)*height:0;
  const x=(old.renderX??old.x)+dx,y=(old.renderY??old.y)+dy;
  const retiring={...old,x,y,ax:old.ax+dx,ay:old.ay+dy,renderX:x,renderY:y,ownerFace:owner??old.ownerFace,opacity,retiring:true,vx:0,vy:0};
  retiring.visible=old.visible&&!obstacles.some(o=>intersects(retiring,o,gap*.2))&&!bodies.some(b=>b.visible&&intersects(retiring,b,gap*.2));
  bodies.push(retiring);
 }
 return {bodies,time:now,width,height,accumulator,signature,layoutAt:replan?now:valid.layoutAt,layoutFaces:replan?faces.map(f=>({...f})):valid.layoutFaces,layoutVersion:(valid?.layoutVersion??0)+(replan?1:0)};
}
