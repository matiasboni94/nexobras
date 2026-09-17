// NEXOBRA — Worker principal del sitio.
//
// Contexto (17/09): el sitio se despliega acá como Cloudflare Worker "con
// static assets" (comando de build: npx wrangler deploy), NO como Cloudflare
// Pages clásico. Por eso functions/proveedor/[slug].js (pensado para Pages,
// que arma rutas solo a partir del nombre de archivo) nunca se llegó a
// ejecutar en este despliegue -- este archivo lo reemplaza, con la MISMA
// lógica de siempre, pero como corresponde para este tipo de proyecto.
//
// Qué hace (ver wrangler.jsonc → "run_worker_first": ["/proveedor/*"], que
// es lo que hace que SOLO esas URLs pasen por acá -- todo el resto del
// sitio lo sirve Cloudflare directo desde los archivos estáticos, sin gastar
// invocaciones de Worker):
//  - Para /proveedor/<slug>: le sirve al visitante la MISMA app de siempre
//    (index.html) -- el sitio sigue siendo el mismo SPA, js/main.js ya sabe
//    leer "/proveedor/<slug>" en la URL y mostrar la ficha correcta (ver
//    loadProviderPublicPage en js/map.js). Lo único que agrega este Worker
//    es reescribir el <title> y los meta tags "og:" (Open Graph) del <head>
//    ANTES de mandar la respuesta, con los datos reales del proveedor --
//    así, al pegar el link en WhatsApp/Instagram, la vista previa muestra el
//    nombre y el logo del proveedor en vez de la genérica de NEXOBRA.
//  - Si algo falla (proveedor no encontrado, Supabase caído, etc.) o la URL
//    no matchea /proveedor/<slug>: se sirve el sitio estático tal cual, sin
//    romper nada.

const SUPABASE_URL = 'https://ibwqkfdfyfdmteheacjz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3-UVWAW7oH2NVTd-I5A-aw_Q-BQi67_';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function buildProviderPreview(slug, request, originalResponse) {
  try {
    const apiUrl = `${SUPABASE_URL}/rest/v1/provider_branches`
      + `?slug=eq.${encodeURIComponent(slug)}&active=eq.true`
      + `&select=name,locality,providers(business_name,description,logo_url)`;

    const apiRes = await fetch(apiUrl, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!apiRes.ok) return originalResponse;

    const rows = await apiRes.json();
    const branch = Array.isArray(rows) ? rows[0] : null;
    if (!branch || !branch.providers) return originalResponse;

    const provider = branch.providers;
    const title = `${provider.business_name} | NEXOBRA`;
    const description = (provider.description ? provider.description.slice(0, 160) : '')
      || `Lista de precios y contacto de ${provider.business_name} en ${branch.locality || 'tu zona'}, en NEXOBRA — comparador técnico de precios de la construcción.`;
    const image = provider.logo_url || `${new URL(request.url).origin}/assets/icon-512.png`;
    const pageUrl = request.url;

    const newHeadTags = `
      <title>${escapeHtml(title)}</title>
      <meta name="description" content="${escapeHtml(description)}">
      <meta property="og:type" content="website">
      <meta property="og:title" content="${escapeHtml(title)}">
      <meta property="og:description" content="${escapeHtml(description)}">
      <meta property="og:image" content="${escapeHtml(image)}">
      <meta property="og:url" content="${escapeHtml(pageUrl)}">
      <meta name="twitter:card" content="summary_large_image">
    `;

    return new HTMLRewriter()
      .on('title', { element(el) { el.remove(); } })
      .on('meta[name="description"]', { element(el) { el.remove(); } })
      .on('head', { element(el) { el.append(newHeadTags, { html: true }); } })
      .transform(originalResponse);
  } catch (err) {
    // Cualquier error (Supabase caído, red, lo que sea): se sirve la app
    // normal, sin vista previa personalizada, pero sin romper la página.
    return originalResponse;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/proveedor\/([^/]+)\/?$/);

    if (match) {
      const slug = decodeURIComponent(match[1]);
      const assetUrl = new URL('/index.html', request.url);
      const originalResponse = await env.ASSETS.fetch(new Request(assetUrl, request));
      return buildProviderPreview(slug, request, originalResponse);
    }

    // No debería pasar (wrangler.jsonc solo manda /proveedor/* acá), pero
    // por las dudas: servir el sitio estático tal cual.
    return env.ASSETS.fetch(request);
  },
};
