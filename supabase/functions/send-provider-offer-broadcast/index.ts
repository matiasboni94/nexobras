// NEXOBRA · Edge Function "send-provider-offer-broadcast"
//
// La llama el propio proveedor, logueado, desde "Mi Proveedor" (botón
// "Enviar mis ofertas a mis suscriptores"). A diferencia de notify-admin /
// check-category-alerts, ACÁ no hay CRON_SECRET: la identidad viene del JWT
// del usuario que ya viene autenticado por el propio gateway de Supabase
// (esta función se despliega CON verify_jwt activado, que es el default --
// no hace falta "--no-verify-jwt"). Si el JWT llegó hasta acá, la firma ya
// la validó la plataforma; solo hace falta leer el "sub" (id de usuario)
// del payload para saber quién está pidiendo el envío.
//
// Qué hace:
//   1. Valida que quien llama sea efectivamente el dueño de la sucursal.
//   2. Rate-limit: máximo un envío cada 24hs por sucursal (evita spam a los
//      suscriptores -- "ofertas del día o de la semana", no más seguido).
//   3. Junta las ofertas activas (status='approved') de esa sucursal.
//   4. Junta los suscriptores (con su email, vía get_offer_broadcast_recipients,
//      la única forma de leer auth.users sin exponerla por REST).
//   5. Manda un mail por suscriptor vía Resend, y registra el envío.
//
// Variables de entorno necesarias (Supabase → Project Settings → Edge
// Functions → Secrets):
//   RESEND_API_KEY      -> ya debería existir, la misma que las otras funciones.
//   NOTIFY_FROM_EMAIL    (opcional) -> por defecto notificaciones@nexoobra.com.ar
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("NOTIFY_FROM_EMAIL") || "NEXOBRA <notificaciones@nexoobra.com.ar>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SITE_URL = "https://nexoobra.com.ar";
const RATE_LIMIT_HOURS = 24;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(amount || 0);
}

