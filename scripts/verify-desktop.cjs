const {_electron}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'thought-bubble-desktop-'));
 const app=await _electron.launch({executablePath:require('electron'),args:['.','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'],env:{...process.env,THOUGHT_BUBBLE_TEST_DATA:data}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForLoadState('domcontentloaded');const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>!!window.station);
  assert.equal(await page.getByRole('button',{name:'Create my certificate',exact:true}).count(),1);assert.equal(await page.evaluate(()=>window.station.setupStatus()),false);
  const token=await page.evaluate(()=>window.station.setup('975310'));
  // Intercept every print submission: this script never sends paper jobs.
  await app.evaluate(({app,BrowserWindow})=>{
   global.qaPrinters=[{name:'QA_Photo_Printer',displayName:'QA Photo Printer'}];global.qaJobs=[];global.qaPrintFailure='';
   BrowserWindow.getAllWindows()[0].webContents.getPrintersAsync=async()=>global.qaPrinters;
   app.on('web-contents-created',(_event,contents)=>{
    contents.print=(options,callback)=>{
     if(global.qaPrintFailure){callback(false,global.qaPrintFailure);return;}
     Promise.all([
      contents.executeJavaScript('({width:document.body.getBoundingClientRect().width,height:document.body.getBoundingClientRect().height,imageWidth:document.images[0].naturalWidth,imageHeight:document.images[0].naturalHeight})'),
      contents.printToPDF({printBackground:true,preferCSSPageSize:true,margins:{top:0,bottom:0,left:0,right:0}})
     ]).then(([layout,pdf])=>{global.qaJobs.push({options,layout,mediaBox:pdf.toString('latin1').match(/\/MediaBox\s*\[([^\]]+)\]/)?.[1],pages:(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length});callback(true);}).catch(e=>callback(false,e.message));
    };
   });
  });
  const config={phrases:JSON.parse(fs.readFileSync('src/phrases.json','utf8')),title:{en:'Cybersecurity Awareness',ar:'الوعي بالأمن السيبراني'},acknowledgement:{en:'I commit to safer digital habits.',ar:'ألتزم بممارسات رقمية أكثر أماناً.'},cameraId:'',printer:'QA_Photo_Printer',silentPrint:false,mirrored:true,idleSeconds:2,certificateOrientation:'landscape'};
  await page.evaluate(({token,config})=>window.station.saveConfig(token,config),{token,config});
  const image='data:image/jpeg;base64,'+fs.readFileSync('artifacts/certificate-en-landscape.jpg').toString('base64');
  const denied=await page.evaluate(async image=>{try{await window.station.testPrint('wrong',image);return false;}catch{return true;}},image);assert.equal(denied,true);
  await page.evaluate(({token,image})=>window.station.testPrint(token,image),{token,image});assert.equal((await page.evaluate(token=>window.station.records(token),token)).length,0);
  const testJob=await app.evaluate(()=>global.qaJobs.at(-1));assert.equal(testJob.options.landscape,true);assert.deepEqual(testJob.layout,{width:576,height:384,imageWidth:1800,imageHeight:1200});assert.equal(testJob.pages,1);assert.deepEqual(testJob.mediaBox.trim().split(/\s+/).map(Number),[0,0,432,288]);
  const record=await page.evaluate(image=>window.station.savePhoto({image,participant:'Desktop QA',language:'en'}),image);assert.equal(fs.existsSync(record.photoPath),true);
  await page.evaluate(id=>window.station.print(id),record.id);assert.equal((await page.evaluate(token=>window.station.records(token),token))[0].printStatus,'submitted');
  // Changing the current format cannot rotate a previously saved record.
  await page.evaluate(({token,config})=>window.station.saveConfig(token,{...config,certificateOrientation:'portrait'}),{token,config});await page.evaluate(id=>window.station.print(id),record.id);assert.equal((await app.evaluate(()=>global.qaJobs.at(-1))).options.landscape,true);
  const legacyImage='data:image/jpeg;base64,'+fs.readFileSync('artifacts/certificate-en-portrait.jpg').toString('base64');const legacy=await page.evaluate(image=>window.station.savePhoto({image,participant:'Legacy portrait QA',language:'en'}),legacyImage);await page.evaluate(id=>window.station.print(id),legacy.id);const portraitJob=await app.evaluate(()=>global.qaJobs.at(-1));assert.equal(portraitJob.options.landscape,false);assert.equal(portraitJob.pages,1);assert.deepEqual(portraitJob.mediaBox.trim().split(/\s+/).map(Number),[0,0,288,432]);
  await app.evaluate(()=>global.qaPrinters=[]);assert.match(await page.evaluate(async id=>{try{await window.station.print(id);return '';}catch(e){return e.message;}},record.id),/No printer found/);
  await app.evaluate(()=>{global.qaPrinters=[{name:'QA_Photo_Printer'}];global.qaPrintFailure='Print job canceled';});assert.match(await page.evaluate(async id=>{try{await window.station.print(id);return '';}catch(e){return e.message;}},record.id),/canceled/);assert.equal((await page.evaluate(token=>window.station.records(token),token)).find(r=>r.id===record.id).printStatus,'failed');
  await app.evaluate(()=>global.qaPrintFailure='');await page.evaluate(id=>window.station.print(id),record.id);
  assert.equal((await page.evaluate(token=>window.station.records(token),token)).length,2);
  const concurrent=await page.evaluate(async id=>Promise.allSettled([window.station.print(id),window.station.print(id)]).then(rows=>rows.map(r=>r.status)),record.id);assert.deepEqual(concurrent.sort(),['fulfilled','rejected']);
  await page.keyboard.press('Control+Shift+A');await page.getByLabel('Operator PIN',{exact:true}).fill('975310');await page.getByRole('button',{name:'Unlock settings'}).click();await page.getByRole('button',{name:'station',exact:true}).click();await page.getByRole('button',{name:'Save & print test page'}).click();await page.getByText(/Test job submitted/).waitFor();assert.equal((await page.evaluate(token=>window.station.records(token),token)).length,2);
  await page.screenshot({path:'artifacts/landscape-desktop-printer-test.png'});assert.deepEqual(errors,[]);
  console.log('PASS: native desktop, secure test-print bridge, no test records, real one-page 6 × 4 and legacy 4 × 6 PDF rendering, selected printer, save/reprint, printer loss, cancellation and concurrent print rejection. Print submissions intercepted; no physical output.');
 }finally{await app.close();fs.rmSync(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
