// NEXOBRA — Cloudflare Pages Function: página pública por proveedor
//
// Se activa automáticamente para cualquier URL /proveedor/<algo> (Cloudflare
// Pages arma esta ruta sola a partir del nombre del archivo, [slug].js,
// apenas este archivo esté en el repo dentro de /functions/proveedor/ --
// no hace falta configurar nada en el panel de Cloudflare).
//
// Qué hace: le sirve al visitante la MISMA app (index.html) de siempre --
// el sitio sigue siendo el mismo SPA de siempre, js/main.js ya sabe leer
// "/proveedor/<slug>" en la URL y mostrar la ficha correcta (ver
// js/map.js → loadProviderPublicPage). Lo único que agrega esta función es
// reescribir el <title> y los meta tags de "og:" (Open Graph) del <head>
// ANTES de mandar la respuesta, usando los datos reales del proveedor --
// así, cuando alguien pega el link en WhatsApp/Instagram, la vista previa
// muestra el nombre y el logo del proveedor en vez de la genérica de
// NEXOBRA. Si algo falla (proveedor no encontrado, Supabase caído, etc.),
// se manda el index.html tal cual, sin romper nada.
//
// Ver migración 013_provider_branch_slug.sql (agrega la columna slug) y la
// sección nueva del estado del proyecto para más contexto.

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

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const slug = params.slug;

  const assetUrl = new URL('/index.html', request.url);
  const originalResponse = await env.ASSETS.fetch(new Request(assetUrl, request));

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
