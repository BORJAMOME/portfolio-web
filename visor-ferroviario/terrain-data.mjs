/** Local IGN Terrarium DEM sampling. Heights are decoded before interpolation. */
const TAU = Math.PI * 2;
const EARTH_CIRCUMFERENCE = 40075016.68557849;
const TILE_SIZE = 256;
const decoded = new Map();
const MAX_CACHE = 80;
export const mercatorX = longitude => (longitude + 180) / 360;
export const mercatorY = latitude => (1 - Math.asinh(Math.tan(Math.max(-85.051129, Math.min(85.051129, latitude)) * Math.PI / 180)) / Math.PI) / 2;
export const longitudeAt = x => x * 360 - 180;
export const latitudeAt = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 360 / TAU;
export const decodeTerrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;

function abort(signal) { signal?.throwIfAborted(); }

export function validateBounds(bounds) {
  return Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isFinite)
    && bounds[0] >= -180 && bounds[2] <= 180 && bounds[1] > -85 && bounds[3] < 85
    && bounds[0] < bounds[2] && bounds[1] < bounds[3];
}

function findTile(x, y, available, maxZoom) {
  for (let zoom = maxZoom; zoom >= 0; zoom--) {
    const n = 2 ** zoom;
    const tx = Math.floor(x * n), ty = Math.floor(y * n);
    const key = `${zoom}/${tx}/${ty}`;
    if (available.has(key)) return {key, zoom, tx, ty};
  }
  return null;
}

