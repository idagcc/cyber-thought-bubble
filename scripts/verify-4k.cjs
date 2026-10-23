const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  fs.mkdirSync('artifacts',{recursive:true});
  for(const [name,width,height,deviceScaleFactor,fallback] of [
   ['native',3840,2160,1,false],['scaled',1920,1080,2,false],['fallback',3840,2160,1,true],
  ]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   if(fallback)await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2'&&this.classList.contains('bubble-gpu'))return null;return original.call(this,type,...args);};});
   await page.goto('http://127.0.0.1:5173/?demo=1');
   await page.waitForFunction(()=>Number(document.querySelector('.camera-wrap')?.dataset.bubbleCount)===3);
   await page.waitForTimeout(1400);
   const state=await page.evaluate(()=>{
    const camera=document.querySelector('.camera-frame'),gpu=document.querySelector('.bubble-gpu'),wrap=document.querySelector('.camera-wrap'),stage=document.querySelector('.app').getBoundingClientRect();
    return {camera:[camera.width,camera.height],gpu:[gpu.width,gpu.height],renderer:wrap.dataset.bubbleRenderer,stage:[stage.width,stage.height],fps:wrap.dataset.renderFps};
   });
   assert.deepEqual(state.camera,[3840,2160]);assert.deepEqual(state.stage,[width,height]);
   assert.equal(state.renderer,fallback?'2D':'GPU');if(!fallback)assert.deepEqual(state.gpu,[3840,2160]);
   assert.deepEqual(errors,[]);await page.screenshot({path:`artifacts/4k-${name}.png`});
   console.log(`PASS ${name}: ${JSON.stringify(state)}`);await page.close();
  }
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
