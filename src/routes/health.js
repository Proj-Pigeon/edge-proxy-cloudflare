async function handle() {
  return new Response(
    JSON.stringify({ ok: true, service: 'edge-proxy-cloudflare' }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}

async function handleHead() {
  return new Response(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const health = {
  onRequestGet: handle,
  onRequestHead: handleHead,
};