async function readTile(key, signal) {
  abort(signal);
  if (decoded.has(key)) {
    const tile = decoded.get(key);
    decoded.delete(key); decoded.set(key, tile);
    return tile;
  }
  const response = await fetch(new URL(`terrain-ign/${key}.png`, import.meta.url), {signal});
  if (!response.ok) throw new Error(`No se ha podido leer el terreno IGN (${response.status}).`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    abort(signal);
    if (bitmap.width !== TILE_SIZE || bitmap.height !== TILE_SIZE) throw new Error('La tesela de terreno tiene un tamaño inesperado.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE_SIZE;
    const context = canvas.getContext('2d', {willReadFrequently:true});
    if (!context) throw new Error('No está disponible el lector de elevaciones.');
    context.drawImage(bitmap, 0, 0);
    const rgba = context.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
    const heights = new Float32Array(TILE_SIZE * TILE_SIZE);
    for (let i = 0; i < heights.length; i++) heights[i] = decodeTerrarium(rgba[i*4], rgba[i*4+1], rgba[i*4+2]);
    decoded.set(key, heights);
    if (decoded.size > MAX_CACHE) decoded.delete(decoded.keys().next().value);
    return heights;
  } finally { bitmap.close(); }
}

/**
 * Sample a bounded geographic patch in Web Mercator, scaled to local ground
 * metres at its centre. The grid is a visualization, not a survey or rail grade.
 * Each point uses the best locally available tile, so coverage can be mixed.
 */
export async function loadTerrainGrid({bounds, segments=240, signal, onProgress, manifest=globalThis.IGN_TERRAIN_MANIFEST}={}) {
  if (!validateBounds(bounds)) throw new Error('La zona de terreno no es válida.');
  if (!manifest?.tiles?.length || manifest.encoding !== 'terrarium') throw new Error('No está disponible el catálogo local de elevaciones IGN.');
  const available = new Set(manifest.tiles);
  const maxZoom = Math.max(0, Math.min(14, manifest.maxzoom ?? 12));
  const west=mercatorX(bounds[0]), east=mercatorX(bounds[2]);
  const north=mercatorY(bounds[3]), south=mercatorY(bounds[1]);
  const localScale=EARTH_CIRCUMFERENCE*Math.cos((bounds[1]+bounds[3])/2*Math.PI/180);
  const width=(east-west)*localScale, depth=(south-north)*localScale;
  const longest=Math.max(width,depth);
  const count=Math.max(48,Math.min(320,Math.round(segments)));
  const columns=Math.max(24,Math.round(count*width/longest))+1;
  const rows=Math.max(24,Math.round(count*depth/longest))+1;
  const pointTiles=new Array(columns*rows);
  const required=new Set();
  let minZoom=maxZoom, maxUsedZoom=0;
  for(let row=0;row<rows;row++) for(let col=0;col<columns;col++) {
    const x=west+(east-west)*col/(columns-1),y=north+(south-north)*row/(rows-1);
    const tile=findTile(x,y,available,maxZoom);
    if(!tile) throw new Error('Esta zona queda fuera de la cobertura del terreno IGN.');
    pointTiles[row*columns+col]=tile;
    required.add(tile.key);
    minZoom=Math.min(minZoom,tile.zoom);maxUsedZoom=Math.max(maxUsedZoom,tile.zoom);
    // A one-pixel halo lets bilinear interpolation cross a known tile edge.
    const n=2**tile.zoom,px=x*n*TILE_SIZE-.5,py=y*n*TILE_SIZE-.5;
    for(const ix of [Math.floor(px),Math.floor(px)+1]) for(const iy of [Math.floor(py),Math.floor(py)+1]) {
      const key=`${tile.zoom}/${Math.floor(ix/TILE_SIZE)}/${Math.floor(iy/TILE_SIZE)}`;
      if(available.has(key))required.add(key);
    }
  }
  // Large arbitrary regions can span hundreds of sparse detail tiles. Bound
  // network and memory rather than quietly requesting an unbounded terrain.
  if(required.size>240)throw new Error('La zona es demasiado extensa para una escena de detalle. Elige uno de los corredores.');
  const tiles=new Map();
  const queue=[...required];
  let completed=0,next=0;
  await Promise.all(Array.from({length:Math.min(6,queue.length)},async()=>{
    while(next<queue.length){
      abort(signal);
      const key=queue[next++];
      tiles.set(key,await readTile(key,signal));
      completed++;onProgress?.(completed,queue.length);
    }
  }));
  abort(signal);

  function sampleXY(x,y,tile=findTile(x,y,available,maxZoom)){
    if(!tile||!tiles.has(tile.key))return null;
    const n=2**tile.zoom,px=x*n*TILE_SIZE-.5,py=y*n*TILE_SIZE-.5;
    const ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy;
    const original=tiles.get(tile.key);
    function pixel(gx,gy){
      const tx=Math.floor(gx/TILE_SIZE),ty=Math.floor(gy/TILE_SIZE);
      const data=tiles.get(`${tile.zoom}/${tx}/${ty}`);
      if(data)return data[((gy%TILE_SIZE+TILE_SIZE)%TILE_SIZE)*TILE_SIZE+(gx%TILE_SIZE+TILE_SIZE)%TILE_SIZE];
      // A missing neighbour is not fabricated from a lower-resolution RGB.
      // Clamp the numeric edge, preserving known heights.
      const cx=Math.max(0,Math.min(255,gx-tile.tx*TILE_SIZE));
      const cy=Math.max(0,Math.min(255,gy-tile.ty*TILE_SIZE));
      return original[cy*TILE_SIZE+cx];
    }
    return (pixel(ix,iy)*(1-fx)+pixel(ix+1,iy)*fx)*(1-fy)
      +(pixel(ix,iy+1)*(1-fx)+pixel(ix+1,iy+1)*fx)*fy;
  }
  const heights=new Float32Array(columns*rows);
  let minimum=Infinity,maximum=-Infinity;
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const index=row*columns+col;
    const value=sampleXY(west+(east-west)*col/(columns-1),north+(south-north)*row/(rows-1),pointTiles[index]);
    heights[index]=value;minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);
  }
  // Scene sampling uses the same mesh as the displayed terrain. This avoids
  // claiming extra route precision from a denser DEM than the mesh on screen.
  function sampleHeight(longitude,latitude){
    const u=(mercatorX(longitude)-west)/(east-west)*(columns-1);
    const v=(mercatorY(latitude)-north)/(south-north)*(rows-1);
    if(u<0||v<0||u>columns-1||v>rows-1)return null;
    const x0=Math.min(columns-2,Math.floor(u)),y0=Math.min(rows-2,Math.floor(v)),fx=u-x0,fy=v-y0;
    return (heights[y0*columns+x0]*(1-fx)+heights[y0*columns+x0+1]*fx)*(1-fy)
      +(heights[(y0+1)*columns+x0]*(1-fx)+heights[(y0+1)*columns+x0+1]*fx)*fy;
  }
  return {bounds:[...bounds],columns,rows,heights,width,depth,minimum,maximum,minZoom,maxZoom:maxUsedZoom,
    tileCount:tiles.size,resolutionMin:localScale/(TILE_SIZE*2**maxUsedZoom),resolutionMax:localScale/(TILE_SIZE*2**minZoom),
    gridSpacing:Math.max(width/(columns-1),depth/(rows-1)),sampleHeight,
    point(longitude,latitude,height=sampleHeight(longitude,latitude)){
      if(height===null)return null;
      return [((mercatorX(longitude)-west)/(east-west)-.5)*width/1000,(height-minimum)/1000+.25,((mercatorY(latitude)-north)/(south-north)-.5)*depth/1000];
    }};
}

export function clearTerrainCache(){decoded.clear();}
