// Render the actual print HTML to PDF; no printer jobs or participant records.
const {app,BrowserWindow,nativeImage}=require('electron');
const {printDocument}=require('../electron/printing.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const ts=require('typescript');
async function verifyPhotoWindow(win){
 // Execute the current renderer with real canvas/Image APIs, independently of a
 // running dev server. Corner colours expose empty bands; a square exposes stretch.
 const sources=Object.fromEntries(['layout','bubblePhysics','photo'].map(name=>[`./${name}`,ts.transpileModule(fs.readFileSync(`src/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText]));
 const result=await win.webContents.executeJavaScript(`(async()=>{
  const sources=${JSON.stringify(sources)},cache={};
  function load(name){if(!cache[name]){const exports={};cache[name]=exports;new Function('exports','require',sources[name])(exports,load);}return cache[name];}
  const {certificate}=load('./photo'),{certificateLayout}=load('./layout');
  const config={title:{en:'Cyber Thought Bubble'},acknowledgement:{en:'A safer digital world starts with you.'},certificateOrientation:'landscape'};
  async function render(source,orientation='landscape'){
   const url=await certificate(source.toDataURL('image/png'),'Print layout check','en',{...config,certificateOrientation:orientation});
   const image=new Image();image.src=url;await image.decode();const out=document.createElement('canvas');out.width=image.naturalWidth;out.height=image.naturalHeight;out.getContext('2d').drawImage(image,0,0);return out;
  }
  const {photoWidth,photoHeight}=certificateLayout(),source=document.createElement('canvas');source.width=photoWidth;source.height=photoHeight;const c=source.getContext('2d');
  const colours=['#ee2222','#22bb44','#2255ee','#eebb22'];
  colours.forEach((colour,i)=>{c.fillStyle=colour;c.fillRect(i%2*photoWidth/2,Math.floor(i/2)*photoHeight/2,photoWidth/2,photoHeight/2);});
  const filled=await render(source),ctx=filled.getContext('2d');
  const corners=[[12,12],[photoWidth-12,12],[12,photoHeight-12],[photoWidth-12,photoHeight-12]].map(([x,y])=>Array.from(ctx.getImageData(x,y,1,1).data).slice(0,3));
  const square=document.createElement('canvas');square.width=900;square.height=900;const s=square.getContext('2d');s.fillStyle='#5a28a0';s.fillRect(0,0,900,900);s.fillStyle='#00ff00';s.fillRect(350,350,200,200);
  const covered=await render(square),pixels=covered.getContext('2d').getImageData(0,0,covered.width,photoHeight).data;
  const green=(x,y)=>{const p=(y*covered.width+x)*4;return pixels[p]<30&&pixels[p+1]>220&&pixels[p+2]<30;};
  const xs=Array.from({length:covered.width},(_,x)=>x).filter(x=>green(x,Math.floor(photoHeight/2))),ys=Array.from({length:photoHeight},(_,y)=>y).filter(y=>green(covered.width/2,y));
  const portrait=await render(source,'portrait');
  return {size:[filled.width,filled.height],corners,marker:[xs.length,ys.length],portrait:[portrait.width,portrait.height]};
 })()`);
 assert.deepEqual(result.size,[1800,1200]);assert.deepEqual(result.portrait,[1200,1800]);
 const expected=[[238,34,34],[34,187,68],[34,85,238],[238,187,34]];
 result.corners.forEach((colour,i)=>colour.forEach((value,j)=>assert.ok(Math.abs(value-expected[i][j])<=8,`Photo corner ${i} must fill its frame.`)));
 assert.ok(result.marker[0]>390&&result.marker[1]>390);assert.ok(Math.abs(result.marker[0]-result.marker[1])<=2,'A square in the source photo must remain square in print.');
 console.log('PASS: real certificate canvas fills every photo corner, preserves image proportions, and retains landscape/portrait print dimensions.');
}
app.whenReady().then(async()=>{
 let win;
 try{
  const file=process.argv[2]||'build/printer-test-6x4.jpg',image=fs.readFileSync(file),size=nativeImage.createFromBuffer(image).getSize();
  const doc=printDocument(image,size,{silentPrint:false,printer:''});
  win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await win.loadURL('about:blank');await verifyPhotoWindow(win);
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(doc.html));await win.webContents.executeJavaScript('document.images[0].decode()');
  const pdf=await win.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,margins:{top:0,bottom:0,left:0,right:0}}),text=pdf.toString('latin1');
  const box=text.match(/\/MediaBox\s*\[([^\]]+)\]/)[1].trim().split(/\s+/).map(Number),pages=(text.match(/\/Type\s*\/Page\b/g)||[]).length;
  assert.deepEqual(box,size.width>size.height?[0,0,432,288]:[0,0,288,432]);assert.equal(pages,1);
  fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync(path.join('artifacts',path.basename(file)+'.pdf'),pdf);
  console.log(`PASS: ${file}: one page, ${box[2]/72} × ${box[3]/72} inches, ${size.width} × ${size.height} pixels.`);
 }catch(e){console.error(e);process.exitCode=1;}finally{win?.destroy();app.quit();}
});
