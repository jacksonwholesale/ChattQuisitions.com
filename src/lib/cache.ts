import type { AstroGlobal } from 'astro';

/** Cache a rendered page on Netlify's CDN so Airtable edits show up within `seconds`. */
export function cacheFor(Astro: AstroGlobal, seconds: number) {
  Astro.response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  Astro.response.headers.set('Netlify-CDN-Cache-Control', `public, durable, s-maxage=${seconds}, stale-while-revalidate=600`);
}
