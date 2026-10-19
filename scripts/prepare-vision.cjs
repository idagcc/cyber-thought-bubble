// Classic worker bundle: MediaPipe's WASM loader uses importScripts.
const {buildSync}=require('esbuild');
buildSync({entryPoints:['node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'],bundle:true,format:'iife',globalName:'vision',outfile:'public/vision/vision.js',minify:true});
