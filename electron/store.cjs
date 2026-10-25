const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function atomic(file, data) { const temp = `${file}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temp,data,{mode:0o600}); fs.renameSync(temp,file); }
function validateConfig(c) {
 if(!c || !Array.isArray(c.phrases) || c.phrases.length>500 || !c.phrases.some(p=>p.enabled)) throw Error('Enable at least one phrase.');
 for(const p of c.phrases) if(typeof p.id!=='string'||typeof p.category!=='string'||typeof p.enabled!=='boolean'||['en','ar'].some(l=>typeof p[l]!=='string'||!p[l].trim()||p[l].length>180)) throw Error('Each phrase needs English and Arabic text, up to 180 characters.');
 for(const field of ['title','acknowledgement']) for(const l of ['en','ar']) if(typeof c[field]?.[l]!=='string'||!c[field][l].trim()||c[field][l].length>(field==='title'?90:240)) throw Error('Check the photo wording.');
 if(typeof c.cameraId!=='string'||typeof c.printer!=='string'||typeof c.silentPrint!=='boolean'||typeof c.mirrored!=='boolean'||c.idleSeconds!==2) throw Error('Invalid station settings.');
 if(c.certificateOrientation!==undefined&&!['portrait','landscape'].includes(c.certificateOrientation))throw Error('Choose portrait or landscape for the photo.');
 if(c.cameraMode!==undefined&&!['smooth','detail'].includes(c.cameraMode))throw Error('Choose a supported camera quality.');
 if(c.printScale!==undefined&&(!Number.isFinite(c.printScale)||c.printScale<80||c.printScale>100))throw Error('Choose a print size between 80% and 100%.');
 if(c.printOffsetXmm!==undefined&&(!Number.isFinite(c.printOffsetXmm)||Math.abs(c.printOffsetXmm)>5))throw Error('Choose a horizontal print position between -5 and 5 mm.');
 return c;
}
class Store {
 constructor(root) {this.root=root;fs.mkdirSync(path.join(root,'photos'),{recursive:true,mode:0o700});this.tokens=new Map();this.failures=0;this.lockUntil=0;}
 read(file, fallback) {try{return JSON.parse(fs.readFileSync(path.join(this.root,file),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
 write(file,data){atomic(path.join(this.root,file),JSON.stringify(data,null,2));}
 hasPin(){return !!this.read('operator.json',null);}
 setup(pin){if(this.hasPin())throw Error('Operator PIN already exists.');if(!/^\d{6,12}$/.test(pin))throw Error('Use a PIN of 6–12 digits.');const salt=crypto.randomBytes(16).toString('hex');this.write('operator.json',{salt,hash:crypto.scryptSync(pin,salt,64).toString('hex')});return this.login(pin);}
 login(pin){if(Date.now()<this.lockUntil)throw Error('Too many attempts. Try again in one minute.');const auth=this.read('operator.json',null);if(!auth)throw Error('Set up your operator PIN first.');const hash=crypto.scryptSync(String(pin),auth.salt,64);if(!crypto.timingSafeEqual(hash,Buffer.from(auth.hash,'hex'))){this.failures++;if(this.failures>=5){this.lockUntil=Date.now()+60000;this.failures=0;}throw Error('Incorrect operator PIN.');}this.failures=0;const token=crypto.randomBytes(32).toString('hex');this.tokens.set(token,Date.now()+30*60*1000);return token;}
 authorize(token){if((this.tokens.get(token)||0)<Date.now())throw Error('Operator session expired. Please unlock again.');}
 saveConfig(token,c){this.authorize(token);this.write('config.json',validateConfig(c));}
 records(){return this.read('records.json',[]);}
 savePhoto({image,participant,language}){
 if(typeof participant!=='string'||!participant.trim()||participant.length>120||!['en','ar'].includes(language))throw Error('Enter a name or email.');
 if(typeof image!=='string'||!image.startsWith('data:image/jpeg;base64,')||image.length>24_000_000)throw Error('Invalid photo.');
 const bytes=Buffer.from(image.split(',')[1],'base64');if(bytes[0]!==255||bytes[1]!==216)throw Error('Invalid JPEG.');
 const id=crypto.randomUUID();const photoPath=path.join(this.root,'photos',`${id}.jpg`);atomic(photoPath,bytes);
 const record={id,participant:participant.trim(),language,createdAt:new Date().toISOString(),photoPath,printStatus:'saved'};
 try {this.write('records.json',[record,...this.records()]);}catch(e){fs.unlinkSync(photoPath);throw e;}return record;
 }
 updatePrint(id,status,error){const rows=this.records();const row=rows.find(r=>r.id===id);if(!row)throw Error('Photo not found.');row.printStatus=status;if(error)row.lastPrintError=String(error);else delete row.lastPrintError;row.lastPrintAt=new Date().toISOString();this.write('records.json',rows);}
}
module.exports={Store,validateConfig};
