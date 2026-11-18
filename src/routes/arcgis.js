import { parseTileCoords, proxyResponse, jsonError, TILE_USER_AGENT, DATA_USER_AGENT } from '../lib/proxy.js';

export const ARCGIS_TERRAIN_BASE_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';

const MAX_ARCGIS_TERRAIN_LEVEL = 23;

export function buildArcgisMetadataUrl(requestUrl) {
  let format = 'json';
  if (requestUrl) {
    try {
      const url = new URL(requestUrl);
      const f = url.searchParams.get('f');
      if (f) {
        if (f !== 'json' && f !== 'pjson') {
          return null;
        }
        format = f;
      }
    } catch {
      // Fallback to default f=json
    }
  }
  return `${ARCGIS_TERRAIN_BASE_URL}?f=${encodeURIComponent(format)}`;
}

export function buildArcgisTileUrl({ z, y, x }) {
  return `${ARCGIS_TERRAIN_BASE_URL}/tile/${z}/${y}/${x}`;
}

/**
 * Extract tile path segments for /arcgis/tile/{z}/{y}/{x} from the context
 * (params.tile when provided by the router, else from the request pathname).
 */
export function extractArcgisSegments(context) {
  const rawParam = context?.params?.tile;
  if (Array.isArray(rawParam)) {
    return rawParam.filter(Boolean);
  }
  if (typeof rawParam === 'string' && rawParam.length > 0) {
    return rawParam.split('/').filter(Boolean);
  }
  if (context?.request?.url) {
    try {
      const { pathname } = new URL(context.request.url);
      const idx = pathname.indexOf('/arcgis/');
      if (idx !== -1) {
        return pathname
          .slice(idx + '/arcgis/'.length)
          .split('/')
          .filter(Boolean);
      }
    } catch {
      // Ignore invalid URL
    }
  }
  return [];
}

async function handleMetadata(context) {
  const upstreamUrl = buildArcgisMetadataUrl(context?.request?.url);
  if (!upstreamUrl) {
    return jsonError(400, 'Unsupported query format parameter (only f=json or f=pjson allowed)');
  }

  return proxyResponse(context, upstreamUrl, {
    sMaxage: 86400, // 1 day
    maxAge: 3600,   // 1 hour
    userAgent: DATA_USER_AGENT,
    accept: 'application/json, */*',
  });
}

async function handleTile(context) {
  const segments = extractArcgisSegments(context);
  if (segments.length !== 4 || segments[0] !== 'tile') {
    return jsonError(400, 'Expected path /arcgis/tile/{z}/{y}/{x}');
  }

  const parsed = parseTileCoords({
    zRaw: segments[1],
    yRaw: segments[2],
    xRaw: segments[3],
    maxLevel: MAX_ARCGIS_TERRAIN_LEVEL,
  });

  if (!parsed.ok) {
    return jsonError(400, parsed.error);
  }

  const upstreamUrl = buildArcgisTileUrl(parsed);
  return proxyResponse(context, upstreamUrl, {
    sMaxage: 86400, // 1 day
    maxAge: 86400,  // 1 day
    userAgent: TILE_USER_AGENT,
    accept: '*/*',
  });
}

export const metadata = {
  onRequestGet: handleMetadata,
  onRequestHead: handleMetadata,
};

export const tile = {
  onRequestGet: handleTile,
  onRequestHead: handleTile,
};
