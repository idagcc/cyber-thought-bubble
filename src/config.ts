import phrases from './phrases.json';
import type {Config} from './types';
export const defaultConfig:Config={phrases,title:{en:'Cybersecurity Awareness',ar:'الوعي بالأمن السيبراني'},acknowledgement:{en:'I commit to safer digital habits. Every thoughtful action helps protect our digital world.',ar:'ألتزم بممارسات رقمية أكثر أماناً. كل تصرف واعٍ يساهم في حماية عالمنا الرقمي.'},cameraId:'',cameraMode:'detail',printer:'',silentPrint:true,mirrored:true,idleSeconds:2,certificateOrientation:'landscape'};
export const loadConfig=async()=>{const stored=window.station?await window.station.config():JSON.parse(localStorage.getItem('tb-preview-config')||'null');return {...defaultConfig,...stored,silentPrint:true};};
