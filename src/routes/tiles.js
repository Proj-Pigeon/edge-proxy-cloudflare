import { createTileHandlers } from '../lib/proxy.js';

// --- OSM: /tiles/osm/{z}/{x}/{y}.png -> tile.openstreetmap.org (z/x/y, z <= 19) ---

const OSM_TILE_BASE = 'https://tile.openstreetmap.org';

export function buildOsmTileUrl({ z, x, y }) {
  return `${OSM_TILE_BASE}/${z}/${x}/${y}.png`;
}

const osmHandlers = createTileHandlers({
  buildUrl: buildOsmTileUrl,
  maxLevel: 19,
  yExt: '.png',
});

// --- Esri World Imagery: /tiles/esri/{z}/{y}/{x} -> services.arcgisonline.com (z/y/x, z <= 23) ---

const ESRI_IMAGERY_BASE =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

export function buildEsriTileUrl({ z, x, y }) {
  return `${ESRI_IMAGERY_BASE}/${z}/${y}/${x}`;
}

const esriHandlers = createTileHandlers({
  buildUrl: buildEsriTileUrl,
  maxLevel: 23,
});

// --- OpenTopoMap: /tiles/opentopo/{z}/{x}/{y}.png -> {a|b|c}.tile.opentopomap.org (z <= 17) ---

const OPENTOPO_SUBDOMAINS = ['a', 'b', 'c'];

export function buildOpenTopoTileUrl({ z, x, y }) {
  const sub = OPENTOPO_SUBDOMAINS[x % 3];
  return `https://${sub}.tile.opentopomap.org/${z}/${x}/${y}.png`;
}

const openTopoHandlers = createTileHandlers({
  buildUrl: buildOpenTopoTileUrl,
  maxLevel: 17,
  yExt: '.png',
});

// --- NASA GIBS VIIRS: /tiles/viirs/{date}/{z}/{y}/{x}.jpeg (z <= 8) ---

const VIIRS_TILE_BASE =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_AtSensor_M15/default';

export function buildViirsTileUrl({ date, z, x, y }) {
  return `${VIIRS_TILE_BASE}/${date}/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`;
}

const viirsHandlers = createTileHandlers({
  buildUrl: buildViirsTileUrl,
  maxLevel: 8,
  xExt: '.jpeg',
  requireDate: true,
});


export const osm = osmHandlers;
export const esri = esriHandlers;
export const openTopo = openTopoHandlers;
export const viirs = viirsHandlers;
