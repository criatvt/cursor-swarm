import { sameHost } from '../net.js';

export { Swarm } from './swarm.js';

const headers = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      if (!sameHost(request.headers.get('Origin') ?? undefined, request.headers.get('Host'))) {
        return new Response('Forbidden', { status: 403 });
      }
      return env.SWARM.getByName('swarm').fetch(request);
    }

    if (url.pathname === '/health') {
      const stats = await env.SWARM.getByName('swarm').stats();
      return new Response(JSON.stringify(stats), {
        headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    const res = await env.ASSETS.fetch(request);
    const merged = new Headers(res.headers);
    for (const [key, value] of Object.entries(headers)) merged.set(key, value);
    return new Response(res.body, { status: res.status, headers: merged });
  }
};
