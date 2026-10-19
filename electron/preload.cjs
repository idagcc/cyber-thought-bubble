const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('station',Object.fromEntries(['config','setupStatus','login','setup','saveConfig','records','savePhoto','print','testPrint','printers','openData','fullscreen','exit','cameraAccess','cameraSettings'].map(name=>[name,(...args)=>ipcRenderer.invoke(`station:${name}`,...args)])));