// (26/11, hardening) Antes se decodificaba el JWT sin verificar la firma,
// confiando en que la función estuviera desplegada con verify_jwt. Ahora se le
// pregunta a Supabase Auth quién es el dueño del token: si el token no es
// válido (vencido, falso o de otro proyecto), Auth lo rechaza.
async function getUserFromJwt(authHeader: string | null): Promise<{ id: string } | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY!, Authorization: authHeader },
    });
    if (!res.ok) return null;
    const u = await res.json();
    return u && typeof u.id === "string" ? { id: u.id } : null;
  } catch {
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function restFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

type Offer = { amount: number; unit: string; stock_status: string; materials: { denomination: string } | null };
type Recipient = { user_id: string; email: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!RESEND_API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("send-provider-offer-broadcast: faltan variables de entorno");
    return json({ error: "El servicio no está configurado." }, 500);
  }

  const user = await getUserFromJwt(req.headers.get("authorization"));
  if (!user) {
    return json({ error: "No autenticado." }, 401);
  }

  try {
    const { branch_id } = await req.json();
    if (!branch_id) return json({ error: "Falta branch_id." }, 400);
    // (26/11) Se valida el formato: el id va dentro de una URL de la API con la clave de servicio.
    if (typeof branch_id !== "string" || !UUID_RE.test(branch_id)) return json({ error: "branch_id inválido." }, 400);

    // 1) Verificar dueño de la sucursal.
    const branchRes = await restFetch(
      `/rest/v1/provider_branches?id=eq.${branch_id}&select=id,provider_id,providers(owner_id,business_name)`,
    );
    if (!branchRes.ok) return json({ error: "No se pudo verificar la sucursal." }, 500);
    const branchRows = await branchRes.json();
    const branch = branchRows?.[0];
    if (!branch || !branch.providers || branch.providers.owner_id !== user.id) {
      return json({ error: "No autorizado sobre esta sucursal." }, 403);
    }
    const providerId = branch.provider_id;
    const businessName = branch.providers.business_name as string;

    // 2) Rate limit: un envío cada RATE_LIMIT_HOURS por sucursal.
    const lastRes = await restFetch(
      `/rest/v1/provider_offer_broadcasts?branch_id=eq.${branch_id}&select=sent_at&order=sent_at.desc&limit=1`,
    );
    const lastRows = lastRes.ok ? await lastRes.json() : [];
    if (lastRows?.[0]?.sent_at) {
      const elapsedHours = (Date.now() - new Date(lastRows[0].sent_at).getTime()) / 3_600_000;
      if (elapsedHours < RATE_LIMIT_HOURS) {
        return json({
          error: `Ya mandaste tus ofertas hace menos de ${RATE_LIMIT_HOURS} horas. Podés volver a mandar en ${Math.ceil(RATE_LIMIT_HOURS - elapsedHours)}hs.`,
          retry_after_hours: Math.ceil(RATE_LIMIT_HOURS - elapsedHours),
        }, 429);
      }
    }

    // 3) Ofertas activas de la sucursal.
    const offersRes = await restFetch(
      `/rest/v1/provider_offers?branch_id=eq.${branch_id}&status=eq.approved&select=amount,unit,stock_status,materials(denomination)&order=updated_at.desc&limit=40`,
    );
    if (!offersRes.ok) return json({ error: "No se pudieron leer tus ofertas." }, 500);
    const offers: Offer[] = await offersRes.json();
    if (!offers || offers.length === 0) {
      return json({ error: "Todavía no tenés precios activos cargados -- cargá al menos uno antes de avisar a tus suscriptores." }, 400);
    }

    // 4) Suscriptores (con email).
    const recipientsRes = await restFetch(`/rest/v1/rpc/get_offer_broadcast_recipients`, {
      method: "POST",
      body: JSON.stringify({ p_branch_id: branch_id }),
    });
    if (!recipientsRes.ok) {
      const errText = await recipientsRes.text();
      console.error("send-provider-offer-broadcast: error leyendo suscriptores ->", errText);
      return json({ error: "No se pudieron leer los suscriptores." }, 500);
    }
    const recipients: Recipient[] = await recipientsRes.json();
    if (!recipients || recipients.length === 0) {
      return json({ ok: true, recipient_count: 0, message: "Todavía no tenés suscriptores para avisar. Cuando alguien se suscriba a tus ofertas, vas a poder mandarles esto." });
    }

    // 5) Armar y mandar el mail (uno por suscriptor).
    const offersHtml = offers
      .map((o) => `<li><strong>${escapeHtml(o.materials?.denomination || "Material")}</strong> — ${formatMoney(o.amount)} / ${escapeHtml(o.unit)}${o.stock_status === "agotado" ? " <em>(agotado)</em>" : o.stock_status === "a_pedido" ? " <em>(a pedido)</em>" : ""}</li>`)
      .join("");

    let sentCount = 0;
    for (const r of recipients) {
      if (!r.email) continue;
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [r.email],
          subject: `📦 Ofertas de ${businessName} — NEXOBRA`,
          html: `
            <p><strong>${escapeHtml(businessName)}</strong> te manda sus ofertas de hoy:</p>
            <ul>${offersHtml}</ul>
            <p><a href="${SITE_URL}/?view=providers-directory">Ver en NEXOBRA</a></p>
            <p style="font-size:12px;color:#888;">Te llega esto porque te suscribiste para recibir las ofertas de ${escapeHtml(businessName)} en NEXOBRA. Te podés dar de baja cuando quieras desde "Mis Favoritos".</p>
          `,
        }),
      });
      if (emailRes.ok) {
        sentCount += 1;
      } else {
        const errText = await emailRes.text();
        console.error(`send-provider-offer-broadcast: error de Resend para ${r.email} ->`, errText);
      }
    }

    // 6) Registrar el envío (para el rate-limit de la próxima vez).
    await restFetch(`/rest/v1/provider_offer_broadcasts`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        branch_id,
        provider_id: providerId,
        sent_by: user.id,
        recipient_count: sentCount,
      }),
    });

    return json({ ok: true, recipient_count: sentCount });
  } catch (e) {
    console.error("send-provider-offer-broadcast: error inesperado ->", e);
    return json({ error: "Error inesperado." }, 500);
  }
});
