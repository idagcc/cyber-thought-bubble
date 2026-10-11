const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('station',Object.fromEntries(['config','setupStatus','login','setup','saveConfig','records','savePhoto','print','printers','openData','fullscreen','exit'].map(name=>[name,(...args)=>ipcRenderer.invoke(`station:${name}`,...args)])));
