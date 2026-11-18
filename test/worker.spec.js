import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { resolveRoute, splitPathSegments } from '../src/router.js';

const MIRROR = 'https://mirror.example.com';

function makeCtx({ waitUntil = () => {} } = {}) {
  return { props: {}, waitUntil };
}

async function fetchRoute(path, init) {
  return worker.fetch(new Request(`${MIRROR}${path}`, init), {}, makeCtx());
}

describe('router path segmentation', () => {
  it('splits and decodes path segments, ignoring a trailing slash', () => {
    assert.deepEqual(splitPathSegments('/'), []);
    assert.deepEqual(splitPathSegments('/health'), ['health']);
    assert.deepEqual(splitPathSegments('/health/'), ['health']);
    assert.deepEqual(
      splitPathSegments('/tiles/osm/5/16/11.png'),
      ['tiles', 'osm', '5', '16', '11.png']
    );
    assert.deepEqual(
      splitPathSegments('/download/win32/v0.1.17/GuEarth%200.1.17.exe'),
      ['download', 'win32', 'v0.1.17', 'GuEarth 0.1.17.exe']
    );
  });
});

describe('worker fetch routing (integration)', () => {
  const originalFetch = globalThis.fetch;
  let calls = [];

  beforeEach(() => {
    calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response('mock-body', {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': '9',
          ETag: '"abc123"',
        },
      });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('serves / manifest and /health without upstream calls', async () => {
    const res = await fetchRoute('/');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.service, 'edge-proxy-cloudflare');
    assert.equal(res.headers.get('Cache-Control'), 'no-store');

    const healthRes = await fetchRoute('/health');
    assert.equal(healthRes.status, 200);
    assert.deepEqual(await healthRes.json(), { ok: true, service: 'edge-proxy-cloudflare' });
    assert.equal(calls.length, 0);
  });

  it('routes tile paths to upstream tile servers', async () => {
    let res = await fetchRoute('/tiles/osm/5/16/11.png');
    assert.equal(res.status, 200);
    assert.equal(calls.at(-1).url, 'https://tile.openstreetmap.org/5/16/11.png');

    res = await fetchRoute('/tiles/esri/21/500/1000');
    assert.equal(res.status, 200);
    assert.equal(
      calls.at(-1).url,
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/21/500/1000'
    );

    res = await fetchRoute('/tiles/opentopo/4/2/3.png');
    assert.equal(res.status, 200);
    assert.equal(calls.at(-1).url, 'https://c.tile.opentopomap.org/4/2/3.png');

    res = await fetchRoute('/tiles/viirs/2026-11-15/6/20/35.jpeg');
    assert.equal(res.status, 200);
    assert.equal(
      calls.at(-1).url,
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_AtSensor_M15/default/2026-11-15/GoogleMapsCompatible_Level8/6/20/35.jpeg'
    );
  });

  it('rejects invalid tile coordinates through the worker entry', async () => {
    const res = await fetchRoute('/tiles/osm/20/0/0.png');
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });

  it('routes /arcgis metadata and terrain tiles', async () => {
    let res = await fetchRoute('/arcgis?f=pjson');
    assert.equal(res.status, 200);
    assert.equal(
      calls.at(-1).url,
      'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer?f=pjson'
    );

    res = await fetchRoute('/arcgis/tile/5/10/15');
    assert.equal(res.status, 200);
    assert.equal(
      calls.at(-1).url,
      'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/5/10/15'
    );
  });

  it('routes /datasets/earthquakes and /modelsdev', async () => {
    let res = await fetchRoute('/datasets/earthquakes');
    assert.equal(res.status, 200);
    assert.equal(
      calls.at(-1).url,
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson'
    );

    res = await fetchRoute('/modelsdev');
    assert.equal(res.status, 200);
    assert.equal(calls.at(-1).url, 'https://models.dev/api.json');
  });

  it('routes /update/{platform}/{version} with query passthrough and HEAD', async () => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ name: 'v0.1.17', url: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    };

    let res = await fetchRoute('/update/win32/0.1.17?restarted=true');
    assert.equal(res.status, 200);
    assert.equal(
      calls.at(-1).url,
      'https://guearth-updater.isla.fan/update/win32/0.1.17?restarted=true'
    );
    const body = await res.json();
    assert.equal(body.name, 'v0.1.17');

    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response('DEADBE https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.17/app.nupkg 1', {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    };
    res = await fetchRoute('/update/win32/0.1.17/RELEASES', { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(
      calls.at(-1).url,
      'https://guearth-updater.isla.fan/update/win32/0.1.17/RELEASES'
    );
  });

  it('routes /download 302 redirect endpoints', async () => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(null, {
        status: 302,
        headers: {
          Location:
            'https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.17/guearth-0.1.17-x64-setup.exe',
        },
      });
    };

    let res = await fetchRoute('/download/AppImage');
    assert.equal(res.status, 302);
    assert.equal(
      res.headers.get('Location'),
      `${MIRROR}/download/AppImage/v0.1.17/guearth-0.1.17-x64-setup.exe`
    );

    res = await fetchRoute('/download');
    assert.equal(res.status, 302);
    assert.equal(
      res.headers.get('Location'),
      `${MIRROR}/download/auto/v0.1.17/guearth-0.1.17-x64-setup.exe`
    );
  });

  it('routes /download/{platform}/{tag}/{file} to GitHub Releases', async () => {
    const res = await fetchRoute('/download/win32/v0.1.17/guearth-0.1.17-x64-setup.exe');
    assert.equal(res.status, 200);
    assert.equal(
      calls.at(-1).url,
      'https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.17/guearth-0.1.17-x64-setup.exe'
    );
    assert.equal(res.headers.get('Cache-Control'), 'public, s-maxage=2592000, max-age=2592000');
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await fetchRoute('/unknown/path');
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'Route not found');
    assert.equal(calls.length, 0);
  });

  it('uses Cache API (caches.default) when available', async () => {
    const stored = new Map();
    const fakeCache = {
      async match(req) {
        return stored.get(req.url) ?? null;
      },
      async put(req, res) {
        stored.set(req.url, res.clone());
      },
    };
    globalThis.caches = { default: fakeCache };

    try {
      // Miss -> handler runs -> cached
      let res = await worker.fetch(
        new Request(`${MIRROR}/tiles/osm/3/4/5.png`),
        {},
        makeCtx()
      );
      assert.equal(res.status, 200);
      assert.equal(stored.size, 1);

      // Hit -> served from cache, no upstream call
      calls.length = 0;
      res = await worker.fetch(new Request(`${MIRROR}/tiles/osm/3/4/5.png`), {}, makeCtx());
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('X-Edge-Cache'), 'HIT');
      assert.equal(calls.length, 0);

      // /health is no-store: never cached even after being served
      res = await worker.fetch(new Request(`${MIRROR}/health`), {}, makeCtx());
      assert.equal(res.status, 200);
      assert.ok(!stored.has(`${MIRROR}/health`));
    } finally {
      delete globalThis.caches;
    }
  });
});

