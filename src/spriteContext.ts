// Shared drawing operations for live GPU sprites and full-quality 2D photographs.
export type SpriteContext=Pick<CanvasRenderingContext2D,'save'|'restore'|'translate'|'rotate'|'scale'|'drawImage'|'globalAlpha'>;
