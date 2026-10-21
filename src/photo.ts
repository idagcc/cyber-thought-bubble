import type {SpriteContext} from './spriteContext';
import type {Config,Lang,Phrase} from './types';
import type {Face} from './presence';
import {bubbleFrames,certificateLayout,coverCrop,wrapMeasured} from './layout';
import {intersects,faceObstacle,type ThoughtBody} from './bubblePhysics';
import type {FaceTrack} from './faceTracking';
import {drawGlassArtwork,glassArtwork,prepareGlassArtwork} from './bubbleArtwork';
import {carnivalArtwork,carnivalArtworkLoaded,drawCarnivalBackdrop} from './carnival';
// Prepare the reusable transparent skins before opening the camera.
export const bubblesLoaded=Promise.all([carnivalArtworkLoaded,Promise.resolve().then(prepareGlassArtwork)]);
export const sceneW=900,sceneH=1120;
const fontFamily=(lang:Lang)=>lang==='ar'?'Noto Sans Arabic':'Manrope';
export function round(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
export function lines(ctx:CanvasRenderingContext2D,text:string,maxWidth:number){return wrapMeasured(text,maxWidth,s=>ctx.measureText(s).width);}
const labelLayers=new Map<string,HTMLCanvasElement>();
const textLayouts=new Map<string,{size:number;wrapped:string[];lineHeight:number}>();
if(typeof document!=='undefined')document.fonts?.addEventListener('loadingdone',()=>{textLayouts.clear();labelLayers.clear();});
function fitText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,width:number,height:number,size:number,color:string,lang:Lang,align:CanvasTextAlign='center',weight=600){
 ctx.save();ctx.direction=lang==='ar'?'rtl':'ltr';
 const key=JSON.stringify([text,width,height,size,lang,weight]);let layout=textLayouts.get(key);
 if(!layout){let wrapped:string[]=[],lineHeight=0;
  for(;size>=9;size-=.5){ctx.font=`${weight} ${size}px "${fontFamily(lang)}"`;wrapped=lines(ctx,text,width);lineHeight=size*(lang==='ar'?1.65:1.38);if(wrapped.length*lineHeight<=height)break;}
  layout={size,wrapped,lineHeight};if(textLayouts.size>256)textLayouts.clear();textLayouts.set(key,layout);
 }
 const {wrapped,lineHeight}=layout;ctx.font=`${weight} ${layout.size}px "${fontFamily(lang)}"`;
 ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';const anchor=align==='center'?x+width/2:align==='right'?x+width:x,top=y+(height-wrapped.length*lineHeight)/2;
 wrapped.forEach((line,i)=>ctx.fillText(line,anchor,top+lineHeight*(i+.5)));ctx.restore();
}
export function textBlock(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,width:number,size:number,color:string,lang:Lang,maxLines=5){fitText(ctx,text,x-width/2,y-size,width,size*maxLines*1.5,size,color,lang);}
export function drawPlaceholder(ctx:CanvasRenderingContext2D){drawCarnivalBackdrop(ctx,900,1120);}
export function drawDemo(ctx:CanvasRenderingContext2D,background=true){if(background)drawPlaceholder(ctx);const g=ctx.createLinearGradient(0,700,900,1120);g.addColorStop(0,'#547d91');g.addColorStop(1,'#183b53');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(190,1120);ctx.bezierCurveTo(175,820,260,760,355,737);ctx.lineTo(540,737);ctx.bezierCurveTo(650,770,725,850,710,1120);ctx.fill();round(ctx,393,605,112,173,40,'#bd8c71');ctx.fillStyle='#d5a487';ctx.beginPath();ctx.ellipse(450,491,117,166,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#17272d';ctx.beginPath();ctx.moveTo(332,458);ctx.bezierCurveTo(302,278,570,272,567,462);ctx.lineTo(538,398);ctx.bezierCurveTo(473,412,411,386,368,403);ctx.fill();ctx.fillStyle='#2c2c30';[407,493].forEach(x=>{ctx.beginPath();ctx.ellipse(x,494,7,9,0,0,Math.PI*2);ctx.fill();});ctx.strokeStyle='#875349';ctx.lineWidth=5;ctx.beginPath();ctx.arc(450,548,35,.15,Math.PI-.15);ctx.stroke();}

// Rasterize letters at a fixed origin. Fractional movement now resamples one
// immutable layer, avoiding the changing font hinting of per-frame fillText.
function thoughtLabel(text:string,lang:Lang,width:number,height:number,size:number,withIcon=false){
 const key=JSON.stringify([text,lang,width,height,size,withIcon]);let label=labelLayers.get(key);
 if(!label){
  label=document.createElement('canvas');label.width=Math.ceil(width*2);label.height=Math.ceil(height*2);
  const ctx=label.getContext('2d')!;ctx.scale(2,2);ctx.shadowColor='#04152baa';ctx.shadowBlur=2;ctx.shadowOffsetY=.6;
  fitText(ctx,text,width*(withIcon?.36:.23),height*.30,width*(withIcon?.47:.54),height*.40,size,'#f2faff',lang,'center',650);
  if(labelLayers.size>=32)labelLayers.delete(labelLayers.keys().next().value!);labelLayers.set(key,label);
 }
 return label;
}
export function drawThoughts(ctx:SpriteContext,bodies:ThoughtBody[],faces:FaceTrack[],phrases:Phrase[],lang:Lang,width:number,height:number){
 const visible=bodies.filter(b=>b.visible);
 for(const body of visible){
  const box={...body,x:body.renderX??body.x,y:body.renderY??body.y};
  const face=faces.find(f=>f.id===box.owner);if(!face||!phrases.length)continue;
  const phrase=phrases[box.phrase%phrases.length],cx=box.x+box.width/2,cy=box.y+box.height/2;
  ctx.save();ctx.globalAlpha=box.opacity??Math.min(1,Math.max(0,(performance.now()-face.since-1800)/450));
  const dx=face.x*width-cx,dy=face.y*height-cy,length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;
  const edge=Math.min(Math.abs(box.width*.46/(ux||.001)),Math.abs(box.height*.43/(uy||.001)));
  for(let i=0;i<2;i++){
   const r=width*(i?.0034:.006),d=edge+width*(i?.03:.014),x=cx+ux*d,y=cy+uy*d;
   const rect={x:x-r*1.4,y:y-r*1.4,width:r*2.8,height:r*2.8};
   if(visible.some(b=>b!==body&&intersects(rect,b))||faces.some(f=>intersects(rect,faceObstacle(f,width,height))))continue;
   ctx.drawImage(glassArtwork(box.owner*2+box.phrase),x-r*1.4,y-r*1.4,r*2.8,r*2.8);
  }
  const time=box.shapeTime??0,breath=time?Math.sin(time*.65+box.owner+box.phrase)*.006:0;
  const squeezeX=1-Math.max(0,box.squash)+breath,squeezeY=1-Math.max(0,-box.squash)-breath;
  const w=box.width*squeezeX,h=box.height*squeezeY;
  drawGlassArtwork(ctx,box.owner*2+box.phrase,cx-w/2,cy-h/2,w,h,time,box.owner*1.7+box.phrase*2.1);
  // The 3D artwork stays inside its thought's collision-safe rectangle.
  const iconName=(['cloud','fingerprint','shield','star'] as const)[box.phrase%4],icon=carnivalArtwork?.[iconName],withIcon=Boolean(icon?.naturalWidth);
  if(withIcon){const size=Math.min(box.width*.32,box.height*.68);ctx.drawImage(icon,box.x+box.width*.035,cy-size/2,size,size);}
  ctx.drawImage(thoughtLabel(phrase[lang],lang,box.width,box.height,Math.min(width/58,box.height/5),withIcon),box.x,box.y,box.width,box.height);
  ctx.restore();
 }
}
export function drawFaceFrame(ctx:CanvasRenderingContext2D,face:Face,width:number,height:number,selected=false){
 const unit=width/1600,cx=face.x*width,cy=face.y*height,fw=face.w*width/2+12*unit,fh=face.h*height/2+14*unit;
 ctx.save();ctx.strokeStyle=selected?'#a4f0d4':'#ffffff90';ctx.lineWidth=Math.max(1.4,2*unit);ctx.lineCap='round';
 [[cx-fw,cy-fh,1,1],[cx+fw,cy-fh,-1,1],[cx-fw,cy+fh,1,-1],[cx+fw,cy+fh,-1,-1]].forEach(([x,y,dx,dy])=>{ctx.beginPath();ctx.moveTo(x,y+dy*18*unit);ctx.lineTo(x,y);ctx.lineTo(x+dx*18*unit,y);ctx.stroke();});ctx.restore();
}
export function drawBubbles(ctx:CanvasRenderingContext2D,face:Face,phrases:Phrase[],lang:Lang,_tick:number,height=1120,_reveal=9999,width=900){
 const bodies=bubbleFrames(width,height,face.x).map((b,i)=>({...b,key:String(i),owner:1,phrase:i,vx:0,vy:0,ax:b.x,ay:b.y,squash:0,visible:true}));
 drawThoughts(ctx,bodies,[{...face,id:1,since:-10000,seen:0,ready:true,visible:true}],phrases,lang,width,height);
}
export async function certificate(scene:string,participant:string,lang:Lang,config:Config):Promise<string>{
 await Promise.all([document.fonts.ready,carnivalArtworkLoaded]);
 // Canvas fonts are loaded explicitly so Arabic and English use the same print fonts as the UI.
 await Promise.all([500,600,700].map(weight=>document.fonts.load(`${weight} 30px "${fontFamily(lang)}"`)));
 const image=new Image();image.src=scene;await image.decode();const {landscape,width:w,height:h,photoWidth,photoHeight}=certificateLayout(config.certificateOrientation),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d')!,crop=coverCrop(image.naturalWidth,image.naturalHeight,photoWidth,photoHeight);
 drawCarnivalBackdrop(ctx,w,h);ctx.drawImage(image,crop.sx,crop.sy,crop.sw,crop.sh,0,0,photoWidth,photoHeight);
 ctx.fillStyle='#080b2bed';ctx.fillRect(0,photoHeight,w,h-photoHeight);
 if(carnivalArtwork.brand.naturalWidth)ctx.drawImage(carnivalArtwork.brand,48,30,250,125);
 if(carnivalArtwork.shield.naturalWidth)ctx.drawImage(carnivalArtwork.shield,w-154,36,100,100);
 const display=participant.includes('@')?(lang==='ar'?'مشارك في التوعية السيبرانية':'Cybersecurity participant'):participant;
 const align=lang==='ar'?'right':'left';ctx.strokeStyle='#8dcfff55';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,photoHeight);ctx.lineTo(w,photoHeight);ctx.stroke();
 if(landscape){
  const left=64,right=1090;
  fitText(ctx,lang==='ar'?'شهادة مشاركة':'CERTIFICATE OF PARTICIPATION',left,850,900,34,22,'#ffdb8f',lang,align,600);
  fitText(ctx,config.title[lang],left,900,900,70,36,'#f6f7ff',lang,align,700);
  fitText(ctx,display,left,980,900,106,44,'#8cddff',lang,align,700);
  ctx.strokeStyle='#8dcfff55';ctx.beginPath();ctx.moveTo(1030,862);ctx.lineTo(1030,1090);ctx.stroke();
  fitText(ctx,lang==='ar'?'تعهّدي الرقمي':'MY DIGITAL PROMISE',right,850,646,34,21,'#ffdb8f',lang,align,600);
  fitText(ctx,config.acknowledgement[lang],right,902,646,172,29,'#d4dff5',lang,align,500);
 }else{
  fitText(ctx,lang==='ar'?'شهادة مشاركة':'CERTIFICATE OF PARTICIPATION',64,1340,w-128,40,22,'#ffdb8f',lang);
  fitText(ctx,config.title[lang],64,1400,w-128,100,40,'#f6f7ff',lang);
  fitText(ctx,display,64,1500,w-128,90,38,'#8cddff',lang);
  fitText(ctx,config.acknowledgement[lang],84,1605,w-168,112,28,'#d4dff5',lang);
 }
 ctx.strokeStyle='#8dcfff55';ctx.beginPath();ctx.moveTo(64,h-76);ctx.lineTo(w-64,h-76);ctx.stroke();
 fitText(ctx,lang==='ar'?'كل فكرة واعية تصنع فرقاً.':'A thoughtful moment. A safer digital world.',64,h-62,w-390,40,20,'#b6c3e1',lang,align,500);
 const date=new Date().toLocaleDateString(lang==='ar'?'ar-AE':'en-GB',{day:'numeric',month:'short',year:'numeric'});fitText(ctx,date,w-320,h-62,256,40,20,'#b6c3e1',lang,'right',500);
 return canvas.toDataURL('image/jpeg',.96);
}
export async function printCalibration(config:Config):Promise<string>{
 await bubblesLoaded;
 const {landscape,photoWidth,photoHeight}=certificateLayout(config.certificateOrientation),scene=document.createElement('canvas');scene.width=photoWidth;scene.height=photoHeight;
 const ctx=scene.getContext('2d')!,scale=scene.height/1120;drawCarnivalBackdrop(ctx,scene.width,scene.height);ctx.save();ctx.translate((scene.width-900*scale)/2,0);ctx.scale(scale,scale);drawDemo(ctx,false);ctx.restore();
 drawBubbles(ctx,{x:.5,y:491/1120,w:234*scale/scene.width,h:330/1120},config.phrases.filter(p=>p.enabled).slice(0,4),'en',0,scene.height,9999,scene.width);
 const result=await certificate(scene.toDataURL('image/jpeg',.95),'PRINTER TEST · اختبار الطباعة','en',config),img=new Image();img.src=result;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const c=canvas.getContext('2d')!;c.drawImage(img,0,0);
 c.strokeStyle='#ed614a';c.lineWidth=3;c.setLineDash([14,10]);c.strokeRect(55,55,canvas.width-110,canvas.height-110);c.setLineDash([]);
 const y=scene.height-100;round(c,80,y,canvas.width-160,72,16,'#102542ed');c.font='600 22px "Manrope"';c.fillStyle='#fff';c.textAlign='center';c.fillText(`${landscape?'6 × 4 LANDSCAPE':'4 × 6 PORTRAIT'} · 300 DPI · CHECK ALL FOUR DASHED EDGES`,canvas.width/2,y+44);
 ['#2475f0','#f35c77','#ffd66c','#ffffff','#172d49'].forEach((colour,i)=>round(c,canvas.width-320+i*42,80,34,42,4,colour));return canvas.toDataURL('image/jpeg',.96);
}
