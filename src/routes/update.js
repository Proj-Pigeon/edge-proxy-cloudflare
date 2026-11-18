import {
  DATA_USER_AGENT,
  buildBaseHeaders,
  buildCacheControl,
  buildNotModifiedResponse,
  fetchUpstreamSafe,
  jsonError,
  mapUpstreamErrorStatus,
} from '../lib/proxy.js';
import {
  HAZEL_API_TIMEOUT_MS,
  HAZEL_UPSTREAM,
  UPDATE_CACHE_SMAXAGE,
  extractRequestSearch,
  isValidPlatform,
  isValidVersion,
  rewriteUpdatePayload,
  rewriteReleasesText,
} from '../lib/hazel.js';

export function buildHazelUpdateUrl(platform, version, search = '') {
  return `${HAZEL_UPSTREAM}/update/${encodeURIComponent(platform)}/${encodeURIComponent(version)}${search}`;
}

export function buildHazelReleasesUrl(platform, version, search = '') {
  return `${HAZEL_UPSTREAM}/update/${encodeURIComponent(platform)}/${encodeURIComponent(version)}/RELEASES${search}`;
}

/**
 * GET|HEAD /update/{platform}/{version} — Hazel update check JSON.
 * Passes through upstream 204/304, rewrites payload.url GitHub asset URLs
 * to this mirror's /download/{platform}/{tag}/{file} route.
 */
async function handleUpdate(context) {
  const request = context?.request;
  const method = (request?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return jsonError(405, `Method ${method} not allowed`);
  }

  const params = context?.params || {};
  const { platform, version } = params;

  if (!isValidPlatform(platform)) {
    return jsonError(400, 'Invalid platform parameter');
  }
  if (!isValidVersion(version)) {
    return jsonError(400, 'Invalid version parameter');
  }

  const upstreamUrl = buildHazelUpdateUrl(platform, version, extractRequestSearch(request));
  const fetched = await fetchUpstreamSafe(upstreamUrl, {
    request,
    userAgent: DATA_USER_AGENT,
    timeoutMs: HAZEL_API_TIMEOUT_MS,
    accept: 'application/json, */*',
    method,
    edgeCacheTtl: UPDATE_CACHE_SMAXAGE,
  });
  if (!fetched.ok) {
    return fetched.errorResponse;
  }

  const upstreamRes = fetched.response;
  const cacheControl = buildCacheControl({
    sMaxage: UPDATE_CACHE_SMAXAGE,
    maxAge: UPDATE_CACHE_SMAXAGE,
  });

  if (upstreamRes.status === 204) {
    return new Response(null, {
      status: 204,
      headers: buildBaseHeaders(cacheControl, upstreamUrl),
    });
  }

  if (upstreamRes.status === 304) {
    return buildNotModifiedResponse(upstreamRes, cacheControl, upstreamUrl);
  }

  if (!upstreamRes.ok) {
    return mapUpstreamErrorStatus(upstreamRes, upstreamUrl);
  }

  const headers = buildBaseHeaders(cacheControl, upstreamUrl, {
    'Content-Type': 'application/json; charset=utf-8',
  });

  if (method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  let payload;
  try {
    payload = await upstreamRes.json();
  } catch {
    return jsonError(502, 'Upstream returned invalid JSON', { upstream: upstreamUrl });
  }

  const rewritten = rewriteUpdatePayload(payload, request?.url, platform);
  return new Response(JSON.stringify(rewritten), {
    status: 200,
    headers,
  });
}

/**
 * GET|HEAD /update/{platform}/{version}/RELEASES — Squirrel.Windows manifest.
 * Passes through 204/304, rewrites GitHub .nupkg URLs to this mirror.
 */
async function handleReleases(context) {
  const request = context?.request;
  const method = (request?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return jsonError(405, `Method ${method} not allowed`);
  }

  const params = context?.params || {};
  const { platform, version } = params;

  if (!isValidPlatform(platform)) {
    return jsonError(400, 'Invalid platform parameter');
  }
  if (!isValidVersion(version)) {
    return jsonError(400, 'Invalid version parameter');
  }

  const upstreamUrl = buildHazelReleasesUrl(platform, version, extractRequestSearch(request));
  const fetched = await fetchUpstreamSafe(upstreamUrl, {
    request,
    userAgent: DATA_USER_AGENT,
    timeoutMs: HAZEL_API_TIMEOUT_MS,
    accept: 'application/octet-stream, text/plain, */*',
    method,
    edgeCacheTtl: UPDATE_CACHE_SMAXAGE,
  });
  if (!fetched.ok) {
    return fetched.errorResponse;
  }

  const upstreamRes = fetched.response;
  const cacheControl = buildCacheControl({
    sMaxage: UPDATE_CACHE_SMAXAGE,
    maxAge: UPDATE_CACHE_SMAXAGE,
  });

  if (upstreamRes.status === 204) {
    return new Response(null, {
      status: 204,
      headers: buildBaseHeaders(cacheControl, upstreamUrl),
    });
  }

  if (upstreamRes.status === 304) {
    return buildNotModifiedResponse(upstreamRes, cacheControl, upstreamUrl);
  }

  if (!upstreamRes.ok) {
    return mapUpstreamErrorStatus(upstreamRes, upstreamUrl);
  }

  const headers = buildBaseHeaders(cacheControl, upstreamUrl, {
    'Content-Type': upstreamRes.headers.get('content-type') || 'application/octet-stream',
  });

  if (method === 'HEAD') {
    const contentLength = upstreamRes.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);
    return new Response(null, { status: 200, headers });
  }

  const rawText = await upstreamRes.text();
  const rewrittenText = rewriteReleasesText(rawText, request?.url, platform);
  return new Response(rewrittenText, {
    status: 200,
    headers,
  });
}

export const update = {
  onRequestGet: handleUpdate,
  onRequestHead: handleUpdate,
};

export const releases = {
  onRequestGet: handleReleases,
  onRequestHead: handleReleases,
};
