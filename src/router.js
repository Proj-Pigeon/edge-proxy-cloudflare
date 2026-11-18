import { manifest } from './routes/manifest.js';
import { health } from './routes/health.js';
import { modelsdev } from './routes/modelsdev.js';
import { osm, esri, openTopo, viirs } from './routes/tiles.js';
import { metadata as arcgisMetadata, tile as arcgisTile } from './routes/arcgis.js';
import { earthquakes } from './routes/earthquakes.js';
import { update, releases } from './routes/update.js';
import { auto as downloadAuto, latest as downloadLatest, asset as downloadAsset } from './routes/download.js';

/**
 * Route table: pattern segments match URL path segments.
 * `:name` matches one segment (decoded); `*name` matches the remaining
 * segments (decoded, joined with '/'); plain segments match literally.
 */
const ROUTES = [
  { pattern: [], handler: manifest },
  { pattern: ['health'], handler: health },
  { pattern: ['modelsdev'], handler: modelsdev },
  { pattern: ['tiles', 'osm', ':z', ':x', ':y'], handler: osm },
  { pattern: ['tiles', 'esri', ':z', ':y', ':x'], handler: esri },
  { pattern: ['tiles', 'opentopo', ':z', ':x', ':y'], handler: openTopo },
  { pattern: ['tiles', 'viirs', ':date', ':z', ':y', ':x'], handler: viirs },
  { pattern: ['arcgis'], handler: arcgisMetadata },
  { pattern: ['arcgis', '*tile'], handler: arcgisTile },
  { pattern: ['datasets', 'earthquakes'], handler: earthquakes },
  { pattern: ['update', ':platform', ':version'], handler: update },
  { pattern: ['update', ':platform', ':version', 'RELEASES'], handler: releases },
  { pattern: ['download'], handler: downloadAuto },
  { pattern: ['download', ':platform'], handler: downloadLatest },
  { pattern: ['download', '*path'], handler: downloadAsset },
];

function matchRoute(segments) {
  for (const route of ROUTES) {
    const params = matchPattern(route.pattern, segments);
    if (params) {
      return { handler: route.handler, params };
    }
  }
  return null;
}

function matchPattern(pattern, segments) {
  const params = {};
  let i = 0;
  for (; i < pattern.length; i++) {
    const seg = pattern[i];
    if (seg.startsWith('*')) {
      if (segments.length <= i) return null;
      params[seg.slice(1)] = segments.slice(i).join('/');
      return params;
    }
    if (i >= segments.length) return null;
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = segments[i];
    } else if (seg !== segments[i]) {
      return null;
    }
  }
  if (segments.length !== pattern.length) return null;
  return params;
}

/**
 * Split a URL pathname into decoded segments, ignoring a single trailing slash.
 */
export function splitPathSegments(pathname) {
  let path = pathname;
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  const raw = path.split('/').filter(Boolean);
  return raw.map((seg) => {
    try {
      return decodeURIComponent(seg);
    } catch {
      return seg;
    }
  });
}

/**
 * Resolve a Request to `{ handler, params }` using the route table.
 */
export function resolveRoute(request) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  const segments = splitPathSegments(url.pathname);
  return matchRoute(segments);
}
