const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const sandbox={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/thoughtContent.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
const {ThoughtContent}=sandbox.exports,body={key:'1:0',phrase:0},phrase=text=>[{en:text,ar:'نص عربي'}];
const weights=labels=>Object.fromEntries(labels.map(label=>[label.text,label.opacity]));
test('the same person keeps their old message as the new message fades in over one second',()=>{
 const content=new ThoughtContent(),read=(text,time)=>content.update([body],phrase(text),'en',time).get(body.key);
 assert.deepEqual(weights(read('First',0)),{First:1});
 assert.deepEqual(weights(read('Second',12000)),{First:1});
 assert.deepEqual(weights(read('Second',12500)),{First:.5,Second:.5});
 assert.deepEqual(weights(read('Second',13000)),{Second:1});
 assert.deepEqual(weights(read('Second',24000)),{Second:1});
});
test('an interrupted message transition starts from exactly the currently visible mixture',()=>{
 const content=new ThoughtContent(),read=(text,time)=>content.update([body],phrase(text),'en',time).get(body.key);
 read('First',0);read('Second',1000);
 const before=weights(read('Second',1500)),after=weights(read('Third',1500));
 assert.deepEqual(after,before);
 const mid=weights(read('Third',2000));assert.deepEqual(mid,{First:.25,Second:.25,Third:.5});
 assert.deepEqual(weights(read('Third',2500)),{Third:1});
});
test('people have independent transitions and departures clear their prior messages',()=>{
 const content=new ThoughtContent(),other={key:'2:0',phrase:1},phrases=[{en:'First',ar:'الأول'},{en:'Other',ar:'الثاني'}];
 content.update([body,other],phrases,'en',0);
 const changed=content.update([body,other],[{en:'New',ar:'جديد'},phrases[1]],'en',12000);
 assert.deepEqual(weights(changed.get(other.key)),{Other:1});assert.deepEqual(weights(changed.get(body.key)),{First:1});
 content.update([],[],'en',12100);
 assert.deepEqual(weights(content.update([body],phrase('Return'),'en',12200).get(body.key)),{Return:1});
});
test('language changes crossfade; reduced motion shows the final message immediately',()=>{
 const content=new ThoughtContent();content.update([body],phrase('First'),'en',0);
 assert.deepEqual(weights(content.update([body],phrase('First'),'ar',1000).get(body.key)),{First:1});
 const mid=content.update([body],phrase('First'),'ar',1500).get(body.key);
 assert.equal(mid[0].lang,'en');assert.equal(mid[1].lang,'ar');assert.equal(mid[1].opacity,.5);
 assert.deepEqual(weights(content.update([body],phrase('New'),'en',1600,true).get(body.key)),{New:1});
});

test('adaptive third and fourth thoughts stay distinct across visitors without changing surviving messages',()=>{
 const physics={exports:{},Math,Set,Map};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/bubblePhysics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,physics);
 const {stepWorld}=physics.exports,content=new ThoughtContent(),phrases=Array.from({length:12},(_,i)=>({en:`Thought ${i}`,ar:`فكرة ${i}`}));
 const face={x:.5,y:.5,w:.12,h:.3,id:1,since:0,seen:2200,ready:true,visible:true};
 const first=stepWorld(undefined,[face],1600,900,2200,true),original=content.update(first.bodies,phrases,'en',2200);
 assert.ok(first.bodies.some(b=>b.key==='1:2')&&first.bodies.some(b=>b.key==='1:3'),'a spacious single-person scene exercises the third and fourth slots');
 assert.equal(new Set([...original.values()].map(layers=>layers[0].text)).size,first.bodies.length);
 const joined=stepWorld(first,[{...face,x:.25},{...face,id:5,x:.75}],1600,900,2300,true),active=joined.bodies.filter(b=>!b.retiring);
 const labels=content.update(joined.bodies,phrases,'en',2300);
 assert.ok(active.some(b=>b.owner===1)&&active.some(b=>b.owner===5));
 assert.equal(new Set(active.map(b=>labels.get(b.key)[0].text)).size,active.length,'IDs differing by four still get distinct phrases when the enabled pool is large enough');
 for(const b of active){
  assert.deepEqual(weights(labels.get(b.key)),{[phrases[b.phrase%phrases.length].en]:1},'count changes do not start an unintended message crossfade');
  if(original.has(b.key))assert.deepEqual(weights(labels.get(b.key)),weights(original.get(b.key)),'surviving owner/slot keys keep their assigned phrase');
 }
 const alone=stepWorld(joined,[face],1600,900,2400,true),returned=content.update(alone.bodies,phrases,'en',2400),live=alone.bodies.filter(b=>!b.retiring);
 assert.ok(live.some(b=>b.key==='1:3'),'the fourth slot becomes available again after the crowd leaves');
 assert.equal(new Set(live.map(b=>returned.get(b.key)[0].text)).size,live.length);
 for(const b of live)if(active.some(a=>a.key===b.key))assert.deepEqual(weights(returned.get(b.key)),weights(labels.get(b.key)));
});
