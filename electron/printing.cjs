// Keep paper orientation tied to the saved image, including older certificates.
function printDocument(image, size, config) {
 if (!size.width || !size.height) throw Error('The certificate image could not be opened.');
 const landscape = size.width > size.height;
 // HiTi's macOS driver reports its borderless "6 x 4" form as 156 x 105 mm.
 // Match that native form exactly; a generic 152.4 x 101.6 mm custom sheet
 // leaves the driver to center the smaller page inside the photo media.
 const hitiBorderless = config.hitiBorderless === true;
 const widthUm = hitiBorderless ? (landscape ? 156000 : 105000) : (landscape ? 152400 : 101600);
 const heightUm = hitiBorderless ? (landscape ? 105000 : 156000) : (landscape ? 101600 : 152400);
 const width = widthUm / 25400, height = heightUm / 25400;
 const fit = hitiBorderless ? 'cover' : 'contain';
 return {
  html: `<html><head><title>Thought Bubble certificate</title><style>@page{size:${width}in ${height}in;margin:0}*{box-sizing:border-box}html,body{margin:0;width:${width}in;height:${height}in;overflow:hidden}img{display:block;width:100%;height:100%;object-fit:${fit}}</style></head><body><img src="data:image/jpeg;base64,${image.toString('base64')}"></body></html>`,
  // The @page rule above already fixes the sheet orientation from the image.
  // Passing Electron's landscape flag as well can rotate the page a second time
  // or conflict with the printer driver's selected media form.
  options: {silent:true,deviceName:config.printer||'',printBackground:true,color:true,margins:{marginType:'none'},...(config.driverPaperSize?{usePrinterDefaultPageSize:true}:{pageSize:{width:widthUm,height:heightUm}}),copies:1,duplexMode:'simplex'}
 };
}

// File-output printers can show a Save As dialog even with silent printing.
const virtualPrinter=p=>/\b(pdf|xps|onenote|fax)\b/i.test(`${p.name} ${p.displayName||''}`);
function selectPrinter(printers,name){
 if(!printers.length)throw Error('No printer found. Install the printer driver, connect the printer, then refresh devices.');
 const physical=printers.filter(p=>!virtualPrinter(p));
 const selected=name?printers.find(p=>p.name===name):physical.find(p=>p.isDefault)||(physical.length===1?physical[0]:null);
 if(!selected)throw Error(name?'Selected printer is unavailable. Check its connection and refresh devices in Station settings.':'Select the event printer in Operator → Station, or set it as the system default printer.');
 if(virtualPrinter(selected))throw Error('Select a physical photo printer in Operator → Station. File-output printers require a dialog.');
 return selected;
}
async function printImage({BrowserWindow,nativeImage,owner,image,config,timeoutMs=30000}) {
 const printers=await owner.webContents.getPrintersAsync();
 const printer=selectPrinter(printers,config.printer);
 // DNP drivers expose named media forms; use their configured form instead of
 // asking Windows for an arbitrary custom size. Set the driver to (6x4).
 const driverPaperSize=/(?:^|[^a-z0-9])(?:DS[\s_-]?)?RX[\s_-]?1(?:HS)?(?=$|[^a-z0-9])/i.test(`${printer.name} ${printer.displayName||''}`);
 const hitiBorderless=process.platform==='darwin'&&/hiti[\s_-]*p525/i.test(`${printer.name} ${printer.displayName||''}`);
 const job=printDocument(image,nativeImage.createFromBuffer(image).getSize(),{...config,printer:printer.name,driverPaperSize,hitiBorderless});
 const win=new BrowserWindow({show:false,focusable:false,skipTaskbar:true,parent:owner,width:900,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 let timer;
 try {
  await Promise.race([
   (async()=>{
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(job.html));
    await win.webContents.executeJavaScript('document.images[0].decode()');
    await new Promise((resolve,reject)=>win.webContents.print(job.options,(success,reason)=>success?resolve():reject(Error(`Printer "${printer.name}": ${reason||'Print job failed'}. Check the driver, paper size, ribbon and paper.`))));
   })(),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`Printer "${printer.name}" did not respond. Check the system print queue before retrying to avoid a duplicate print.`)),timeoutMs);})
  ]);
 }finally{clearTimeout(timer);win.destroy();}
}
module.exports={printDocument,printImage,selectPrinter};