describe('resolveRoute pattern coverage', () => {
  it('matches every documented route', () => {
    const cases = [
      ['/', 'manifest'],
      ['/health', 'health'],
      ['/modelsdev', 'modelsdev'],
      ['/tiles/osm/5/16/11.png', 'osm'],
      ['/tiles/esri/5/10/15', 'esri'],
      ['/tiles/opentopo/5/10/15.png', 'opentopo'],
      ['/tiles/viirs/2026-01-01/5/10/15.jpeg', 'viirs'],
      ['/arcgis', 'arcgisMetadata'],
      ['/arcgis/tile/5/10/15', 'arcgisTile'],
      ['/datasets/earthquakes', 'earthquakes'],
      ['/update/win32/0.1.17', 'update'],
      ['/update/win32/0.1.17/RELEASES', 'releases'],
      ['/download', 'downloadAuto'],
      ['/download/win32', 'downloadLatest'],
      ['/download/win32/v0.1.17/app.exe', 'downloadAsset'],
    ];
    for (const [path] of cases) {
      const resolved = resolveRoute(new Request(`${MIRROR}${path}`));
      assert.ok(resolved, `route not matched: ${path}`);
      assert.ok(resolved.handler.onRequestGet, `handler missing for ${path}`);
    }
  });

  it('extracts params from dynamic segments', () => {
    const resolved = resolveRoute(new Request(`${MIRROR}/tiles/osm/5/16/11.png`));
    assert.deepEqual(resolved.params, { z: '5', x: '16', y: '11.png' });

    const viirsResolved = resolveRoute(
      new Request(`${MIRROR}/tiles/viirs/2026-01-01/6/20/35.jpeg`)
    );
    assert.deepEqual(viirsResolved.params, {
      date: '2026-01-01',
      z: '6',
      y: '20',
      x: '35.jpeg',
    });

    const assetResolved = resolveRoute(
      new Request(`${MIRROR}/download/win32/v0.1.17/app.exe`)
    );
    assert.deepEqual(assetResolved.params, { path: 'win32/v0.1.17/app.exe' });

    const tileResolved = resolveRoute(new Request(`${MIRROR}/arcgis/tile/5/10/15`));
    assert.deepEqual(tileResolved.params, { tile: 'tile/5/10/15' });
  });
});
