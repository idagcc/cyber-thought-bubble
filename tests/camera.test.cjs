const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const fs=require('node:fs');const vm=require('node:vm');
const code=ts.transpileModule(fs.readFileSync('src/cameraSession.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const sandbox={exports:{},setTimeout,clearTimeout,DOMException};vm.runInNewContext(code,sandbox);const {openCamera}=sandbox.exports;
const devices=[{kind:'videoinput',deviceId:'virtual',label:'Insta360 Virtual Camera'},{kind:'videoinput',deviceId:'builtin',label:'MacBook Pro Camera'}];
test('prefer the built-in physical camera to an idle virtual camera',async()=>{const calls=[];const stream={};const media={enumerateDevices:async()=>devices,getUserMedia:async args=>{calls.push(args);return stream;}};assert.equal(await openCamera(media,''),stream);assert.equal(calls[0].video.deviceId.exact,'builtin');assert.equal(calls[0].audio,false);assert.equal(calls[0].video.width.ideal,3840);assert.equal(calls[0].video.height.ideal,2160);assert.equal(calls[0].video.aspectRatio.ideal,16/9);});
test('retry another camera after hardware failure, but respect an explicit selection',async()=>{const calls=[];const media={enumerateDevices:async()=>devices,getUserMedia:async args=>{calls.push(args.video.deviceId.exact);if(calls.length===1)throw new DOMException('Busy','NotReadableError');return {};}};await openCamera(media,'');assert.deepEqual(calls,['builtin','virtual']);calls.length=0;await assert.rejects(openCamera(media,'virtual'),/Busy/);assert.deepEqual(calls,['virtual']);});
test('permission denial stops retries and timed-out late streams are closed',async()=>{let calls=0;const media={enumerateDevices:async()=>devices,getUserMedia:async()=>{calls++;throw new DOMException('Denied','NotAllowedError');}};await assert.rejects(openCamera(media,''),/Denied/);assert.equal(calls,1);
 let resolve,stopped=false;const delayed={enumerateDevices:async()=>[],getUserMedia:()=>new Promise(r=>resolve=r)};await assert.rejects(openCamera(delayed,'',5),/did not respond/);resolve({getTracks:()=>[{stop:()=>stopped=true}]});await new Promise(r=>setTimeout(r,5));assert.equal(stopped,true);
});

test('physical Insta360 Link 2C is preferred while its virtual camera stays last',async()=>{
 const seen=[];const cameras=[...devices,{kind:'videoinput',deviceId:'link',label:'Insta360 Link 2C'}];
 const media={enumerateDevices:async()=>cameras,getUserMedia:async constraints=>{seen.push(constraints);return {};}};
 await openCamera(media,'');assert.equal(seen[0].video.deviceId.exact,'link');assert.equal(seen[0].video.frameRate.ideal,30);assert.equal(seen[0].video.frameRate.max,30);
 await openCamera(media,'link',12000,'smooth');assert.equal(seen[1].video.width.ideal,1920);assert.equal(seen[1].video.height.ideal,1080);assert.equal(seen[1].video.frameRate.ideal,60);
});
