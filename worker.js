// NEXOBRA — Worker principal del sitio.
//
// El sitio se despliega como Cloudflare Worker "con static assets" (comando
// de build: npx wrangler deploy), NO como Cloudflare Pages clásico.
//
// Qué pasa por acá (ver wrangler.jsonc → "run_worker_first"): todas las
// páginas del sitio (las URLs sin extensión: /, /catalogo, /proveedor/...,
// /material/..., etc.) y /robots.txt y /sitemap.xml. Los archivos estáticos
// (js/, assets/, style.css, data.js, sw.js...) los sigue sirviendo Cloudflare
// directo, sin pasar por el Worker.
//
// Qué hace (SEO, auditoría del 12/11 -- ronda del 16/11):
//  - Cada página le llega al buscador con su propio <title>, descripción,
//    URL canónica y vista previa (og:) -- antes todas eran "NEXOBRA |
//    Planificador de obra..." porque el sitio es una sola página (SPA).
//  - /proveedor/<slug>: título, descripción y logo del proveedor (lo de
//    siempre, desde el 17/09).
//  - /material/<ID>-<nombre>: (nuevo) una URL por material, con su nombre en
//    el título. La app la abre como el catálogo filtrado a ese material.
//  - /sitemap.xml: (nuevo) se arma solo con las páginas públicas, todos los
//    proveedores activos y todos los materiales activos.
//  - /robots.txt: (nuevo) deja indexar todo menos las páginas privadas.
//  - Una URL que no existe devuelve la app con status 404 y "noindex" (antes
//    devolvía 200 y Google la podía indexar como copia del inicio).
//  - Si algo falla (Supabase caído, etc.) se sirve la app tal cual, sin
//    romper nada.

const SUPABASE_URL = 'https://ibwqkfdfyfdmteheacjz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3-UVWAW7oH2NVTd-I5A-aw_Q-BQi67_';

const DEFAULT_TITLE = 'NEXOBRA | Planificador de obra: precios, cálculo y proveedores de tu zona';
const DEFAULT_DESCRIPTION = 'Planificá tu obra con precios reales de materiales, cálculo por tarea y costo por m². NEXOBRA es el nexo entre tu obra y los proveedores de tu zona.';
const OG_IMAGE_PATH = '/assets/og-nexobra.png';

