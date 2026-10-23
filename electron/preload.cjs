const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('station',Object.fromEntries(['config','setupStatus','login','setup','saveConfig','records','savePhoto','print','testPrint','printers','openData','fullscreen','exit','cameraAccess','cameraSettings','systemInfo'].map(name=>[name,(...args)=>ipcRenderer.invoke(`station:${name}`,...args)])));
contextBridge.exposeInMainWorld('stationFullscreen',callback=>{
 let active=true,changed=false;
 const listener=(_event,isFullscreen)=>{changed=true;callback(isFullscreen);};
 ipcRenderer.on('station:fullscreen-changed',listener);
 // Read the initial state as well, including after a renderer reload.
 ipcRenderer.invoke('station:fullscreenState').then(isFullscreen=>{if(active&&!changed)callback(isFullscreen);}).catch(()=>{});
 return()=>{active=false;ipcRenderer.removeListener('station:fullscreen-changed',listener);};
});
