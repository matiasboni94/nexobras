// NEXOBRA - Edge Function "contact-form"
// Recibe { name, email, message } desde el formulario de Contacto del sitio
// y lo manda por mail a nexobra.info@gmail.com usando Resend (mismo servicio
// que ya usan notify-admin / notify-price-alert).
//
// Variables de entorno necesarias (Supabase → Project Settings → Edge Functions → Secrets):
//   RESEND_API_KEY   -> ya debería existir, es la misma que usan las otras funciones.
//   CONTACT_FROM_EMAIL (opcional) -> remitente a usar. Si no se configura, se
//     usa el mismo remitente que ya usa notify-admin sobre el dominio
//     nexoobra.com.ar (ya verificado en Resend), así evitamos el límite del
//     sandbox de Resend (onboarding@resend.dev), que solo puede mandar a la
//     casilla dueña de la cuenta.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("CONTACT_FROM_EMAIL") || "NEXOBRA <notificaciones@nexoobra.com.ar>";
const TO_EMAIL = "nexobra.info@gmail.com";

// (26/11, hardening) Solo se aceptan pedidos desde el sitio (CORS cerrado),
// con largos máximos, mail válido, un campo trampa para robots y un mínimo de
// tiempo en la página. A un robot se le contesta "ok" sin mandar nada.
const ORIGENES = new Set([
  "https://nexoobra.com.ar", "https://www.nexoobra.com.ar",
  "https://nexobra.com.ar", "https://www.nexobra.com.ar",
]);
const MAX = { name: 100, email: 254, message: 4000 };
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

function corsPara(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGENES.has(origin) ? origin : "https://nexoobra.com.ar",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsPara(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!ORIGENES.has(req.headers.get("origin") || "")) {
    return new Response(JSON.stringify({ error: "Origen no permitido." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const raw = await req.text();
    if (raw.length > 12000) {
      return new Response(JSON.stringify({ error: "Mensaje demasiado largo." }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const body = JSON.parse(raw || "{}");
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const message = String(body.message ?? "").trim();

    // Robots: campo trampa completo o envío a menos de 3 segundos de abrir la página.
    if (String(body.web ?? "") !== "" || (typeof body.t === "number" && body.t < 3000)) {
      console.warn("contact-form: descartado como robot");
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (name.length > MAX.name || email.length > MAX.email || message.length > MAX.message || !EMAIL_RE.test(email)) {
      return new Response(
        JSON.stringify({ error: "Revisá los datos: nombre, email válido y un mensaje de hasta 4000 caracteres." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: "Faltan datos del formulario (nombre, email o mensaje)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!RESEND_API_KEY) {
      console.error("contact-form: falta la variable de entorno RESEND_API_KEY");
      return new Response(
        JSON.stringify({ error: "El servicio de email no está configurado." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        reply_to: email,
        subject: `Consulta de ${name.replace(/[\r\n]+/g, " ").slice(0, 80)} — NEXOBRA`,
        html: `
          <p><strong>Nombre:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Mensaje:</strong></p>
          <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
        `,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("contact-form: error de Resend ->", errText);
      return new Response(
        JSON.stringify({ error: "No se pudo enviar el email." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("contact-form: error inesperado ->", e);
    return new Response(JSON.stringify({ error: "Error inesperado." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
