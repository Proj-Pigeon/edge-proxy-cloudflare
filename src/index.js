import { jsonError } from './lib/proxy.js';
import { resolveRoute } from './router.js';

const NO_STORE_RE = /(?:^|,)\s*(?:no-store|private)\b/i;

/**
 * Whether a GET response is eligible for Cache API (caches.default) storage:
 * cacheable Cache-Control intent and no Authorization header. The routes
 * already attach Cloudflare `cf` cache directives to upstream subrequests;
 * this adds a fast local edge-cache layer in front of them.
 */
function isCacheEligible(request, response) {
  const cacheControl = response.headers.get('cache-control');
  return (
    request.method === 'GET' &&
    cacheControl !== null &&
    !NO_STORE_RE.test(cacheControl) &&
    !request.headers.has('authorization')
  );
}

async function handleFetch(request, env, ctx) {
  const resolved = resolveRoute(request);
  if (!resolved) {
    return jsonError(404, 'Route not found');
  }

  const context = {
    request,
    params: resolved.params,
    env,
    ctx,
  };

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  let cacheKey = null;
  if (cache && request.method === 'GET' && /^https?:/i.test(request.url)) {
    try {
      cacheKey = new Request(request.url, { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) {
        const hit = new Response(cached.body, cached);
        hit.headers.set('X-Edge-Cache', 'HIT');
        return hit;
      }
    } catch {
      cacheKey = null;
    }
  }

  const response = await resolved.handler.onRequestGet(context);

  if (cacheKey && response.status === 200 && isCacheEligible(request, response)) {
    try {
      const cacheable = new Response(response.clone().body, response);
      if (ctx?.waitUntil) {
        ctx.waitUntil(cache.put(cacheKey, cacheable));
      } else {
        cache.put(cacheKey, cacheable).catch(() => {});
      }
    } catch {
      // Cache write failures must never break the response.
    }
  }

  return response;
}

export default {
  fetch: (request, env, ctx) =>
    handleFetch(request, env, ctx).catch((err) =>
      jsonError(500, 'Internal proxy error', { detail: err?.message || String(err) })
    ),
};
