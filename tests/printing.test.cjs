const {test}=require('node:test');
const assert=require('node:assert/strict');
const {printDocument,printImage}=require('../electron/printing.cjs');

test('landscape and legacy portrait records use their own image orientation',()=>{
 for(const [size,landscape,css] of [[{width:1800,height:1200},true,'6in 4in'],[{width:1200,height:1800},false,'4in 6in']]){
  const job=printDocument(Buffer.from('sample'),size,{printer:'Photo_Printer',silentPrint:true,certificateOrientation:landscape?'portrait':'landscape'});
  assert.equal(job.options.landscape,landscape);assert.match(job.html,new RegExp(css));
  assert.deepEqual(job.options.pageSize,{width:101600,height:152400});assert.equal(job.options.deviceName,'Photo_Printer');assert.equal(job.options.copies,1);
 }
});
function fixture({printers=[{name:'Photo_Printer'}],success=true,reason='',decodeError=false}={}){
 const state={windows:0,destroyed:false};
 class Window{
  constructor(){state.windows++;this.webContents={executeJavaScript:async()=>{if(decodeError)throw Error('decode failed');},print:(options,callback)=>{state.options=options;callback(success,reason);}};}
  async loadURL(url){state.url=url;}destroy(){state.destroyed=true;}
 }
 return {state,args:{BrowserWindow:Window,nativeImage:{createFromBuffer:()=>({getSize:()=>({width:1800,height:1200})})},owner:{webContents:{getPrintersAsync:async()=>printers}},image:Buffer.from('sample'),config:{printer:'Photo_Printer',silentPrint:false}}};
}
test('missing and disconnected printers fail without opening a print window',async()=>{
 const f=fixture({printers:[]});await assert.rejects(printImage(f.args),/No printer found/);assert.equal(f.state.windows,0);
 const g=fixture({printers:[{name:'Different_Printer'}]});await assert.rejects(printImage(g.args),/unavailable/);assert.equal(g.state.windows,0);
 const h=fixture();h.args.config={silentPrint:true,printer:''};await assert.rejects(printImage(h.args),/Select a printer/);
});
test('print callback and decode failures propagate and always close the print window',async()=>{
 for(const options of [{success:true},{success:false,reason:'Print job canceled'},{decodeError:true}]){
  const f=fixture(options);
  if(options.success===true){await printImage(f.args);assert.equal(f.state.options.landscape,true);assert.equal(f.state.options.silent,false);}
  else await assert.rejects(printImage(f.args),/canceled|decode failed/);
  assert.equal(f.state.destroyed,true);
 }
});
