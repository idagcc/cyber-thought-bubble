import type {SpriteContext} from './spriteContext';
// Each glass skin is rasterized once so the layers can move independently.
// Highlights travel with their skin; all motion stays inside the physics box.
type GlassArtwork={shell:HTMLCanvasElement;layers:HTMLCanvasElement[]};
const shells=new Map<number,GlassArtwork>();
const W=1280,H=800;
function silhouette(ctx:CanvasRenderingContext2D,variant:number){
 const phase=variant*.9,points=Array.from({length:32},(_,i)=>{
  const a=i/32*Math.PI*2,r=1+.105*Math.cos(3*a+phase)+.045*Math.sin(2*a-phase);
  return {x:Math.cos(a)*r,y:Math.sin(a)*r};
 });
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
 for(const p of points){p.x=.13+(p.x-minX)/(maxX-minX)*.74;p.y=.13+(p.y-minY)/(maxY-minY)*.74;}
 ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
 for(let i=0;i<points.length;i++){
  const a=points[(i+31)%32],b=points[i],c=points[(i+1)%32],d=points[(i+2)%32];
  ctx.bezierCurveTo(b.x+(c.x-a.x)/6,b.y+(c.y-a.y)/6,c.x-(d.x-b.x)/6,c.y-(d.y-b.y)/6,c.x,c.y);
 }
 ctx.closePath();
}
function makeLayer(variant:number,layer:number){
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d')!;
 ctx.scale(W,H);
 // Offset skins give the reference's layered silhouette without an opaque fill.
 ctx.save();ctx.translate(.5,.5);ctx.rotate((layer-1)*(.085+variant*.01));ctx.scale(1+layer*.045,1-layer*.025);ctx.translate(-.5+layer*.006,-.5-layer*.017);
 silhouette(ctx,(variant+layer)%4);
 const fill=ctx.createLinearGradient(.2,.1,.67,.88);
 fill.addColorStop(0,layer?'#65e8ff58':'#93edff68');fill.addColorStop(.19,layer?'#178eff35':'#4ab8fb32');
 fill.addColorStop(.46,layer?'#2479e812':'#123d711c');fill.addColorStop(.75,layer?'#1655d025':'#12448230');fill.addColorStop(1,layer?'#3265e772':'#4c83ed63');
 ctx.fillStyle=fill;ctx.fill();
 ctx.save();ctx.clip();
 // A clear, softly shaded centre keeps white type readable over a live camera.
 if(layer===0){
  const core=ctx.createRadialGradient(.5,.51,.03,.5,.51,.40);
  core.addColorStop(0,'#0821476e');core.addColorStop(.65,'#08214740');core.addColorStop(1,'#08214700');ctx.fillStyle=core;ctx.fillRect(0,0,1,1);
  const reflection=ctx.createLinearGradient(.3,.12,.4,.53);
  reflection.addColorStop(0,'#d7ffff80');reflection.addColorStop(.35,'#b9f7ff26');reflection.addColorStop(1,'#b9f7ff00');
  ctx.fillStyle=reflection;ctx.beginPath();ctx.moveTo(.1,.34);ctx.bezierCurveTo(.24,.06,.77,.08,.91,.32);ctx.bezierCurveTo(.8,.47,.64,.29,.46,.35);ctx.bezierCurveTo(.25,.41,.19,.47,.1,.34);ctx.fill();
  const rim=ctx.createLinearGradient(.15,.12,.76,.92);rim.addColorStop(0,'#e8ffffa3');rim.addColorStop(.25,'#73eaff82');rim.addColorStop(.55,'#4f9bef08');rim.addColorStop(1,'#a4cdff95');
  ctx.strokeStyle=rim;ctx.lineWidth=.027;silhouette(ctx,variant);ctx.stroke();
 }
 ctx.restore();
 const edge=ctx.createLinearGradient(.28,.08,.7,.91);edge.addColorStop(0,'#b7ffffc0');edge.addColorStop(.3,'#3acff76b');edge.addColorStop(.6,'#275fce12');edge.addColorStop(1,'#83b3ff80');
 ctx.strokeStyle=edge;ctx.lineWidth=layer?.003:.004;silhouette(ctx,(variant+layer)%4);ctx.stroke();ctx.restore();
 if(layer===0){
  // Broad, rounded specular streaks follow the skin, like the supplied reference.
  ctx.save();ctx.lineCap='round';
  const highlight=ctx.createLinearGradient(.2,.15,.3,.46);highlight.addColorStop(0,'#f0ffffa8');highlight.addColorStop(1,'#d0faff04');
  ctx.strokeStyle=highlight;ctx.lineWidth=.026;ctx.beginPath();ctx.moveTo(.22,.39);ctx.bezierCurveTo(.18,.23,.28,.19,.37,.195);ctx.stroke();
  ctx.fillStyle='#d7ffff75';ctx.beginPath();ctx.ellipse(.415,.19,.027,.017,-.15,0,Math.PI*2);ctx.fill();
  const lower=ctx.createLinearGradient(.64,.64,.77,.85);lower.addColorStop(0,'#d0ebff00');lower.addColorStop(1,'#d0ebff65');ctx.strokeStyle=lower;ctx.lineWidth=.021;
  ctx.beginPath();ctx.moveTo(.79,.54);ctx.bezierCurveTo(.83,.67,.73,.79,.65,.79);ctx.stroke();
  ctx.restore();
 }
 return canvas;
}
function artwork(variant:number){
 const key=((variant%4)+4)%4;let sprite=shells.get(key);
 if(!sprite){
  const layers=[2,1,0].map(layer=>makeLayer(key,layer)),shell=document.createElement('canvas');shell.width=W;shell.height=H;
  const ctx=shell.getContext('2d')!;for(const layer of layers)ctx.drawImage(layer,0,0);
  sprite={shell,layers};shells.set(key,sprite);
 }
 return sprite;
}
export function glassArtwork(variant:number){return artwork(variant).shell;}
export function drawGlassArtwork(ctx:SpriteContext,variant:number,x:number,y:number,width:number,height:number,time=0,phase=0){
 const sprite=artwork(variant),key=((variant%4)+4)%4;
 // Prints and reduced-motion views keep the original, motionless composite.
 if(time===0){ctx.drawImage(sprite.shell,x,y,width,height);return;}
 for(let i=0;i<sprite.layers.length;i++){
  const layer=2-i,seed=key*.9+layer*2.1+phase,strength=.55+layer*.225,back=layer===2;
  // Small layer offsets keep the rim alive without making the silhouette wobble.
  const dx=Math.sin(time*(.38-layer*.035)+seed)*width*(back?.008:.003)*strength;
  const dy=Math.cos(time*(.29+layer*.022)+seed*1.3)*height*(back?.008:.004)*strength;
  const angle=Math.sin(time*(.23+layer*.018)+seed)*(back?.012:.006)*strength;
  const breath=Math.sin(time*(.43-layer*.04)+seed)*(back?.008:.004)*strength;
  ctx.save();ctx.translate(x+width/2+dx,y+height/2+dy);ctx.rotate(angle);ctx.scale(1+breath,1-breath*.7);
  ctx.drawImage(sprite.layers[i],-width/2,-height/2,width,height);ctx.restore();
 }
}
export function prepareGlassArtwork(){for(let i=0;i<4;i++)glassArtwork(i);}
