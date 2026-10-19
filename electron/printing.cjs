// Keep paper orientation tied to the saved image, including older certificates.
function printDocument(image, size, config) {
 if (!size.width || !size.height) throw Error('The certificate image could not be opened.');
 const landscape = size.width > size.height;
 const width = landscape ? 6 : 4, height = landscape ? 4 : 6;
 return {
  html: `<html><head><title>Thought Bubble certificate</title><style>@page{size:${width}in ${height}in;margin:0}*{box-sizing:border-box}html,body{margin:0;width:${width}in;height:${height}in;overflow:hidden}img{display:block;width:100%;height:100%;object-fit:contain}</style></head><body><img src="data:image/jpeg;base64,${image.toString('base64')}"></body></html>`,
  options: {silent:!!config.silentPrint,deviceName:config.printer||'',landscape,printBackground:true,color:true,margins:{marginType:'none'},pageSize:{width:101600,height:152400},copies:1,duplexMode:'simplex'}
 };
}

async function printImage({BrowserWindow,nativeImage,owner,image,config}) {
 if(config.silentPrint&&!config.printer)throw Error('Select a printer before enabling direct printing.');
 const printers=await owner.webContents.getPrintersAsync();
 if(!printers.length)throw Error('No printer found. Install the printer driver, connect the printer, then refresh devices.');
 if(config.printer&&!printers.some(p=>p.name===config.printer))throw Error('Selected printer is unavailable. Check its connection and refresh devices in Station settings.');
 const job=printDocument(image,nativeImage.createFromBuffer(image).getSize(),config);
 const win=new BrowserWindow({show:false,parent:owner,width:900,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try {
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(job.html));
  await win.webContents.executeJavaScript('document.images[0].decode()');
  await new Promise((resolve,reject)=>win.webContents.print(job.options,(success,reason)=>success?resolve():reject(Error(reason||'Printing was cancelled.'))));
 }finally{win.destroy();}
}
module.exports={printDocument,printImage};
