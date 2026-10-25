import type {SpriteContext} from './spriteContext';
import type {Config,Lang,Phrase} from './types';
import type {Face} from './presence';
import {bubbleFrames,certificateLayout,certificatePhotoFrame,coverCrop,wrapMeasured} from './layout';
import {intersects,faceObstacle,type Rect,type ThoughtBody} from './bubblePhysics';
import type {FaceTrack} from './faceTracking';
import {drawGlassArtwork,glassArtwork,prepareGlassArtwork} from './bubbleArtwork';
import {carnivalArtwork,carnivalArtworkLoaded,drawCarnivalBackdrop} from './carnival';
import type {ThoughtLabel} from './thoughtContent';
// Prepare the reusable transparent skins before opening the camera.
export const bubblesLoaded=Promise.all([carnivalArtworkLoaded,Promise.resolve().then(prepareGlassArtwork)]);
export const sceneW=900,sceneH=1120;
const fontFamily=(_lang:Lang)=>'Noto Kufi Arabic';
export function round(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
export function lines(ctx:CanvasRenderingContext2D,text:string,maxWidth:number){return wrapMeasured(text,maxWidth,s=>ctx.measureText(s).width);}
const labelLayers=new Map<string,HTMLCanvasElement>();
const textLayouts=new Map<string,{size:number;wrapped:string[];lineHeight:number}>();
if(typeof document!=='undefined')document.fonts?.addEventListener('loadingdone',()=>{textLayouts.clear();labelLayers.clear();});
function fitText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,width:number,height:number,size:number,color:string,lang:Lang,align:CanvasTextAlign='center',weight=600,minimum=9,contain=false){
 ctx.save();ctx.direction=lang==='ar'?'rtl':'ltr';
 const key=JSON.stringify([text,width,height,size,lang,weight,minimum,contain]);let layout=textLayouts.get(key);
 if(!layout){let wrapped:string[]=[],lineHeight=0;
  size=Math.max(size,minimum);
  for(;;){ctx.font=`${weight} ${size}px "${fontFamily(lang)}"`;wrapped=lines(ctx,text,width);lineHeight=size*(lang==='ar'?1.65:1.38);if(wrapped.length*lineHeight<=height||size<=minimum)break;size=Math.max(minimum,size-.5);}
  if(contain&&wrapped.length*lineHeight>height){
   wrapped=wrapped.slice(0,Math.max(1,Math.floor(height/lineHeight)));
   let last=wrapped.at(-1)??'';while(last&&ctx.measureText(`${last}…`).width>width)last=Array.from(last).slice(0,-1).join('');
   wrapped[wrapped.length-1]=`${last.trimEnd()}…`;
  }
  layout={size,wrapped,lineHeight};if(textLayouts.size>256)textLayouts.clear();textLayouts.set(key,layout);
 }
 if(contain){ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();}
 const {wrapped,lineHeight}=layout;ctx.font=`${weight} ${layout.size}px "${fontFamily(lang)}"`;
 ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';const anchor=align==='center'?x+width/2:align==='right'?x+width:x,top=y+(height-wrapped.length*lineHeight)/2;
 wrapped.forEach((line,i)=>ctx.fillText(line,anchor,top+lineHeight*(i+.5)));ctx.restore();
}
export function textBlock(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,width:number,size:number,color:string,lang:Lang,maxLines=5){fitText(ctx,text,x-width/2,y-size,width,size*maxLines*1.5,size,color,lang);}
export function drawPlaceholder(ctx:CanvasRenderingContext2D){drawCarnivalBackdrop(ctx,900,1120);}
export function drawDemo(ctx:CanvasRenderingContext2D,background=true){if(background)drawPlaceholder(ctx);const g=ctx.createLinearGradient(0,700,900,1120);g.addColorStop(0,'#547d91');g.addColorStop(1,'#183b53');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(190,1120);ctx.bezierCurveTo(175,820,260,760,355,737);ctx.lineTo(540,737);ctx.bezierCurveTo(650,770,725,850,710,1120);ctx.fill();round(ctx,393,605,112,173,40,'#bd8c71');ctx.fillStyle='#d5a487';ctx.beginPath();ctx.ellipse(450,491,117,166,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#17272d';ctx.beginPath();ctx.moveTo(332,458);ctx.bezierCurveTo(302,278,570,272,567,462);ctx.lineTo(538,398);ctx.bezierCurveTo(473,412,411,386,368,403);ctx.fill();ctx.fillStyle='#2c2c30';[407,493].forEach(x=>{ctx.beginPath();ctx.ellipse(x,494,7,9,0,0,Math.PI*2);ctx.fill();});ctx.strokeStyle='#875349';ctx.lineWidth=5;ctx.beginPath();ctx.arc(450,548,35,.15,Math.PI-.15);ctx.stroke();}

// Rasterize letters at a fixed origin. Fractional movement now resamples one
// immutable layer, avoiding the changing font hinting of per-frame fillText.
function thoughtLabel(text:string,lang:Lang,width:number,height:number,size:number,withIcon=false,pixelRatio=2,compact=false){
 const density=Math.ceil(pixelRatio*4)/4;
 const key=JSON.stringify([text,lang,width,height,size,withIcon,density,compact]);let label=labelLayers.get(key);
 if(!label){
  label=document.createElement('canvas');label.width=Math.ceil(width*density);label.height=Math.ceil(height*density);
  const ctx=label.getContext('2d')!;ctx.scale(density,density);ctx.shadowColor='#04152baa';ctx.shadowBlur=2;ctx.shadowOffsetY=.6;
  const inset=compact?{x:.16,y:.22,w:.68,h:.56}:{x:withIcon?.36:.23,y:.30,w:withIcon?.47:.54,h:.40};
  // Small crowd bubbles use their interior for text. Clip the cached raster as
  // a final guard against glyph overhang, shadows and unusually long edits.
  fitText(ctx,text,width*inset.x,height*inset.y,width*inset.w,height*inset.h,size,'#f2faff',lang,'center',650,compact?6:9,true);
  if(labelLayers.size>=32)labelLayers.delete(labelLayers.keys().next().value!);labelLayers.set(key,label);
 }
 return label;
}
// Tails are part of the shared GPU/2D layout. Reserve their full painted bounds,
// including against other tails, so the small clouds never sit on a face.
export function thoughtTailFrames(bodies:ThoughtBody[],faces:FaceTrack[],width:number,height:number):Map<string,Rect[]>{
 const visible=bodies.filter(b=>b.visible).map(b=>({...b,x:b.renderX??b.x,y:b.renderY??b.y})).sort((a,b)=>a.owner-b.owner||a.key.localeCompare(b.key));
 const heads=faces.map(f=>faceObstacle(f,width,height)),reserved:Rect[]=[],result=new Map<string,Rect[]>();
 const clearance=width*.001;
 for(const box of visible){
  const tails:Rect[]=[];result.set(box.key,tails);
  const face=faces.find(f=>f.id===box.owner)??box.ownerFace;if(!face||(box.opacity??1)<=0)continue;
  const cx=box.x+box.width/2,cy=box.y+box.height/2,fx=face.x*width,fw=face.w*width;
  // An overhead bubble points to the forehead; a side bubble points to the
  // upper temple. Never aim through the middle of the participant's face.
  const side=Math.abs(cx-fx)<fw*.2?0:Math.sign(cx-fx);
  const dx=fx+side*fw*.48-cx,dy=(face.y-face.h*.46)*height-cy,length=Math.hypot(dx,dy);
  if(!length)continue;
  const ux=dx/length,uy=dy/length;
  const edge=Math.min(ux?Math.abs(box.width*.5/ux):Infinity,uy?Math.abs(box.height*.5/uy):Infinity);
  const head=faceObstacle(face,width,height);
  const interval=(start:number,size:number,origin:number,direction:number)=>direction?[(start-origin)/direction,(start+size-origin)/direction].sort((a,b)=>a-b):[-Infinity,Infinity];
  const tx=interval(head.x,head.width,cx,ux),ty=interval(head.y,head.height,cy,uy),headEdge=Math.max(tx[0],ty[0]);
  const gap=headEdge-edge,maxGap=Math.min(width*.12,Math.max(fw*1.5,width*.055));
  // A distant connector would imply the wrong owner. The placement solver
  // keeps bubbles local; a tail is optional when its remaining gap is tiny.
  if(headEdge>Math.min(tx[1],ty[1])||gap<width*.008||gap>maxGap)continue;
  for(let i=0;i<2;i++){
   const half=Math.min(width*(i?.00476:.0084),gap*(i?.11:.18));
   if(half<width*.001)continue;
   const distance=edge+gap*(i?.73:.3),x=cx+ux*distance,y=cy+uy*distance;
   const rect={x:x-half,y:y-half,width:half*2,height:half*2};
   if(rect.x<0||rect.y<0||rect.x+rect.width>width||rect.y+rect.height>height||
    visible.some(b=>intersects(rect,b,clearance))||heads.some(h=>intersects(rect,h,clearance))||
    intersects(rect,head,clearance)||reserved.some(t=>intersects(rect,t,clearance)))continue;
   tails.push(rect);reserved.push(rect);
  }
 }
 return result;
}
export function drawThoughts(ctx:SpriteContext,bodies:ThoughtBody[],faces:FaceTrack[],phrases:Phrase[],lang:Lang,width:number,height:number,labels?:Map<string,ThoughtLabel[]>,pixelRatio=2){
 const visible=bodies.filter(b=>b.visible),tails=thoughtTailFrames(visible,faces,width,height);
 for(const body of visible){
  const box={...body,x:body.renderX??body.x,y:body.renderY??body.y};
  const face=faces.find(f=>f.id===box.owner)??box.ownerFace;if(!face||!phrases.length)continue;
  const phrase=phrases[box.phrase%phrases.length],cx=box.x+box.width/2,cy=box.y+box.height/2;
  ctx.save();ctx.globalAlpha=box.opacity??Math.min(1,Math.max(0,(performance.now()-face.since-1800)/450));
  for(const tail of tails.get(box.key)??[])ctx.drawImage(glassArtwork(box.owner*2+box.phrase),tail.x,tail.y,tail.width,tail.height);
  const time=box.shapeTime??0,opacity=ctx.globalAlpha;
  // Slow, uniform breathing and a soft zoom on arrival stay inside the safe box.
  const reveal=opacity*opacity*(3-2*opacity),breath=time ? .982+Math.sin(time*Math.PI/4+box.owner+box.phrase)*.018 : 1;
  const scale=(time ? .88+.12*reveal : 1)*breath;
  ctx.save();ctx.translate(cx,cy);ctx.scale(scale,scale);ctx.translate(-cx,-cy);
  const squeezeX=1-Math.max(0,box.squash),squeezeY=1-Math.max(0,-box.squash);
  const w=box.width*squeezeX,h=box.height*squeezeY;
  drawGlassArtwork(ctx,box.owner*2+box.phrase,cx-w/2,cy-h/2,w,h,time,box.owner*1.7+box.phrase*2.1);
  // The 3D artwork stays inside its thought's collision-safe rectangle.
  const compact=box.width<width*.14||box.height<height*.12;
  const iconName=(['cloud','fingerprint','shield','star'] as const)[box.phrase%4],icon=carnivalArtwork?.[iconName],withIcon=!compact&&Boolean(icon?.naturalWidth);
  if(withIcon){const size=Math.min(box.width*.28,box.height*.62),ratio=icon.naturalWidth/icon.naturalHeight,iw=size*Math.min(1,ratio),ih=size/Math.max(1,ratio);ctx.drawImage(icon,box.x+box.width*.175-iw/2,cy-ih/2,iw,ih);}
  for(const label of labels?.get(box.key)??[{text:phrase[lang],lang,opacity:1}]){
   ctx.globalAlpha=opacity*label.opacity;
   ctx.drawImage(thoughtLabel(label.text,label.lang,box.width,box.height,Math.min(width/58,box.height/5),withIcon,pixelRatio,compact),box.x,box.y,box.width,box.height);
  }
  ctx.restore();
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
function neonFrame(ctx:CanvasRenderingContext2D,x:number,y:number,width:number,height:number,radius=24){
 ctx.save();ctx.shadowColor='#00d9ff';ctx.shadowBlur=18;
 round(ctx,x,y,width,height,radius,'#001442ed');
 ctx.strokeStyle='#22dcff';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(x,y,width,height,radius);ctx.stroke();
 ctx.shadowBlur=0;ctx.strokeStyle='#c1fbff';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x+8,y+8,width-16,height-16,Math.max(4,radius-6));ctx.stroke();ctx.restore();
}
function artwork(ctx:CanvasRenderingContext2D,name:keyof typeof carnivalArtwork,x:number,y:number,width:number,height:number){
 const image=carnivalArtwork[name];if(image.naturalWidth){const scale=Math.min(width/image.naturalWidth,height/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;ctx.drawImage(image,x+(width-w)/2,y+(height-h)/2,w,h);}
}
async function encodeCertificate(canvas:HTMLCanvasElement):Promise<string>{
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(Error('Could not prepare the photo.')),'image/jpeg',.96));
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as string);reader.onerror=()=>reject(Error('Could not read the photo.'));reader.readAsDataURL(blob);});
}
export async function certificate(scene:string|HTMLCanvasElement,participant:string,lang:Lang,config:Config):Promise<string>{
 await Promise.all([document.fonts.ready,carnivalArtworkLoaded]);
 await Promise.all([500,600,700,800].flatMap(weight=>[
  document.fonts.load(`${weight} 30px "${fontFamily(lang)}"`,'Cyber Carnival'),
  document.fonts.load(`${weight} 30px "${fontFamily(lang)}"`,'صورتك'),
 ]));
 let image:HTMLImageElement|HTMLCanvasElement;
 if(typeof scene==='string'){image=new Image();image.src=scene;await image.decode();}else image=scene;
 const {landscape,width:w,height:h}=certificateLayout(config.certificateOrientation),frame=certificatePhotoFrame(config.certificateOrientation),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const sourceWidth='naturalWidth' in image?image.naturalWidth:image.width,sourceHeight='naturalHeight' in image?image.naturalHeight:image.height;
 const ctx=canvas.getContext('2d')!,crop=coverCrop(sourceWidth,sourceHeight,frame.width,frame.height);
 if(landscape){
  ctx.fillStyle='#01091b';ctx.fillRect(0,0,w,h);
  neonFrame(ctx,frame.x-12,frame.y-12,frame.width+24,frame.height+24,25);
  ctx.save();ctx.beginPath();ctx.roundRect(frame.x,frame.y,frame.width,frame.height,15);ctx.clip();
  ctx.drawImage(image,crop.sx,crop.sy,crop.sw,crop.sh,frame.x,frame.y,frame.width,frame.height);ctx.restore();
  const footerTop=frame.y+frame.height+24;
  artwork(ctx,'brand-lockup',(w-240)/2,footerTop,240,h-footerTop-24);
  return encodeCertificate(canvas);
 }
 drawCarnivalBackdrop(ctx,w,h);ctx.fillStyle='#00123952';ctx.fillRect(0,0,w,h);
 // Keep the optional portrait template separate from the approved landscape layout.
 artwork(ctx,'tents',260,-5,680,209);artwork(ctx,'brand',45,22,370,160);
 const align=lang==='ar'?'right':'left',display=participant.includes('@')?(lang==='ar'?'مشارك في التوعية السيبرانية':'Cybersecurity participant'):participant;
 fitText(ctx,lang==='ar'?'صورتك':'YOUR PHOTO',635,56,510,80,24,'#d9fbff',lang,'center',800);
 neonFrame(ctx,frame.x-12,frame.y-12,frame.width+24,frame.height+24,25);
 ctx.save();ctx.beginPath();ctx.roundRect(frame.x,frame.y,frame.width,frame.height,15);ctx.clip();
 ctx.drawImage(image,crop.sx,crop.sy,crop.sw,crop.sh,frame.x,frame.y,frame.width,frame.height);ctx.restore();
 neonFrame(ctx,64,1362,w-128,316,24);
 fitText(ctx,config.title[lang],104,1376,w-208,80,36,'#fff',lang,'center',800);
 fitText(ctx,display,104,1465,w-208,80,34,'#81edff',lang,'center',700);
 fitText(ctx,config.acknowledgement[lang],104,1554,w-208,106,24,'#e1eeff',lang,'center',500);
 artwork(ctx,'star',60,1710,70,58);artwork(ctx,'shield',w-145,1695,85,78);
 const date=new Date().toLocaleDateString(lang==='ar'?'ar-AE':'en-GB',{day:'numeric',month:'short',year:'numeric'});
 fitText(ctx,lang==='ar'?'العب بذكاء. ابقَ آمناً.':'PLAY SMART. STAY SAFE.',170,h-65,520,35,18,'#d6e8ff',lang,align,700);
 fitText(ctx,date,w-480,h-65,310,35,18,'#d6e8ff',lang,'right',600);
 return encodeCertificate(canvas);
}
export async function printCalibration(config:Config):Promise<string>{
 await bubblesLoaded;
 const {landscape,photoWidth,photoHeight}=certificateLayout(config.certificateOrientation),scene=document.createElement('canvas');scene.width=photoWidth;scene.height=photoHeight;
 const ctx=scene.getContext('2d')!,scale=scene.height/1120;drawCarnivalBackdrop(ctx,scene.width,scene.height);ctx.save();ctx.translate((scene.width-900*scale)/2,0);ctx.scale(scale,scale);drawDemo(ctx,false);ctx.restore();
 drawBubbles(ctx,{x:.5,y:491/1120,w:234*scale/scene.width,h:330/1120},config.phrases.filter(p=>p.enabled).slice(0,4),'en',0,scene.height,9999,scene.width);
 const result=await certificate(scene.toDataURL('image/jpeg',.95),'PRINTER TEST · اختبار الطباعة','en',config),img=new Image();img.src=result;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const c=canvas.getContext('2d')!;c.drawImage(img,0,0);
 c.strokeStyle='#ed614a';c.lineWidth=3;c.setLineDash([14,10]);c.strokeRect(55,55,canvas.width-110,canvas.height-110);c.setLineDash([]);
 const y=scene.height-100;round(c,80,y,canvas.width-160,72,16,'#102542ed');c.font='600 22px "Noto Kufi Arabic"';c.fillStyle='#fff';c.textAlign='center';c.fillText(`${landscape?'6 × 4 LANDSCAPE':'4 × 6 PORTRAIT'} · 300 DPI · CHECK ALL FOUR DASHED EDGES`,canvas.width/2,y+44);
 ['#2475f0','#f35c77','#ffd66c','#ffffff','#172d49'].forEach((colour,i)=>round(c,canvas.width-320+i*42,80,34,42,4,colour));return canvas.toDataURL('image/jpeg',.96);
}
