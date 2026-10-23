// Shared, locally bundled artwork keeps the station and its prints consistent offline.
const assetBase = new URL('./carnival/', document.baseURI).href;
export const carnivalArtwork = {
  backdrop: new Image(),
  brand: new Image(),
  shield: new Image(),
  cloud: new Image(),
  fingerprint: new Image(),
  star: new Image(),
  tents: new Image(),
  coin: new Image(),
  'mini-star': new Image(),
  'coin-blur': new Image(),
};
export const carnivalArtworkLoaded = Promise.all(
  Object.entries(carnivalArtwork).map(async ([name, image]) => {
    image.src = `${assetBase}${name}.${name==='backdrop'?'jpg':'png'}`;
    try { await image.decode(); } catch { /* Camera access must survive a missing decorative asset. */ }
  }),
);

export function drawCarnivalBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#080b2b';
  ctx.fillRect(0, 0, width, height);
  const image = carnivalArtwork.backdrop;
  if (!image.complete || !image.naturalWidth) return;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}
