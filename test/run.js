import assert from 'node:assert/strict';
import worker from '../src/index.js';

const MIRROR = 'https://m.test';
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  return new Response('ok-body', {
    status: 200,
    headers: { 'Content-Type': 'image/png', ETag: '"e1"' },
  });
};

const ctx = { props: {}, waitUntil: () => {} };
async function hit(path, init) {
  return worker.fetch(new Request(`${MIRROR}${path}`, init), {}, ctx);
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
}

await test('manifest / and /health', async () => {
  calls.length = 0;
  let res = await hit('/');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).service, 'edge-proxy-cloudflare');

  res = await hit('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: 'edge-proxy-cloudflare' });
  assert.equal(calls.length, 0);
});

await test('tile routes through the Worker entry', async () => {
  calls.length = 0;
  let res = await hit('/tiles/osm/5/16/11.png');
  assert.equal(res.status, 200);
  assert.equal(calls.at(-1).url, 'https://tile.openstreetmap.org/5/16/11.png');
  assert.equal(res.headers.get('Cache-Control'), 'public, s-maxage=2592000, max-age=604800');

  res = await hit('/tiles/esri/21/500/1000');
  assert.equal(
    calls.at(-1).url,
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/21/500/1000'
  );

  res = await hit('/tiles/opentopo/4/2/3.png');
  assert.equal(calls.at(-1).url, 'https://c.tile.opentopomap.org/4/2/3.png');

  res = await hit('/tiles/viirs/2026-11-15/6/20/35.jpeg');
  assert.equal(
    calls.at(-1).url,
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_AtSensor_M15/default/2026-11-15/GoogleMapsCompatible_Level8/6/20/35.jpeg'
  );

  res = await hit('/arcgis?f=json');
  assert.equal(
    calls.at(-1).url,
    'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer?f=json'
  );

  res = await hit('/arcgis/tile/5/10/15');
  assert.equal(
    calls.at(-1).url,
    'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/5/10/15'
  );

  res = await hit('/datasets/earthquakes');
  assert.equal(
    calls.at(-1).url,
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson'
  );

  res = await hit('/modelsdev');
  assert.equal(calls.at(-1).url, 'https://models.dev/api.json');
});

await test('download asset & update routes', async () => {
  calls.length = 0;
  let res = await hit('/download/win32/v0.1.17/guearth-0.1.17-x64-setup.exe');
  assert.equal(res.status, 200);
  assert.equal(
    calls.at(-1).url,
    'https://github.com/Proj-Pigeon/GuEarth/releases/download/v0.1.17/guearth-0.1.17-x64-setup.exe'
  );

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 204 });
  };
  res = await hit('/update/win32/0.1.17');
  assert.equal(res.status, 204);
  assert.equal(calls.at(-1).url, 'https://guearth-updater.isla.fan/update/win32/0.1.17');

  res = await hit('/update/win32/0.1.17/RELEASES');
  assert.equal(res.status, 204);
  assert.equal(calls.at(-1).url, 'https://guearth-updater.isla.fan/update/win32/0.1.17/RELEASES');

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
  res = await hit('/download', { headers: { 'User-Agent': 'Windows' } });
  assert.equal(res.status, 302);
  assert.equal(
    res.headers.get('Location'),
    'https://m.test/download/auto/v0.1.17/guearth-0.1.17-x64-setup.exe'
  );

  res = await hit('/download/AppImage');
  assert.equal(res.status, 302);
  assert.equal(
    res.headers.get('Location'),
    'https://m.test/download/AppImage/v0.1.17/guearth-0.1.17-x64-setup.exe'
  );
});

await test('404 for unknown route, 400 for bad tile', async () => {
  calls.length = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response('ok', { status: 200 });
  };

  let res = await hit('/no-such-route');
  assert.equal(res.status, 404);
  assert.equal(calls.length, 0);

  res = await hit('/tiles/osm/20/0/0.png');
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

console.log(`All ${passed} smoke suites passed!`);
