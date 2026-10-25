export type Point={x:number;y:number;radius:number};
// Size the display raster in physical pixels, including OS display scaling.
export function displayRasterSize(width:number,height:number,pixelRatio=1){
 const ratio=Number.isFinite(pixelRatio)&&pixelRatio>0?pixelRatio:1;
 const scale=Math.min(ratio,4096/Math.max(width,height));
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export type BubbleFrame={x:number;y:number;width:number;height:number;tails:Point[]};
// The camera scene and printed photo window share an aspect ratio, so groups are
// framed once and the certificate never stretches or letterboxes their photo.
export function certificateLayout(orientation?:'landscape'|'portrait'){
 const landscape=orientation!=='portrait';
 return {landscape,width:landscape?1800:1200,height:landscape?1200:1800,photoWidth:landscape?1800:1200,photoHeight:landscape?1000:1320};
}
// Inset the entire capture inside the branded border, preserving every person
// and thought. This frame shares the snapshot's exact aspect ratio.
export function certificatePhotoFrame(orientation?:'landscape'|'portrait'){
 const {landscape,photoWidth,photoHeight}=certificateLayout(orientation);
 const width=landscape?1536:1020;
 // Widen the decorative border while keeping the photo bottom and logo footer fixed.
 return {x:landscape?132:90,y:landscape?140:200,width,height:width*photoHeight/photoWidth};
}
export function coverCrop(sourceWidth:number,sourceHeight:number,targetWidth:number,targetHeight:number){
 if([sourceWidth,sourceHeight,targetWidth,targetHeight].some(value=>!Number.isFinite(value)||value<=0))throw new RangeError('Photo dimensions must be positive.');
 const scale=Math.max(targetWidth/sourceWidth,targetHeight/sourceHeight),sw=targetWidth/scale,sh=targetHeight/scale;
 return {sx:(sourceWidth-sw)/2,sy:(sourceHeight-sh)/2,sw,sh};
}
// Every thought occupies its own fixed cell. Tails travel inward, never into another row.
export function bubbleFrames(width:number,height:number,faceX=.5):BubbleFrame[]{
 const wide=width>height,margin=width*(wide?.035:.025),w=width*(wide?.255:.32),h=height*(wide?.27:.205);
 const rows=wide?[height*.17,height*.49]:[height*.15,height*.48];
 const shifted=wide&&(faceX<.38||faceX>.62);
 const columns=shifted?(faceX>.62?[width*.035,width*.335]:[width*.41,width*.71]):[margin,width-margin-w];
 return [0,1,2,3].map(i=>{
  const right=shifted?faceX<.38:i%2===1,x=columns[i%2],y=rows[Math.floor(i/2)];
  const r=Math.min(width*.008,height*.017),direction=right?-1:1,edge=right?x:x+w;
  return {x,y,width:w,height:h,tails:[{x:edge+direction*r*1.9,y:y+h*.62,radius:r},{x:edge+direction*r*4.2,y:y+h*.68,radius:r*.56}]};
 });
}
export function wrapMeasured(text:string,maxWidth:number,measure:(s:string)=>number):string[]{
 const result:string[]=[];let line='';
 for(const word of text.trim().split(/\s+/)){
  if(measure(word)>maxWidth){
   if(line){result.push(line);line='';}
   for(const char of word){if(line&&measure(line+char)>maxWidth){result.push(line);line=char;}else line+=char;}
  }else{const next=line?`${line} ${word}`:word;if(line&&measure(next)>maxWidth){result.push(line);line=word;}else line=next;}
 }
 if(line)result.push(line);return result;
}
