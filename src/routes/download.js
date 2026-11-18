import { buildCacheControl, jsonError, proxyResponse } from '../lib/proxy.js';
import {
  ASSET_CACHE_SMAXAGE,
  GITHUB_RELEASE_BASE,
  HAZEL_UPSTREAM,
  UPDATE_CACHE_SMAXAGE,
  extractRequestSearch,
  isValidAssetFile,
  isValidPlatform,
  isValidTag,
  proxyHazelDownloadRedirect,
} from '../lib/hazel.js';

export function buildHazelDownloadAutoUrl(search = '') {
  return `${HAZEL_UPSTREAM}/download${search}`;
}

export function buildHazelDownloadLatestUrl(platform, search = '') {
  return `${HAZEL_UPSTREAM}/download/${encodeURIComponent(platform)}${search}`;
}

export function buildGitHubAssetUrl(tag, file) {
  return `${GITHUB_RELEASE_BASE}/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`;
}

/**
 * Extract the segments after /download/ from the context
 * (params.path when provided by the router, else from the request pathname).
 */
export function extractDownloadSegments(context) {
  const rawParam = context?.params?.path;
  if (Array.isArray(rawParam)) {
    return rawParam.filter(Boolean);
  }
  if (typeof rawParam === 'string' && rawParam.length > 0) {
    return rawParam.split('/').filter(Boolean);
  }
  if (context?.request?.url) {
    try {
      const { pathname } = new URL(context.request.url);
      const prefix = '/download/';
      const idx = pathname.indexOf(prefix);
      if (idx !== -1) {
        return pathname
          .slice(idx + prefix.length)
          .split('/')
          .filter(Boolean);
      }
    } catch {
      // Ignore invalid URL
    }
  }
  return [];
}

/**
 * GET|HEAD /download — UA-based platform detection redirect.
 */
async function handleAuto(context) {
  const upstreamUrl = buildHazelDownloadAutoUrl(extractRequestSearch(context?.request));

  return proxyHazelDownloadRedirect(context, upstreamUrl, {
    platform: 'auto',
    cacheControl: 'no-store',
    forwardUserAgent: true,
    extraHeaders: { Vary: 'User-Agent' },
  });
}

/**
 * GET|HEAD /download/{platform} — latest installer entry redirect.
 */
async function handleLatest(context) {
  const platform = context?.params?.platform ?? extractDownloadSegments(context)[0];
  if (!isValidPlatform(platform)) {
    return jsonError(400, 'Invalid platform parameter');
  }

  const upstreamUrl = buildHazelDownloadLatestUrl(platform, extractRequestSearch(context?.request));
  const cacheControl = buildCacheControl({
    sMaxage: UPDATE_CACHE_SMAXAGE,
    maxAge: UPDATE_CACHE_SMAXAGE,
  });

  return proxyHazelDownloadRedirect(context, upstreamUrl, {
    platform,
    cacheControl,
    edgeCacheTtl: UPDATE_CACHE_SMAXAGE,
  });
}

/**
 * GET|HEAD /download/{platform}/{tag}/{file} — stream GitHub Releases asset.
 */
async function handleAsset(context) {
  const segments = extractDownloadSegments(context);

  if (segments.length === 1) {
    return handleLatest(context);
  }

  if (segments.length !== 3) {
    return jsonError(400, 'Expected path /download/{platform}/{tag}/{file}');
  }

  const [platform, tag, file] = segments;
  if (!isValidPlatform(platform)) {
    return jsonError(400, 'Invalid platform parameter');
  }
  if (!isValidTag(tag)) {
    return jsonError(400, 'Invalid release tag parameter');
  }
  if (!isValidAssetFile(file)) {
    return jsonError(400, 'Invalid asset filename parameter');
  }

  const upstreamUrl = buildGitHubAssetUrl(tag, file);
  return proxyResponse(context, upstreamUrl, {
    sMaxage: ASSET_CACHE_SMAXAGE,
    maxAge: ASSET_CACHE_SMAXAGE,
    userAgent: 'GuEarth-Edge-Proxy/1.0',
    timeoutMs: 120000,
    accept: '*/*',
  });
}

export const auto = {
  onRequestGet: handleAuto,
  onRequestHead: handleAuto,
};

export const latest = {
  onRequestGet: handleLatest,
  onRequestHead: handleLatest,
};

export const asset = {
  onRequestGet: handleAsset,
  onRequestHead: handleAsset,
};
