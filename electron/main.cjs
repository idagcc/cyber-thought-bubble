const {app,BrowserWindow,ipcMain,protocol,net,session,shell,systemPreferences}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {Store}=require('./store.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'station',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
let main,store;
if(!app.isPackaged&&process.env.THOUGHT_BUBBLE_TEST_DATA)app.setPath('userData',process.env.THOUGHT_BUBBLE_TEST_DATA);
const single=app.requestSingleInstanceLock();if(!single)app.quit();
app.on('second-instance',()=>{main?.show();main?.focus();});
app.whenReady().then(async()=>{
 store=new Store(path.join(app.getPath('userData'),'station-data'));
 protocol.handle('station',req=>{const url=new URL(req.url);const root=path.join(__dirname,'../dist');const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(url.hostname!=='app'||(!file.startsWith(root+path.sep)&&file!==root))return new Response('Forbidden',{status:403});return net.fetch(pathToFileURL(file===root?path.join(root,'index.html'):file).href);});
 session.defaultSession.setPermissionRequestHandler((wc,permission,callback,details)=>callback(wc===main?.webContents&&permission==='media'&&details.mediaTypes?.every(t=>t==='video')===true));
 session.defaultSession.setPermissionCheckHandler((wc,permission,origin)=>wc===main?.webContents&&permission==='media'&&origin.startsWith('station://app'));
 function handle(name,fn){ipcMain.handle(`station:${name}`,(event,...args)=>{if(event.sender!==main?.webContents||!event.senderFrame.url.startsWith('station://app/'))throw Error('Unauthorized request');return fn(...args);});}
 handle('config',()=>store.read('config.json',null));handle('setupStatus',()=>store.hasPin());handle('setup',p=>store.setup(p));handle('login',p=>store.login(p));handle('saveConfig',(t,c)=>store.saveConfig(t,c));
 handle('records',t=>{store.authorize(t);return store.records();});handle('savePhoto',p=>store.savePhoto(p));
 handle('printers',t=>{store.authorize(t);return main.webContents.getPrintersAsync();});
 handle('openData',t=>{store.authorize(t);return shell.openPath(store.root);});
 handle('fullscreen',()=>main.setFullScreen(!main.isFullScreen()));handle('exit',t=>{store.authorize(t);app.quit();});
 handle('print',async id=>{
  if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid record.');
  const record=store.records().find(r=>r.id===id);if(!record)throw Error('Photo not found.');
  const config=store.read('config.json',{});
  const printers=await main.webContents.getPrintersAsync();if(!printers.length)throw Error('No printer found. Connect a printer and try again.');
  if(config.printer&&!printers.some(p=>p.name===config.printer))throw Error('Selected printer is unavailable. Check operator settings.');
  const image=fs.readFileSync(record.photoPath).toString('base64');
  const win=new BrowserWindow({show:false,width:800,height:1200,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  try {
   await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<html><head><style>@page{size:4in 6in;margin:0}*{box-sizing:border-box}html,body{margin:0;width:4in;height:6in}img{display:block;width:4in;height:6in;object-fit:contain}</style></head><body><img src="data:image/jpeg;base64,${image}"></body></html>`));
   await win.webContents.executeJavaScript('document.images[0].decode()');
   await new Promise((resolve,reject)=>win.webContents.print({silent:!!config.silentPrint,deviceName:config.printer||'',printBackground:true,color:true,margins:{marginType:'none'},pageSize:{width:101600,height:152400},usePrinterDefaultPageSize:false,copies:1},(success,reason)=>success?resolve():reject(Error(reason||'Printing was cancelled.'))));
   store.updatePrint(id,'submitted');
  }catch(e){store.updatePrint(id,'failed');throw e;}finally{win.destroy();}
 });
 main=new BrowserWindow({fullscreen:app.isPackaged,width:720,height:1160,minWidth:480,minHeight:760,backgroundColor:'#071b24',title:'Thought Bubble Studio',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 main.webContents.setWindowOpenHandler(()=>({action:'deny'}));main.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('station://app/'))e.preventDefault();});
 await main.loadURL('station://app/index.html');
 if(process.platform==='darwin'&&systemPreferences.getMediaAccessStatus('camera')==='not-determined')await systemPreferences.askForMediaAccess('camera');
});
app.on('window-all-closed',()=>app.quit());
