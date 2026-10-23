import type {ThoughtBody} from './bubblePhysics';
import type {Lang,Phrase} from './types';

export type ThoughtLabel={text:string;lang:Lang;opacity:number};
type Transition={target:ThoughtLabel;from:ThoughtLabel[];started:number};
const duration=1000;
function layers(state:Transition,now:number):ThoughtLabel[]{
 const progress=Math.max(0,Math.min(1,(now-state.started)/duration)),ease=progress*progress*(3-2*progress);
 if(ease===1)return [state.target];
 return [...state.from.map(label=>({...label,opacity:label.opacity*(1-ease)})),{...state.target,opacity:ease}].filter(label=>label.opacity>0);
}

// One timeline per camera. A person's existing shell and anchor survive text changes.
export class ThoughtContent{
 private states=new Map<string,Transition>();
 update(bodies:ThoughtBody[],phrases:Phrase[],lang:Lang,now:number,reduced=false){
  const result=new Map<string,ThoughtLabel[]>(),keys=new Set(bodies.map(body=>body.key));
  for(const key of this.states.keys())if(!keys.has(key))this.states.delete(key);
  for(const body of bodies){
   if(!phrases.length)continue;
   const target={text:phrases[body.phrase%phrases.length][lang],lang,opacity:1};
   let state=this.states.get(body.key);
   if(!state||reduced){state={target,from:[],started:now-duration};}
   else if(state.target.text!==target.text||state.target.lang!==lang){state={target,from:layers(state,now),started:now};}
   this.states.set(body.key,state);result.set(body.key,layers(state,now));
  }
  return result;
 }
}
