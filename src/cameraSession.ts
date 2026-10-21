export function orderCameras(devices:MediaDeviceInfo[]){
 return devices.filter(d=>d.kind==='videoinput').sort((a,b)=>{
  const score=(label:string)=>/virtual|obs/i.test(label)?2:/insta360.*link|link\s*2c/i.test(label)?-1:/macbook|built.in|facetime|integrated/i.test(label)?0:1;
  return score(a.label)-score(b.label);
 });
}
async function timedStream(media:MediaDevices,video:MediaTrackConstraints|boolean,timeoutMs:number){
 let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
 const pending=media.getUserMedia({video,audio:false}).then(stream=>{if(expired){stream.getTracks().forEach(t=>t.stop());throw new Error('Camera request expired.');}return stream;});
 try{return await Promise.race([pending,new Promise<MediaStream>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new DOMException('The camera did not respond.','NotReadableError'));},timeoutMs);})]);}
 finally{clearTimeout(timer);}
}
export async function openCamera(media:MediaDevices,cameraId:string,timeoutMs=12000,mode:'smooth'|'detail'='detail'):Promise<MediaStream>{
 const devices=orderCameras(await media.enumerateDevices());
 const candidates=cameraId?[cameraId]:devices.length?devices.map(d=>d.deviceId):[''];
 let last:unknown=new Error('No camera was found.');
 for(const id of candidates){
  try{return await timedStream(media,{...(id?{deviceId:{exact:id}}:{facingMode:'user'}),width:{ideal:mode==='detail'?3840:1920},height:{ideal:mode==='detail'?2160:1080},aspectRatio:{ideal:16/9},frameRate:{ideal:mode==='detail'?30:60,max:mode==='detail'?30:60}},timeoutMs);}
  catch(e){last=e;if((e as Error).name==='NotAllowedError'||(e as Error).name==='SecurityError')throw e;}
 }
 throw last;
}
export function cameraMessage(name:string,ar:boolean){
 if(name==='NotAllowedError'||name==='SecurityError')return ar?'اسمح للتطبيق بالوصول إلى الكاميرا في إعدادات الخصوصية، ثم حاول مجدداً.':'Allow camera access in Privacy settings, then try again.';
 if(name==='NotFoundError'||name==='OverconstrainedError')return ar?'الكاميرا المحددة غير متصلة. صِلها أو اختر كاميرا أخرى.':'The selected camera is disconnected. Connect it or choose another camera.';
 if(name==='NotReadableError'||name==='AbortError')return ar?'تعذّر بدء الكاميرا. أغلق التطبيقات التي تستخدمها أو اختر كاميرا أخرى.':'The camera could not start. Close other camera apps or choose another camera.';
 return ar?'تحقق من توصيل الكاميرا، ثم حاول مجدداً.':'Check the camera connection, then try again.';
}
