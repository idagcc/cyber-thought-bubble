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
