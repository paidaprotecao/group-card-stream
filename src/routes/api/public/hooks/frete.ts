import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/frete")({
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
          const { enfileirarMensagem } = await import("@/lib/fila.server");
          const result = await enfileirarMensagem(payload);
          if (!result.ok) {
            return Response.json({ success: false, error: result.error }, { status: 422 });
          }
          if (result.ignorado) {
            console.log(`[fila] ignorado · ${result.motivo} · categoria=${result.categoria_origem}`);
            return Response.json({ success: true, ...result });
          }
          console.log(
            `[fila] lote ${result.lote_id} · itens ${result.itens} · novo=${result.novo_lote} · dup=${result.duplicado}`,
          );
          return Response.json({ success: true, ...result });

        } catch (err) {
          console.error("[fila] falhou:", err);
          return Response.json(
            { success: false, error: (err as Error).message },
            { status: 500 },
          );
        }
      },
    },
  },
});
