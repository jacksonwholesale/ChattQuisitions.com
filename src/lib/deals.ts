// Airtable data layer.
// Production: reads Airtable directly with AIRTABLE_TOKEN / AIRTABLE_BASE (Netlify env vars).
// Local dev without a token: falls back to the live site's public proxy, so no secret is needed on this machine.

const PUBLIC_PROXY = 'https://chattquisitions.com/.netlify/functions/deals';
const TABLE = 'Table 1';

export type Kind = 'deal' | 'story';

export interface Property {
  id: string;            // Airtable record id
  kind: Kind;
  slug: string;
  url: string;           // /deals/<slug> or /stories/<slug>
  legacyIndex: number;   // old ?deal=N value
  address: string;
  city: string;
  state: string;
  location: string;      // "City, ST" (City may already include state/zip)
  askingPrice: string;
  askingIsNumber: boolean;
  arv: string;
  arvValue: number | null;
  repairEst: string;     // '' when N/A / TBD
  beds: number | null;
  baths: number | null;
  sqft: string;
  type: string;
  strategy: string;      // '' when None
  strategySlug: string;
  badge: string;         // label
  badgeSlug: string;
  majors: string[];
  description: string;
  photos: { url: string; thumb: string; width?: number; height?: number }[];
  hero: boolean;         // optional Airtable checkbox "Hero": use this photo on the homepage
}

type Fields = Record<string, any>;

function env(name: string): string | undefined {
  return (import.meta.env as any)[name] ?? (globalThis as any).process?.env?.[name];
}

// Airtable cells sometimes hold the literal text "None"; treat that as empty.
const clean = (v: unknown): string => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v == null ? '' : String(v).trim();
  return /^none$/i.test(s) ? '' : s;
};

const isBlankish = (v: string) => !v || /^(none|n\/a|na|tbd|-)$/i.test(v);

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function parseMoney(s: string): number | null {
  if (!/\d/.test(s)) return null;
  const m = s.replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2]?.toLowerCase() === 'k') n *= 1e3;
  if (m[2]?.toLowerCase() === 'm') n *= 1e6;
  return n;
}

export const formatMoneyShort = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`
  : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;

async function fetchRecords(): Promise<{ id: string; fields: Fields }[]> {
  const token = env('AIRTABLE_TOKEN');
  const base = env('AIRTABLE_BASE');
  if (token && base) {
    const out: { id: string; fields: Fields }[] = [];
    let offset: string | undefined;
    do {
      const u = new URL(`https://api.airtable.com/v0/${base}/${encodeURIComponent(TABLE)}`);
      u.searchParams.set('filterByFormula', '{Active}=1');
      u.searchParams.set('sort[0][field]', 'Address');
      if (offset) u.searchParams.set('offset', offset);
      const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Airtable ${res.status}`);
      const data = await res.json();
      out.push(...data.records);
      offset = data.offset;
    } while (offset);
    return out;
  }
  const res = await fetch(PUBLIC_PROXY);
  if (!res.ok) throw new Error(`Proxy ${res.status}`);
  return (await res.json()).records ?? [];
}

function mapRecord(r: { id: string; fields: Fields }): Omit<Property, 'slug' | 'url' | 'legacyIndex'> {
  const f = r.fields;
  const category = clean(f['Category']).toLowerCase();
  const kind: Kind = category.includes('option') ? 'story' : 'deal';
  const city = clean(f['City']);
  const state = clean(f['State']);
  const location = state && !new RegExp(`\\b${state}\\b`, 'i').test(city) ? `${city}${city ? ', ' : ''}${state}` : city;
  const asking = clean(f['Asking Price']);
  const arv = clean(f['ARV']);
  const repair = clean(f['Repair Est']);
  const strategy = clean(f['Strategy']);
  const badge = clean(f['Badge Label']) || clean(f['Badge']);
  const num = (v: any) => (typeof v === 'number' ? v : parseFloat(v)) || null;
  return {
    id: r.id,
    kind,
    address: clean(f['Address']),
    city,
    state,
    location,
    askingPrice: isBlankish(asking) ? 'Taking Offers' : asking,
    askingIsNumber: /\$\s*\d/.test(asking),
    arv: isBlankish(arv) ? '' : arv,
    arvValue: parseMoney(arv),
    repairEst: isBlankish(repair) ? '' : repair,
    beds: num(f['Beds']),
    baths: num(f['Baths']),
    sqft: clean(f['Sqft']),
    type: clean(f['Type']),
    strategy: isBlankish(strategy) ? '' : strategy,
    strategySlug: isBlankish(strategy) ? '' : slugify(strategy),
    badge,
    badgeSlug: slugify(clean(f['Badge']) || badge),
    majors: clean(f['Majors']).split(',').map((s) => s.trim()).filter(Boolean),
    description: typeof f['Description'] === 'string' ? f['Description'].trim() : '',
    hero: Boolean(f['Hero']),
    photos: (f['Photos'] ?? []).map((p: any) => ({
      url: p.url,
      thumb: p.thumbnails?.large?.url ?? p.url,
      width: p.width,
      height: p.height,
    })),
  };
}

export async function getProperties(): Promise<Property[]> {
  let records: { id: string; fields: Fields }[] = [];
  try {
    records = await fetchRecords();
  } catch (e) {
    console.error('Airtable fetch failed', e);
    return [];
  }
  const used = new Set<string>();
  return records
    .filter((r) => r.fields['Active'])
    // legacyIndex reproduces the old site's ?deal=N numbering (Airtable order, 1-based)
    .map((r, i) => ({ ...mapRecord(r), legacyIndex: i + 1 }))
    .filter((p) => p.address)
    .sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true }))
    .map((p) => {
      const base = slugify(p.address) || p.id.toLowerCase();
      let slug = base;
      for (let i = 2; used.has(`${p.kind}/${slug}`); i++) slug = `${base}-${i}`;
      used.add(`${p.kind}/${slug}`);
      return { ...p, slug, url: `/${p.kind === 'deal' ? 'deals' : 'stories'}/${slug}` };
    });
}

/** Look up by slug, or by Airtable record id (stable fallback links). */
export async function getProperty(kind: Kind, slugOrId: string) {
  const all = await getProperties();
  return all.find((p) => p.kind === kind && (p.slug === slugOrId || p.id === slugOrId)) ?? null;
}

export function heroStats(all: Property[]) {
  const deals = all.filter((p) => p.kind === 'deal');
  const totalArv = deals.reduce((s, d) => s + (d.arvValue ?? 0), 0);
  return { activeCount: deals.length, totalArv, storyCount: all.length - deals.length };
}
