const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {Store,validateConfig}=require('../electron/store.cjs');
const config={phrases:[{id:'1',en:'Pause before clicking.',ar:'تمهّل قبل النقر.',category:'Links',enabled:true}],title:{en:'Cybersecurity Awareness',ar:'الأمن السيبراني'},acknowledgement:{en:'I commit to safer habits.',ar:'ألتزم بعادات أكثر أماناً.'},cameraId:'',printer:'',silentPrint:false,mirrored:true,idleSeconds:2};
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'thought-bubble-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return new Store(dir);}
test('operator setup, auth, persistence and session expiry',t=>{const store=fixture(t);assert.equal(store.hasPin(),false);assert.throws(()=>store.setup('12'));const token=store.setup('246810');assert.equal(store.hasPin(),true);assert.throws(()=>store.setup('123456'));assert.throws(()=>store.login('000000'));assert.throws(()=>store.saveConfig('wrong',config));store.saveConfig(token,config);assert.deepEqual(new Store(store.root).read('config.json'),config);store.tokens.set(token,0);assert.throws(()=>store.saveConfig(token,config));});
test('operator PIN is salted and throttled',t=>{const store=fixture(t);store.setup('246810');assert.equal(JSON.stringify(store.read('operator.json')).includes('246810'),false);for(let i=0;i<5;i++)assert.throws(()=>store.login('000000'));assert.throws(()=>store.login('246810'),/one minute/);});
test('reject empty phrase bank and missing Arabic',()=>{assert.throws(()=>validateConfig({...config,phrases:[]}));assert.throws(()=>validateConfig({...config,phrases:[{...config.phrases[0],ar:''}]}));assert.throws(()=>validateConfig({...config,idleSeconds:0}));});
test('accept legacy and landscape config; allow default printer for direct printing',()=>{assert.equal(validateConfig(config),config);assert.equal(validateConfig({...config,certificateOrientation:'landscape'}).certificateOrientation,'landscape');assert.throws(()=>validateConfig({...config,certificateOrientation:'invalid'}));assert.equal(validateConfig({...config,silentPrint:true}).printer,'');});
test('save a selected image and durable completion once, then update printing',t=>{const store=fixture(t);const image='data:image/jpeg;base64,'+Buffer.from([255,216,255,217]).toString('base64');const row=store.savePhoto({image,participant:' Test Person ',language:'en'});assert.equal(row.participant,'Test Person');assert.equal(fs.existsSync(row.photoPath),true);assert.equal(new Store(store.root).records().length,1);store.updatePrint(row.id,'submitted');assert.equal(store.records()[0].printStatus,'submitted');store.updatePrint(row.id,'failed','Driver rejected paper size');assert.equal(store.records()[0].lastPrintError,'Driver rejected paper size');store.updatePrint(row.id,'submitted');assert.equal(store.records()[0].lastPrintError,undefined);assert.equal(store.records().length,1);assert.equal(store.records()[0].printStatus,'submitted');assert.throws(()=>store.savePhoto({image:'data:text/html;base64,abc',participant:'x',language:'en'}));});

test('camera quality defaults migrate without rejecting old station settings',()=>{
 assert.equal(validateConfig(config),config);
 for(const cameraMode of ['smooth','detail'])assert.equal(validateConfig({...config,cameraMode}).cameraMode,cameraMode);
 assert.throws(()=>validateConfig({...config,cameraMode:'4k60'}),/camera quality/);
});
test('print size accepts legacy settings, persists adjustments and rejects invalid percentages',t=>{
 assert.equal(validateConfig(config),config);
 const store=fixture(t),token=store.setup('246810');
 for(const printScale of [80,90,95,100]){
  store.saveConfig(token,{...config,printScale});
  assert.equal(new Store(store.root).read('config.json').printScale,printScale);
 }
 for(const printScale of [0,79,101,NaN,Infinity,'95',null])assert.throws(()=>validateConfig({...config,printScale}),/print size/);
});
test('horizontal print calibration persists signed millimetres and rejects invalid offsets',t=>{
 const store=fixture(t),token=store.setup('246810');
 for(const printOffsetXmm of [-5,-.5,0,.5,5]){
  store.saveConfig(token,{...config,printOffsetXmm});
  assert.equal(new Store(store.root).read('config.json').printOffsetXmm,printOffsetXmm);
 }
 for(const printOffsetXmm of [-5.1,5.1,NaN,Infinity,'0.5',null])assert.throws(()=>validateConfig({...config,printOffsetXmm}),/horizontal print position/);
});
