import type {SpriteContext} from './spriteContext';
import {displayRasterSize} from './layout';
type Texture={texture:WebGLTexture;used:number;bytes:number};
const vertex=`#version 300 es
in vec2 a_unit;
uniform mat3 u_transform;
uniform vec2 u_resolution;
out vec2 v_uv;
void main(){vec2 p=(u_transform*vec3(a_unit,1.)).xy;gl_Position=vec4((p/u_resolution*2.-1.)*vec2(1.,-1.),0.,1.);v_uv=a_unit;}`;
const fragment=`#version 300 es
precision mediump float;
uniform sampler2D u_image;
uniform float u_opacity;
in vec2 v_uv;
out vec4 color;
void main(){color=texture(u_image,v_uv)*u_opacity;}`;

// Artwork and letters become reusable textures; only transforms change per frame.
export class GpuBubbles implements SpriteContext{
 private gl:WebGL2RenderingContext;
 private program:WebGLProgram|undefined;
 private buffer:WebGLBuffer|undefined;
 private textures=new Map<CanvasImageSource,Texture>();
 private textureBytes=0;
 private readonly textureBudget=128*1024*1024;
 private matrix=[1,0,0,1,0,0];
 private stack:{matrix:number[];alpha:number}[]=[];
 private transform=new Float32Array(9);
 private transformLocation:WebGLUniformLocation|null=null;
 private resolutionLocation:WebGLUniformLocation|null=null;
 private opacityLocation:WebGLUniformLocation|null=null;
 private frame=0;
 private available=false;
 private lost=false;
 globalAlpha=1;
 private onLost=(event:Event)=>{event.preventDefault();this.lost=true;};
 private onRestored=()=>{this.textures.clear();this.textureBytes=0;this.lost=false;try{this.initialize();}catch{this.available=false;}};
 static create(canvas:HTMLCanvasElement){try{return new GpuBubbles(canvas);}catch{return null;}}
 private constructor(private canvas:HTMLCanvasElement){
  const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,powerPreference:'high-performance',failIfMajorPerformanceCaveat:true});
  if(!gl)throw Error('GPU composition unavailable');this.gl=gl;
  this.initialize();canvas.addEventListener('webglcontextlost',this.onLost);canvas.addEventListener('webglcontextrestored',this.onRestored);
 }
 private initialize(){
  const gl=this.gl,shaders:WebGLShader[]=[];let program:WebGLProgram|null=null;
  try{
   for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){
    const shader=gl.createShader(type);if(!shader)throw Error('GPU shader unavailable');shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('GPU shader failed');
   }
   program=gl.createProgram();if(!program)throw Error('GPU program unavailable');for(const shader of shaders)gl.attachShader(program,shader);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('GPU program failed');
   this.program=program;this.buffer=gl.createBuffer()??undefined;if(!this.buffer)throw Error('GPU buffer unavailable');
   gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);
   const location=gl.getAttribLocation(program,'a_unit');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
   this.transformLocation=gl.getUniformLocation(program,'u_transform');this.resolutionLocation=gl.getUniformLocation(program,'u_resolution');this.opacityLocation=gl.getUniformLocation(program,'u_opacity');
   gl.activeTexture(gl.TEXTURE0);gl.uniform1i(gl.getUniformLocation(program,'u_image'),0);
   gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.clearColor(0,0,0,0);this.available=true;
  }catch(error){if(program)gl.deleteProgram(program);if(this.buffer)gl.deleteBuffer(this.buffer);this.available=false;throw error;}
  finally{for(const shader of shaders)gl.deleteShader(shader);}
 }
 begin(width:number,height:number,raster?:{width:number;height:number}){
  if(!this.available||this.lost)return false;
  // Keep text sharp on 4K/Retina displays while planning in stable scene coordinates.
  const {width:bufferWidth,height:bufferHeight}=raster??displayRasterSize(this.canvas.clientWidth||width,this.canvas.clientHeight||height,window.devicePixelRatio);
  if(this.canvas.width!==bufferWidth)this.canvas.width=bufferWidth;if(this.canvas.height!==bufferHeight)this.canvas.height=bufferHeight;
  const gl=this.gl;gl.viewport(0,0,bufferWidth,bufferHeight);gl.useProgram(this.program!);gl.uniform2f(this.resolutionLocation,width,height);gl.clear(gl.COLOR_BUFFER_BIT);
  this.matrix=[1,0,0,1,0,0];this.stack=[];this.globalAlpha=1;this.frame++;return true;
 }
 finish(){if(this.gl.isContextLost())return false;/* getError synchronizes with the GPU; keep it out of the per-frame path. */if(this.frame%60===0&&this.gl.getError()!==this.gl.NO_ERROR)this.available=false;return this.available;}
 disable(){this.available=false;}
 save(){this.stack.push({matrix:[...this.matrix],alpha:this.globalAlpha});}
 restore(){const state=this.stack.pop();if(state){this.matrix=state.matrix;this.globalAlpha=state.alpha;}}
 translate(x:number,y:number){const m=this.matrix;m[4]+=m[0]*x+m[2]*y;m[5]+=m[1]*x+m[3]*y;}
 scale(x:number,y:number){const m=this.matrix;m[0]*=x;m[1]*=x;m[2]*=y;m[3]*=y;}
 rotate(angle:number){const [a,b,c,d]=this.matrix,cos=Math.cos(angle),sin=Math.sin(angle);this.matrix[0]=a*cos+c*sin;this.matrix[1]=b*cos+d*sin;this.matrix[2]=c*cos-a*sin;this.matrix[3]=d*cos-b*sin;}
 drawImage(image:CanvasImageSource,...bounds:number[]){
  const gl=this.gl,source=image as {width:number;height:number;naturalWidth?:number;naturalHeight?:number};
  if(bounds.length!==2&&bounds.length!==4)throw Error('Unsupported sprite crop');
  let entry=this.textures.get(image);
  if(!entry){
   const bytes=(source.naturalWidth||source.width)*(source.naturalHeight||source.height)*4;
   while(this.textures.size&&(this.textures.size>=96||this.textureBytes+bytes>this.textureBudget)){
    let oldest:CanvasImageSource|undefined,min=Infinity;for(const [key,value]of this.textures)if(value.used<min){oldest=key;min=value.used;}
    if(oldest){const removed=this.textures.get(oldest)!;gl.deleteTexture(removed.texture);this.textureBytes-=removed.bytes;this.textures.delete(oldest);}
   }
   const texture=gl.createTexture();if(!texture)throw Error('GPU texture unavailable');
   gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image as TexImageSource);}catch(error){gl.deleteTexture(texture);throw error;}
   entry={texture,used:this.frame,bytes};this.textures.set(image,entry);this.textureBytes+=bytes;
  }
  entry.used=this.frame;gl.bindTexture(gl.TEXTURE_2D,entry.texture);
  const [x,y,w=source.naturalWidth||source.width,h=source.naturalHeight||source.height]=bounds,[a,b,c,d,e,f]=this.matrix;
  this.transform.set([a*w,b*w,0,c*h,d*h,0,a*x+c*y+e,b*x+d*y+f,1]);gl.uniformMatrix3fv(this.transformLocation,false,this.transform);gl.uniform1f(this.opacityLocation,this.globalAlpha);gl.drawArrays(gl.TRIANGLES,0,6);
 }
 dispose(){
  this.canvas.removeEventListener('webglcontextlost',this.onLost);this.canvas.removeEventListener('webglcontextrestored',this.onRestored);
  for(const entry of this.textures.values())this.gl.deleteTexture(entry.texture);this.textures.clear();this.textureBytes=0;if(this.buffer)this.gl.deleteBuffer(this.buffer);if(this.program)this.gl.deleteProgram(this.program);this.available=false;
 }
}
