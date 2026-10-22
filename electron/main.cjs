const {app,BrowserWindow,ipcMain,protocol,net,session,shell,systemPreferences,nativeImage}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {Store}=require('./store.cjs');
const {printImage}=require('./printing.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'station',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
let main,store,printing=false;
const recording=process.argv.includes('--recording');
const simulatedCamera=process.argv.includes('--use-fake-device-for-media-stream');
// Packaged smoke tests also use an isolated profile, with a fake camera required.
if(process.env.THOUGHT_BUBBLE_TEST_DATA&&(!app.isPackaged||simulatedCamera))app.setPath('userData',process.env.THOUGHT_BUBBLE_TEST_DATA);
const single=app.requestSingleInstanceLock();if(!single)app.quit();
app.on('second-instance',()=>{main?.show();main?.focus();});
app.whenReady().then(async()=>{
 store=new Store(path.join(app.getPath('userData'),'station-data'));
 protocol.handle('station',req=>{const url=new URL(req.url);const root=path.join(__dirname,'../dist');const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(url.hostname!=='app'||(!file.startsWith(root+path.sep)&&file!==root))return new Response('Forbidden',{status:403});return net.fetch(pathToFileURL(file===root?path.join(root,'index.html'):file).href);});
 session.defaultSession.setPermissionRequestHandler((wc,permission,callback,details)=>callback(wc===main?.webContents&&permission==='media'&&details.mediaTypes?.every(t=>t==='video')===true));
 session.defaultSession.setPermissionCheckHandler((wc,permission,origin)=>wc===main?.webContents&&permission==='media'&&origin.startsWith('station://app'));
 function handle(name,fn){ipcMain.handle(`station:${name}`,(event,...args)=>{if(event.sender!==main?.webContents||!event.senderFrame.url.startsWith('station://app/'))throw Error('Unauthorized request');return fn(...args);});}
 handle('config',()=>store.read('config.json',null));handle('setupStatus',()=>store.hasPin());handle('setup',p=>store.setup(p));handle('login',p=>store.login(p));handle('saveConfig',(t,c)=>store.saveConfig(t,c));
 handle('systemInfo',()=>({platform:process.platform,arch:process.arch,cpuCores:os.availableParallelism(),gpuAvailable:app.getGPUFeatureStatus().webgl==='enabled'}));
 handle('records',t=>{store.authorize(t);return store.records();});handle('savePhoto',p=>store.savePhoto(p));
 handle('printers',t=>{store.authorize(t);return main.webContents.getPrintersAsync();});
 handle('openData',t=>{store.authorize(t);return shell.openPath(store.root);});
 handle('fullscreen',()=>main.setFullScreen(!main.isFullScreen()));handle('exit',t=>{store.authorize(t);app.quit();});
 handle('cameraAccess',async()=>{
  if(process.platform!=='darwin'||simulatedCamera)return 'granted';
  let status=systemPreferences.getMediaAccessStatus('camera');
  if(status==='not-determined')status=await systemPreferences.askForMediaAccess('camera')?'granted':'denied';
  return status;
 });
 handle('cameraSettings',()=>process.platform==='darwin'?shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera'):process.platform==='win32'?shell.openExternal('ms-settings:privacy-webcam'):undefined);
 async function submitPrint(image){
  if(printing)throw Error('A print job is already in progress. Wait before trying again.');
  printing=true;
  try{await printImage({BrowserWindow,nativeImage,owner:main,image,config:store.read('config.json',{})});}
  finally{printing=false;}
 }
 handle('testPrint',async(t,image)=>{
  store.authorize(t);
  if(typeof image!=='string'||!image.startsWith('data:image/jpeg;base64,')||image.length>24_000_000)throw Error('Invalid test image.');
  await submitPrint(Buffer.from(image.split(',')[1],'base64'));
 });
 handle('print',async id=>{
  if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid record.');
  const record=store.records().find(r=>r.id===id);if(!record)throw Error('Photo not found.');
  try {
   await submitPrint(fs.readFileSync(record.photoPath));
   store.updatePrint(id,'submitted');
  }catch(e){store.updatePrint(id,'failed',e.message);throw e;}
 });
 main=new BrowserWindow({fullscreen:app.isPackaged&&!recording,frame:!recording,useContentSize:true,width:1280,height:720,minWidth:960,minHeight:540,backgroundColor:'#000000',title:'Thought Bubble Studio',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 main.setAspectRatio(16/9);
 main.webContents.on('console-message',(details)=>{if(details.message?.startsWith('[camera]'))console.log(details.message);});
 main.webContents.setWindowOpenHandler(()=>({action:'deny'}));main.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('station://app/'))e.preventDefault();});
 await main.loadURL('station://app/index.html');
});
app.on('window-all-closed',()=>app.quit());
