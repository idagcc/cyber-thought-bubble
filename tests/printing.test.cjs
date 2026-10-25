const {test}=require('node:test');
const assert=require('node:assert/strict');
const {printDocument,printImage,selectPrinter}=require('../electron/printing.cjs');

test('landscape and legacy portrait records use their own image orientation',()=>{
 for(const [size,landscape,css] of [[{width:1800,height:1200},true,'6in 4in'],[{width:1200,height:1800},false,'4in 6in']]){
  const job=printDocument(Buffer.from('sample'),size,{printer:'Photo_Printer',silentPrint:true,certificateOrientation:landscape?'portrait':'landscape'});
  assert.equal('landscape' in job.options,false);assert.match(job.html,new RegExp(css));
  assert.deepEqual(job.options.pageSize,landscape?{width:152400,height:101600}:{width:101600,height:152400});assert.equal(job.options.deviceName,'Photo_Printer');assert.equal(job.options.copies,1);
 }
});
test('HiTi keeps its native media size while fitting the entire certificate with adjustable clearance',()=>{
 for(const [size,pageSize] of [[{width:1800,height:1200},{width:156000,height:105000}],[{width:1200,height:1800},{width:105000,height:156000}]]){
  const config={printer:'HiTi_P525',hitiBorderless:true};
  const job=printDocument(Buffer.from('sample'),size,config);
  assert.deepEqual(job.options.pageSize,pageSize);
  assert.match(job.html,/object-fit:contain/);assert.doesNotMatch(job.html,/object-fit:cover/);
  assert.match(job.html,/width:95%;height:95%/);
  assert.match(job.html,/align-items:center;justify-content:center/);
  for(const printScale of [80,90,100])assert.match(printDocument(Buffer.from('sample'),size,{...config,printScale}).html,new RegExp(`width:${printScale}%;height:${printScale}%`));
 }
});
test('horizontal print adjustment supports moving right or left without changing paper size',()=>{
 const size={width:1800,height:1200};
 for(const printOffsetXmm of [-5,-.5,0,.5,5]){
  const job=printDocument(Buffer.from('sample'),size,{hitiBorderless:true,printOffsetXmm});
  assert.ok(job.html.includes(`transform:translateX(${printOffsetXmm}mm)`));
  assert.deepEqual(job.options.pageSize,{width:156000,height:105000});
 }
 assert.ok(printDocument(Buffer.from('sample'),size,{}).html.includes('transform:translateX(0mm)'));
});
function fixture({printers=[{name:'Photo_Printer'}],success=true,reason='',decodeError=false}={}){
 const state={windows:0,destroyed:false};
 class Window{
  constructor(options){state.windowOptions=options;state.windows++;this.webContents={executeJavaScript:async()=>{if(decodeError)throw Error('decode failed');},print:(options,callback)=>{state.options=options;callback(success,reason);}};}
  async loadURL(url){state.url=url;}destroy(){state.destroyed=true;}
 }
 return {state,args:{BrowserWindow:Window,nativeImage:{createFromBuffer:()=>({getSize:()=>({width:1800,height:1200})})},owner:{webContents:{getPrintersAsync:async()=>printers}},image:Buffer.from('sample'),config:{printer:'Photo_Printer',silentPrint:false}}};
}
test('missing and disconnected printers fail without opening a print window',async()=>{
 const f=fixture({printers:[]});await assert.rejects(printImage(f.args),/No printer found/);assert.equal(f.state.windows,0);
 const g=fixture({printers:[{name:'Different_Printer'}]});await assert.rejects(printImage(g.args),/unavailable/);assert.equal(g.state.windows,0);
 const h=fixture();h.args.config={silentPrint:true,printer:''};await printImage(h.args);assert.equal(h.state.options.deviceName,'Photo_Printer');
});
test('print callback and decode failures propagate and always close the print window',async()=>{
 for(const options of [{success:true},{success:false,reason:'Print job canceled'},{decodeError:true}]){
  const f=fixture(options);
  if(options.success===true){await printImage(f.args);assert.equal('landscape' in f.state.options,false);assert.deepEqual(f.state.options.pageSize,{width:152400,height:101600});assert.equal(f.state.options.silent,true);}
  else await assert.rejects(printImage(f.args),/canceled|decode failed/);
  assert.equal(f.state.destroyed,true);
 }
});

test('background printing stays hidden and never reopens a dialog for legacy settings',async()=>{
 const f=fixture();await printImage(f.args);
 assert.equal(f.state.windowOptions.show,false);assert.equal(f.state.windowOptions.focusable,false);
 assert.equal(f.state.windowOptions.skipTaskbar,true);assert.equal(f.state.windowOptions.webPreferences.backgroundThrottling,false);
 assert.equal(f.state.options.silent,true);
});
test('DNP RX1HS uses the driver media form instead of a custom Windows paper size',async()=>{
 for(const name of ['DNP DS-RX1HS','DS-RX1','DNP RX1HS','DNP_RX1HS','DNP_RX1HS_2']){
  const f=fixture({printers:[{name}]});f.args.config={printer:name};await printImage(f.args);
  assert.equal(f.state.options.usePrinterDefaultPageSize,true);assert.equal('pageSize' in f.state.options,false);
  assert.equal(f.state.options.deviceName,name);assert.equal('landscape' in f.state.options,false);
 }
});
test('default printer resolution excludes file-output devices and never switches a saved printer',()=>{
 const pdf={name:'Microsoft Print to PDF',isDefault:true},dnp={name:'DS-RX1',displayName:'DNP Photo'};
 assert.equal(selectPrinter([pdf,dnp],''),dnp);
 assert.throws(()=>selectPrinter([pdf],''),/Select the event printer/);
 assert.throws(()=>selectPrinter([pdf,dnp],pdf.name),/physical photo printer/);
 assert.throws(()=>selectPrinter([dnp],'Disconnected_Printer'),/unavailable/);
 assert.throws(()=>selectPrinter([dnp,{name:'Another_Photo_Printer'}],''),/Select the event printer/);
 assert.equal(selectPrinter([dnp,{name:'Other',isDefault:true}],'' ).name,'Other');
});
test('unresponsive drivers time out, close the hidden window and do not retry',async()=>{
 const f=fixture();let submissions=0;
 const Window=f.args.BrowserWindow;
 f.args.BrowserWindow=class extends Window{constructor(options){super(options);this.webContents.print=()=>{submissions++;};}};
 f.args.timeoutMs=15;
 await assert.rejects(printImage(f.args),/print queue before retrying/);
 assert.equal(submissions,1);assert.equal(f.state.destroyed,true);
});
