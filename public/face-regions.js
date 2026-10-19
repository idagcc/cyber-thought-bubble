/* Pure geometry shared by the offline worker and detector regression checks. */
function faceRegions(width,height){
 const w=Math.round(width*.42),h=Math.round(height*.66);
 return [0,height-h].flatMap(y=>[0,Math.round((width-w)/2),width-w].map(x=>({x,y,width:w,height:h})));
}
function regionFaces(detections,region,width,height,source){
 return detections.flatMap(d=>{
  const b=d.boundingBox;if(!b||b.width<=0||b.height<=0)return [];
  // A cut-off face at an interior crop edge is handled by the overlapping crop.
  if(source==='tile'&&((region.x>0&&b.originX<1)||(region.y>0&&b.originY<1)||(region.x+region.width<width&&b.originX+b.width>region.width-1)||(region.y+region.height<height&&b.originY+b.height>region.height-1)))return [];
  const left=Math.max(0,region.x+b.originX),top=Math.max(0,region.y+b.originY),right=Math.min(width,region.x+b.originX+b.width),bottom=Math.min(height,region.y+b.originY+b.height);
  if(right<=left||bottom<=top)return [];
  return [{x:(left+right)/2/width,y:(top+bottom)/2/height,w:(right-left)/width,h:(bottom-top)/height,confidence:d.categories?.[0]?.score??0,source}];
 });
}
function mergeRegionFaces(faces){
 const kept=[];
 for(const face of [...faces].sort((a,b)=>b.confidence-a.confidence)){
  const duplicate=kept.some(other=>{
   const iw=Math.max(0,Math.min(face.x+face.w/2,other.x+other.w/2)-Math.max(face.x-face.w/2,other.x-other.w/2)),ih=Math.max(0,Math.min(face.y+face.h/2,other.y+other.h/2)-Math.max(face.y-face.h/2,other.y-other.h/2));
   const overlap=iw*ih/(face.w*face.h+other.w*other.h-iw*ih);
   const centered=Math.abs(face.x-other.x)<Math.min(face.w,other.w)*.28&&Math.abs(face.y-other.y)<Math.min(face.h,other.h)*.28;
   return overlap>.35||centered;
  });
  if(!duplicate)kept.push(face);
 }
 return kept;
}
