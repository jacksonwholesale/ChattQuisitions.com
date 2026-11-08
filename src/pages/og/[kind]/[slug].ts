import type { APIRoute } from 'astro';
import { getProperty } from '../../../lib/deals';

// Link-preview image for a deal or story. Airtable photo URLs expire after a few hours,
// so previews point here and this route fetches a fresh copy of the first photo.
export const GET: APIRoute = async ({ params }) => {
  const kind = params.kind === 'story' ? 'story' : params.kind === 'deal' ? 'deal' : null;
  const slug = params.slug?.replace(/\.jpg$/, '');
  if (!kind || !slug) return new Response('Not found', { status: 404 });
  const p = await getProperty(kind, slug);
  const photo = p?.photos[0];
  if (!photo) return Response.redirect('https://chattquisitions.com/og-image.png', 302);
  const img = await fetch(photo.url);
  if (!img.ok) return new Response('Image unavailable', { status: 502 });
  return new Response(img.body, {
    headers: {
      'Content-Type': img.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
};
