export type Lang = 'en' | 'ar';
export type Phrase = {id:string; category:string; en:string; ar:string; enabled:boolean};
export type Config = {phrases:Phrase[]; title:Record<Lang,string>; acknowledgement:Record<Lang,string>; cameraId:string; printer:string; silentPrint:boolean; mirrored:boolean; idleSeconds:number; certificateOrientation?:'portrait'|'landscape'};
export type Completion = {id:string; participant:string; language:Lang; createdAt:string; photoPath?:string; printStatus:string};
export type StationAPI = {
 config:()=>Promise<Config|null>; setupStatus:()=>Promise<boolean>; login:(pin:string)=>Promise<string>; setup:(pin:string)=>Promise<string>;
 saveConfig:(token:string, config:Config)=>Promise<void>; records:(token:string)=>Promise<Completion[]>;
 savePhoto:(payload:{image:string;participant:string;language:Lang})=>Promise<Completion>;
 print:(id:string)=>Promise<void>; printers:(token:string)=>Promise<{name:string;displayName:string}[]>;
 testPrint:(token:string,image:string)=>Promise<void>;
 cameraAccess:()=>Promise<string>; cameraSettings:()=>Promise<void>;
 openData:(token:string)=>Promise<void>; fullscreen:()=>Promise<void>; exit:(token:string)=>Promise<void>;
};
declare global {interface Window {station?:StationAPI}}
