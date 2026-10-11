import type {Config,Lang,Phrase} from './types';
import type {Face} from './presence';
export const sceneW=900,sceneH=1120;
export function round(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
export function lines(ctx:CanvasRenderingContext2D,text:string,maxWidth:number){const words=text.split(/\s+/);const result:string[]=[];let line='';for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>maxWidth&&line){result.push(line);line=word;}else line=next;}if(line)result.push(line);return result;}
export function textBlock(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,width:number,size:number,color:string,lang:Lang,maxLines=5){
 ctx.font=`600 ${size}px "${lang==='ar'?'Noto Sans Arabic':'DM Sans'}"`;let wrapped=lines(ctx,text,width);while(wrapped.length>maxLines&&size>13){size--;ctx.font=`600 ${size}px "${lang==='ar'?'Noto Sans Arabic':'DM Sans'}"`;wrapped=lines(ctx,text,width);}ctx.fillStyle=color;ctx.textAlign='center';ctx.direction=lang==='ar'?'rtl':'ltr';wrapped.forEach((line,i)=>ctx.fillText(line,x,y+i*size*1.5));return wrapped.length*size*1.5;
}
export function drawPlaceholder(ctx:CanvasRenderingContext2D){
 const bg=ctx.createLinearGradient(0,0,900,1120);bg.addColorStop(0,'#082653');bg.addColorStop(.5,'#061b40');bg.addColorStop(1,'#031029');ctx.fillStyle=bg;ctx.fillRect(0,0,900,1120);
 ctx.strokeStyle='#80d7ce16';ctx.lineWidth=1;for(let x=0;x<900;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,1120);ctx.stroke();}for(let y=0;y<1120;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(900,y);ctx.stroke();}
 const glow=ctx.createRadialGradient(450,540,20,450,540,500);glow.addColorStop(0,'#168aff30');glow.addColorStop(1,'#168aff00');ctx.fillStyle=glow;ctx.fillRect(0,0,900,1120);
 ctx.strokeStyle='#79baae38';ctx.setLineDash([9,15]);ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(450,480,148,190,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(170,1119);ctx.bezierCurveTo(140,820,245,725,357,711);ctx.quadraticCurveTo(450,770,543,711);ctx.bezierCurveTo(655,725,760,820,730,1119);ctx.stroke();ctx.setLineDash([]);
 ctx.strokeStyle='#a9f2ff';ctx.lineWidth=4;[[280,290,1,1],[620,290,-1,1],[280,680,1,-1],[620,680,-1,-1]].forEach(([x,y,dx,dy])=>{ctx.beginPath();ctx.moveTo(x,y+dy*35);ctx.lineTo(x,y);ctx.lineTo(x+dx*35,y);ctx.stroke();});
}
export function drawDemo(ctx:CanvasRenderingContext2D){drawPlaceholder(ctx);const g=ctx.createLinearGradient(0,700,900,1120);g.addColorStop(0,'#547d91');g.addColorStop(1,'#183b53');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(190,1120);ctx.bezierCurveTo(175,820,260,760,355,737);ctx.lineTo(540,737);ctx.bezierCurveTo(650,770,725,850,710,1120);ctx.fill();round(ctx,393,605,112,173,40,'#bd8c71');ctx.fillStyle='#d5a487';ctx.beginPath();ctx.ellipse(450,491,117,166,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#17272d';ctx.beginPath();ctx.moveTo(332,458);ctx.bezierCurveTo(302,278,570,272,567,462);ctx.lineTo(538,398);ctx.bezierCurveTo(473,412,411,386,368,403);ctx.fill();ctx.fillStyle='#2c2c30';[407,493].forEach(x=>{ctx.beginPath();ctx.ellipse(x,494,7,9,0,0,Math.PI*2);ctx.fill();});ctx.strokeStyle='#875349';ctx.lineWidth=5;ctx.beginPath();ctx.arc(450,548,35,.15,Math.PI-.15);ctx.stroke();}
function cloudPath(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){
 const cx=x+w/2,cy=y+h/2,rx=w/2,ry=h/2,n=12;
 ctx.beginPath();
 for(let i=0;i<n;i++){const a=(i/n)*Math.PI*2,b=((i+1)/n)*Math.PI*2,mid=(a+b)/2;const sx=cx+Math.cos(a)*rx*.87,sy=cy+Math.sin(a)*ry*.87;const ex=cx+Math.cos(b)*rx*.87,ey=cy+Math.sin(b)*ry*.87;if(i===0)ctx.moveTo(sx,sy);ctx.quadraticCurveTo(cx+Math.cos(mid)*rx*1.16,cy+Math.sin(mid)*ry*1.16,ex,ey);}ctx.closePath();
}
export function drawBubbles(ctx:CanvasRenderingContext2D,face:Face,phrases:Phrase[],lang:Lang,tick:number,height=1120,reveal=9999){
 const cx=face.x*900,cy=face.y*height;
 const bubbleWidth=285;
 const anchors=[{x:30,y:Math.max(90,cy-370)},{x:585,y:Math.max(95,cy-345)},{x:24,y:Math.min(height-330,cy+140)},{x:591,y:Math.min(height-330,cy+170)}];
 anchors.forEach((a,i)=>{const p=phrases[i%phrases.length];if(!p)return;const y=a.y+Math.sin(tick/1100+i)*5,w=bubbleWidth;
 let font=lang==='ar'?25:27;ctx.font=`700 ${font}px "${lang==='ar'?'Noto Sans Arabic':'DM Sans'}"`;let wrapped=lines(ctx,p[lang],w-75);while(wrapped.length>5&&font>16){font--;ctx.font=`700 ${font}px "${lang==='ar'?'Noto Sans Arabic':'DM Sans'}"`;wrapped=lines(ctx,p[lang],w-75);}const h=Math.max(174,wrapped.length*font*1.5+70);
 const progress=Math.max(0,Math.min(1,(reveal-i*180)/420));if(!progress)return;const scale=.78+.22*(1-Math.pow(1-progress,3));ctx.save();ctx.globalAlpha=progress;ctx.translate(a.x+w/2,y+h/2);ctx.scale(scale,scale);ctx.translate(-a.x-w/2,-y-h/2);
 ctx.save();cloudPath(ctx,a.x,y,w,h);const fill=ctx.createRadialGradient(a.x+w/2,y+h/2,10,a.x+w/2,y+h/2,w*.75);fill.addColorStop(0,'#092967f5');fill.addColorStop(1,'#021333f5');ctx.fillStyle=fill;ctx.fill();
 ctx.lineWidth=5;ctx.strokeStyle='#008cff';ctx.shadowColor='#008cff';ctx.shadowBlur=24;ctx.stroke();ctx.shadowBlur=8;ctx.lineWidth=2.4;ctx.strokeStyle='#e4fbff';ctx.stroke();ctx.restore();
 textBlock(ctx,p[lang],a.x+w/2,y+(h-wrapped.length*font*1.5)/2+font,w-75,font,'#ffffff',lang,5);
 const tailX=i%2?a.x+85:a.x+w-85;const tailY=i<2?y+h+11:y-12;const sign=i<2?1:-1;
 [10,6].forEach((r,j)=>{ctx.save();ctx.beginPath();ctx.arc(tailX+(i%2?-1:1)*j*14,tailY+sign*j*26,r,0,Math.PI*2);ctx.fillStyle='#082963';ctx.fill();ctx.shadowColor='#078eff';ctx.shadowBlur=16;ctx.lineWidth=2.5;ctx.strokeStyle='#d2faff';ctx.stroke();ctx.restore();});
 ctx.restore();
 });
 // The brackets remain around the face, never inside the printed text.
 const fw=face.w*900/2+18,fh=face.h*height/2+25;ctx.save();ctx.strokeStyle='#a6faff';ctx.shadowColor='#008dff';ctx.shadowBlur=14;ctx.lineWidth=3;
 [[cx-fw,cy-fh,1,1],[cx+fw,cy-fh,-1,1],[cx-fw,cy+fh,1,-1],[cx+fw,cy+fh,-1,-1]].forEach(([x,y,dx,dy])=>{ctx.beginPath();ctx.moveTo(x,y+dy*30);ctx.lineTo(x,y);ctx.lineTo(x+dx*25,y);ctx.stroke();});ctx.restore();
}
export async function certificate(scene:string,participant:string,lang:Lang,config:Config):Promise<string>{
 await document.fonts.ready;const image=new Image();image.src=scene;await image.decode();const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1800;const ctx=canvas.getContext('2d')!;
 ctx.fillStyle='#f5f8ff';ctx.fillRect(0,0,1200,1800);ctx.drawImage(image,0,0,1200,1320);
 ctx.fillStyle='#168bff';ctx.fillRect(0,0,1200,12);round(ctx,45,43,230,51,25,'#06295cdc');ctx.fillStyle='#ffffff';ctx.font='600 20px "DM Sans"';ctx.textAlign='center';ctx.fillText('THOUGHT BUBBLE',160,76);
 ctx.fillStyle='#145dc0';ctx.textAlign='center';ctx.font=`600 20px "${lang==='ar'?'Noto Sans Arabic':'DM Sans'}"`;ctx.direction=lang==='ar'?'rtl':'ltr';ctx.fillText(lang==='ar'?'شهادة مشاركة':'CERTIFICATE OF PARTICIPATION',600,1373);
 textBlock(ctx,config.title[lang],600,1428,1090,43,'#0b2247',lang,2);
 const display=participant.includes('@')?(lang==='ar'?'مشارك في التوعية السيبرانية':'Cybersecurity participant'):participant;
 textBlock(ctx,display,600,1532,1080,32,'#145dc0',lang,2);
 textBlock(ctx,config.acknowledgement[lang],600,1615,980,24,'#53676a',lang,3);
 ctx.strokeStyle='#c9d9ef';ctx.beginPath();ctx.moveTo(70,1730);ctx.lineTo(1130,1730);ctx.stroke();ctx.font='400 18px "DM Sans"';ctx.fillStyle='#55706e';ctx.textAlign='left';ctx.direction='ltr';ctx.font=`400 18px "${lang==='ar'?'Noto Sans Arabic':'DM Sans'}"`;ctx.fillText(lang==='ar'?'عالم رقمي أكثر أماناً يبدأ بك':'A SAFER DIGITAL WORLD STARTS WITH YOU',70,1768);ctx.textAlign='right';ctx.fillText(new Date().toLocaleDateString(lang==='ar'?'ar-AE':'en-GB',{day:'numeric',month:'short',year:'numeric'}),1130,1768);
 return canvas.toDataURL('image/jpeg',.95);
}
