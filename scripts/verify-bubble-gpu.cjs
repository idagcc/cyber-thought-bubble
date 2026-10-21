const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
async function main(){
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/qa.html?live=1&paused=1');
  const result=await page.evaluate(async()=>{
   const {GpuBubbles}=await import('/src/gpuBubbles.ts');
   const gpu=document.createElement('canvas'),reference=document.createElement('canvas');gpu.width=reference.width=320;gpu.height=reference.height=180;
   const sprite=document.createElement('canvas');sprite.width=40;sprite.height=24;const skin=sprite.getContext('2d');skin.fillStyle='#f23a78';skin.fillRect(0,0,40,12);skin.fillStyle='#29c8f4';skin.fillRect(0,12,40,12);
   const gl=gpu.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,powerPreference:'high-performance',failIfMajorPerformanceCaveat:true});if(!gl)throw Error('GPU needed for the GPU verification');
   let uploads=0;const upload=gl.texImage2D.bind(gl);gl.texImage2D=(...args)=>{uploads++;return upload(...args);};
   const renderer=GpuBubbles.create(gpu);if(!renderer)throw Error('GPU compositor did not initialize');
   const ctx=reference.getContext('2d');
   function scene(target){target.save();target.translate(100,55);target.rotate(.31);target.scale(1.4,.85);target.globalAlpha=.7;target.drawImage(sprite,-20,-12,80,48);target.restore();}
   if(!renderer.begin(320,180))throw Error('GPU begin failed');scene(renderer);if(!renderer.finish())throw Error('GPU render failed');scene(ctx);
   function composite(canvas){const out=document.createElement('canvas');out.width=320;out.height=180;const c=out.getContext('2d');c.fillStyle='#142d4b';c.fillRect(0,0,320,180);c.drawImage(canvas,0,0);return c.getImageData(0,0,320,180).data;}
   const actual=composite(gpu),expected=composite(reference);let difference=0;for(let i=0;i<actual.length;i++)difference+=Math.abs(actual[i]-expected[i]);
   const meanDifference=difference/actual.length;
   for(let frame=0;frame<120;frame++){renderer.begin(320,180);scene(renderer);renderer.finish();}
   const uploadCount=uploads;renderer.dispose();return {meanDifference,uploadCount};
  });
  assert.ok(result.meanDifference<1,`GPU changed sprite orientation, transforms or alpha: ${JSON.stringify(result)}`);assert.equal(result.uploadCount,1,'Moving sprites must reuse their texture');
  await page.goto('http://127.0.0.1:5173/qa.html');
  await page.waitForFunction(()=>document.querySelector('.camera-wrap')?.dataset.bubbleRenderer==='GPU'&&Number(document.querySelector('.camera-wrap')?.dataset.bubbleCount)>0,null,{timeout:30000});
  await page.evaluate(()=>{window.testGlLoss=document.querySelector('.bubble-gpu').getContext('webgl2').getExtension('WEBGL_lose_context');window.testGlLoss.loseContext();});
  await page.waitForFunction(()=>document.querySelector('.camera-wrap')?.dataset.bubbleRenderer==='2D');
  await page.evaluate(()=>window.testGlLoss.restoreContext());
  await page.waitForFunction(()=>document.querySelector('.camera-wrap')?.dataset.bubbleRenderer==='GPU');
  await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2'&&this.classList.contains('bubble-gpu'))return null;return get.call(this,type,...args);};});
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('.camera-wrap')?.dataset.bubbleRenderer==='2D'&&Number(document.querySelector('.camera-wrap')?.dataset.bubbleCount)>0,null,{timeout:30000});
  console.log(`PASS: GPU transforms and transparency match 2D (mean channel difference ${result.meanDifference.toFixed(3)}); 120 frames reuse one texture; live context loss falls back to 2D and restores GPU; unsupported graphics use 2D.`);
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