// Páginas fijas del sitio -- mismas rutas que VIEW_ROUTES en js/main.js.
// "index: false" = página personal (requiere sesión): no se indexa ni va al
// sitemap.
const ROUTES = {
  '/': { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, index: true, priority: '1.0' },
  '/catalogo': {
    title: 'Catálogo de materiales de construcción con precios de referencia | NEXOBRA',
    description: 'Buscá entre cientos de materiales de construcción con precio de referencia actualizado mes a mes, trazable, y compará con ofertas de proveedores de tu zona.',
    index: true, priority: '0.9'
  },
  '/calculadora-de-obra': {
    title: 'Calculadora de Obra: presupuesto por tareas con análisis de precios | NEXOBRA',
    description: 'Armá el presupuesto de tu obra por tareas (mampostería, revoques, contrapisos...) con materiales, mano de obra UOCRA y equipos calculados por unidad.',
    index: true, priority: '0.9'
  },
  '/mano-de-obra': {
    title: 'Mano de obra UOCRA: valor de la hora por categoría | NEXOBRA',
    description: 'Valor de la hora de la mano de obra de la construcción por categoría (UOCRA), actualizado mes a mes, sin cargas sociales.',
    index: true, priority: '0.8'
  },
  '/proveedores': {
    title: 'Proveedores de materiales de construcción | NEXOBRA',
    description: 'Corralones, ferreterías y proveedores de materiales de construcción: listas de precios, ubicación y contacto.',
    index: true, priority: '0.8'
  },
  '/guia-de-uso': {
    title: 'Guía de uso | NEXOBRA',
    description: 'Cómo usar NEXOBRA: buscar materiales, armar cómputos y presupuestos de obra, comparar proveedores y entender los precios de referencia.',
    index: true, priority: '0.5'
  },
  '/quienes-somos': {
    title: 'Quiénes somos | NEXOBRA',
    description: 'NEXOBRA es un planificador de obra: el nexo entre tu obra y los proveedores de tu zona, con precios de referencia trazables y cálculo por tarea.',
    index: true, priority: '0.4'
  },
  '/contacto': {
    title: 'Contacto | NEXOBRA',
    description: 'Escribinos: consultas, sugerencias o sumá tu negocio como proveedor en NEXOBRA.',
    index: true, priority: '0.4'
  },
  // (17/11) En el menú pero todavía "próximamente": no se indexa hasta que
  // tenga el cálculo real (pasar a index: true y sumarle priority entonces).
  '/costo-m2': {
    title: 'Costo por m² de construcción (próximamente) | NEXOBRA',
    description: 'Cuánto cuesta construir una vivienda tipo en Misiones, actualizado todos los meses con precios de referencia NEXOBRA y mano de obra UOCRA. Próximamente.',
    index: false, soon: true
  },
  // (24/11) Prueba cerrada: no se indexa.
  '/pedi-presupuesto': { title: 'Pedí presupuesto (prueba cerrada) | NEXOBRA', index: false },
  '/mi-cuenta': { title: 'Mi cuenta y avisos | NEXOBRA', index: false },
  '/mis-presupuestos': { title: 'Listas anteriores (Mi Cómputo) | NEXOBRA', index: false },
  '/mis-presupuestos-de-obra': { title: 'Mis presupuestos | NEXOBRA', index: false },
  '/mi-proveedor': { title: 'Panel de proveedor | NEXOBRA', index: false },
  '/favoritos': { title: 'Favoritos | NEXOBRA', index: false },
  '/alertas': { title: 'Alertas | NEXOBRA', index: false },
  '/admin': { title: 'Administración | NEXOBRA', index: false },
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Igual que slugify() de js/state.js: "Cemento Portland 50 kg" → "cemento-portland-50-kg".
export function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export function materialPath(id, denomination) {
  const slug = slugify(denomination);
  return `/material/${id}${slug ? '-' + slug : ''}`;
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    // Cloudflare guarda la respuesta 10 minutos: un material o un proveedor
    // no cambian tan seguido, y así no se le pega a Supabase en cada visita.
    cf: { cacheTtl: 600, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

/** La app (index.html) con los meta tags de esta página. status 404 para las que no existen. */
async function servePage(request, env, meta, status = 200) {
  const original = await env.ASSETS.fetch(new Request(new URL('/', request.url), request));
  if (!original.ok) return original;
  const origin = new URL(request.url).origin;
  const title = meta.title || DEFAULT_TITLE;
  const description = (meta.description || DEFAULT_DESCRIPTION).slice(0, 300);
  const image = meta.image || `${origin}${OG_IMAGE_PATH}`;
  const canonical = meta.canonical ? `${origin}${meta.canonical}` : null;
  const tags = `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    ${meta.index === false ? '<meta name="robots" content="noindex">' : ''}
    ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="NEXOBRA">
    <meta property="og:locale" content="es_AR">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${escapeHtml(image)}">
    ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : ''}
    <meta name="twitter:card" content="summary_large_image">
  `;
  const transformed = new HTMLRewriter()
    .on('title', { element(el) { el.remove(); } })
    .on('meta[name="description"]', { element(el) { el.remove(); } })
    .on('meta[name="robots"]', { element(el) { el.remove(); } })
    .on('meta[property^="og:"]', { element(el) { el.remove(); } })
    .on('meta[name^="twitter:"]', { element(el) { el.remove(); } })
    .on('link[rel="canonical"]', { element(el) { el.remove(); } })
    .on('head', { element(el) { el.append(tags, { html: true }); } })
    .transform(original);
  const headers = new Headers(transformed.headers);
  if (meta.index === false) headers.set('X-Robots-Tag', 'noindex');
  return new Response(transformed.body, { status, headers });
}

const NOT_FOUND_META = {
  title: 'Página no encontrada | NEXOBRA',
  description: 'Esta página no existe o se movió. Buscá materiales, proveedores y precios de referencia en NEXOBRA.',
  index: false,
};

async function serveProvider(request, env, slug) {
  try {
    const rows = await supabaseGet(`provider_branches?slug=eq.${encodeURIComponent(slug)}&active=eq.true`
      + `&select=name,locality,providers(business_name,description,logo_url)`);
    const branch = Array.isArray(rows) ? rows[0] : null;
    if (!branch || !branch.providers) return servePage(request, env, NOT_FOUND_META, 404);
    const provider = branch.providers;
    return servePage(request, env, {
      title: `${provider.business_name}${branch.locality ? ' en ' + branch.locality : ''} | NEXOBRA`,
      description: (provider.description ? provider.description.slice(0, 160) : '')
        || `Lista de precios y contacto de ${provider.business_name} en ${branch.locality || 'tu zona'}, en NEXOBRA, el nexo entre tu obra y los proveedores de tu zona.`,
      image: provider.logo_url || null,
      canonical: `/proveedor/${slug}`,
    });
  } catch (err) {
    return servePage(request, env, { canonical: `/proveedor/${slug}` });
  }
}

async function serveMaterial(request, env, id, slugGiven) {
  try {
    const rows = await supabaseGet(`materials?id=eq.${encodeURIComponent(id)}&active=eq.true`
      + `&select=id,denomination,rubro,category,sale_unit`);
    const m = Array.isArray(rows) ? rows[0] : null;
    if (!m) return servePage(request, env, NOT_FOUND_META, 404);
    const canonical = materialPath(m.id, m.denomination);
    // Un solo URL por material: si llegó con otro nombre (o sin nombre),
    // redirige al definitivo.
    const url = new URL(request.url);
    if (url.pathname !== canonical) {
      return Response.redirect(`${url.origin}${canonical}${url.search}`, 301);
    }
    return servePage(request, env, {
      title: `${m.denomination}: precio de referencia | NEXOBRA`,
      description: `Precio de referencia de ${m.denomination} (${[m.rubro, m.category].filter(Boolean).join(' · ')}), actualizado mes a mes y trazable, y ofertas de proveedores locales en NEXOBRA.`,
      canonical,
    });
  } catch (err) {
    return servePage(request, env, {});
  }
}

function robotsTxt(origin) {
  const privadas = Object.entries(ROUTES).filter(([, r]) => r.index === false && !r.soon).map(([p]) => `Disallow: ${p}`);
  return [
    'User-agent: *',
    'Allow: /',
    ...privadas,
    'Disallow: /*?share=',
    'Disallow: /*?apu_share=',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

async function sitemapXml(origin) {
  const urls = Object.entries(ROUTES)
    .filter(([, r]) => r.index)
    .map(([p, r]) => ({ loc: `${origin}${p === '/' ? '/' : p}`, priority: r.priority }));
  try {
    const branches = await supabaseGet('provider_branches?active=eq.true&slug=not.is.null&select=slug');
    branches.forEach(b => urls.push({ loc: `${origin}/proveedor/${encodeURIComponent(b.slug)}`, priority: '0.6' }));
  } catch (err) { /* sin proveedores si Supabase no responde */ }
  try {
    // PostgREST devuelve hasta 1000 filas por pedido: se piden de a 1000.
    for (let from = 0; from < 20000; from += 1000) {
      const rows = await supabaseGet(`materials?active=eq.true&select=id,denomination,updated_at&order=id&offset=${from}&limit=1000`);
      rows.forEach(m => urls.push({
        loc: `${origin}${materialPath(m.id, m.denomination)}`,
        lastmod: m.updated_at ? String(m.updated_at).slice(0, 10) : null,
        priority: '0.5',
      }));
      if (rows.length < 1000) break;
    }
  } catch (err) { /* sin materiales si Supabase no responde */ }
  const body = urls.map(u => `  <url><loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${u.priority ? `<priority>${u.priority}</priority>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// (22/11, seguridad) Headers de seguridad para las respuestas del Worker. Los
// archivos estáticos que no pasan por el Worker los reciben desde _headers.
// La CSP que bloquea va mínima (iframes, <base>, plugins y formularios); la
// completa queda en modo "solo reporte" para probarla antes de activarla.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://cdn.sheetjs.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${SUPABASE_URL} ${SUPABASE_URL.replace('https://', 'wss://')} https://nominatim.openstreetmap.org https://cloudflareinsights.com https://cdn.jsdelivr.net https://unpkg.com https://cdn.sheetjs.com`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join('; ');
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=15552000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)',
  'Content-Security-Policy': "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
  'Content-Security-Policy-Report-Only': CSP_REPORT_ONLY,
};
function withSecurityHeaders(res) {
  if (!res) return res;
  // Las redirecciones de Response.redirect() tienen headers inmutables: se copian.
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!out.headers.has(k)) out.headers.set(k, v);
  }
  return out;
}

export default {
  async fetch(request, env) {
    return withSecurityHeaders(await handleRequest(request, env));
  },
};

async function handleRequest(request, env) {
  {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request);

    if (path === '/robots.txt') {
      return new Response(robotsTxt(url.origin), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
    }
    if (path === '/sitemap.xml') {
      return new Response(await sitemapXml(url.origin), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=21600' } });
    }

    // Archivos (cualquier cosa con extensión): tal cual, sin tocar.
    if (/\.[a-z0-9]{1,8}$/i.test(path)) return env.ASSETS.fetch(request);

    // "/catalogo/" → "/catalogo": una sola URL por página.
    if (path.length > 1 && path.endsWith('/')) {
      return Response.redirect(`${url.origin}${path.replace(/\/+$/, '')}${url.search}`, 301);
    }

    if (ROUTES[path]) {
      const r = ROUTES[path];
      // Los links compartidos (?share= / ?apu_share=) son de una persona: no se indexan.
      const privado = r.index === false || url.searchParams.has('share') || url.searchParams.has('apu_share');
      return servePage(request, env, { ...r, index: !privado, canonical: path });
    }

    const prov = path.match(/^\/proveedor\/([^/]+)$/);
    if (prov) return serveProvider(request, env, decodeURIComponent(prov[1]));

    const mat = path.match(/^\/material\/([A-Za-z]+-\d+)(?:-([a-z0-9-]*))?$/);
    if (mat) return serveMaterial(request, env, mat[1].toUpperCase(), mat[2] || '');

    return servePage(request, env, NOT_FOUND_META, 404);
  }
}
