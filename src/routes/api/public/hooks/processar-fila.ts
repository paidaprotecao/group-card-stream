import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const apikey = request.headers.get("apikey") ?? new URL(request.url).searchParams.get("apikey") ?? "";
  const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
  if (!expected || apikey !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { processarFila } = await import("@/lib/fila.server");
    const result = await processarFila();
    if (!result.ok) {
      console.error("[processar-fila] falhou:", result.error);
      return Response.json({ success: false, error: result.error }, { status: 500 });
    }
    console.log(`[processar-fila] ${result.processados} lote(s) processado(s)`);
    return Response.json({ success: true, ...result });
  } catch (err) {
    console.error("[processar-fila] erro:", err);
    return Response.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/hooks/processar-fila")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
