import {useEffect,useState} from 'react';
import {Camera,RefreshCw} from 'lucide-react';
import {orderCameras} from './cameraSession';
import type {Lang} from './types';

export default function CameraSelect({cameraId,status,lang,onChange}:{cameraId:string;status:string;lang:Lang;onChange:(id:string)=>void}){
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[refresh,setRefresh]=useState(0),[error,setError]=useState(false);
 const ar=lang==='ar';
 useEffect(()=>{
  let active=true;
  const update=async()=>{
   try{const list=orderCameras(await navigator.mediaDevices.enumerateDevices());if(active){setDevices(list);setError(false);}}
   catch{if(active)setError(true);}
  };
  void update();navigator.mediaDevices?.addEventListener('devicechange',update);
  return()=>{active=false;navigator.mediaDevices?.removeEventListener('devicechange',update);};
 },[status,refresh]);
 return <div className="camera-select">
  <label htmlFor="live-camera"><Camera size={16}/>{ar?'اختيار الكاميرا':'Select camera'}</label>
  <div className="camera-select-row">
   <select id="live-camera" autoFocus value={cameraId} onChange={e=>onChange(e.target.value)}>
    <option value="">{ar?'اختيار تلقائي':'Choose automatically'}</option>
    {cameraId&&!devices.some(d=>d.deviceId===cameraId)&&<option value={cameraId}>{ar?'الكاميرا المحددة غير متصلة':'Selected camera (disconnected)'}</option>}
    {devices.filter(d=>d.deviceId).map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||(ar?`الكاميرا ${i+1}`:`Camera ${i+1}`)}</option>)}
   </select>
   <button className="secondary" aria-label={ar?'تحديث الكاميرات':'Refresh cameras'} title={ar?'تحديث الكاميرات':'Refresh cameras'} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={17}/></button>
  </div>
  {error&&<p role="status">{ar?'تعذّر عرض الكاميرات. حاول التحديث.':'Could not list cameras. Try refreshing.'}</p>}
 </div>;
}
