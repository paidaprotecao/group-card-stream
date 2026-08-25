import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/mensagem")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? new URL(request.url).searchParams.get("apikey") ?? "";
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "JSON inválido" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { registrarLinksDoPayload } = await import("@/lib/grupos-caminhao.server");
          const { enfileirarMensagem } = await import("@/lib/fila.server");
          const result = await registrarLinksDoPayload(payload);
          const fila = await enfileirarMensagem(payload);
          console.log(
            `[mensagem] ${result.encontrados} links · ${result.novos} novos · ${result.repetidos} repetidos · fila=${fila.ok ? fila.lote_id ?? fila.motivo ?? "ok" : fila.error}`,
          );
          return Response.json({ success: true, links: result, fila });
        } catch (err) {
          console.error("[mensagem] falhou:", err);
          return new Response(
            JSON.stringify({ success: false, error: (err as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
