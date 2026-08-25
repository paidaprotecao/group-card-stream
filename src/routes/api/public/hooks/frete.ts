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

        const registrarDebug = async (resumo: string) => {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("webhook_debug").insert({ hook: "frete", payload: payload as never, resumo });
          } catch (logErr) {
            console.error("[fila] debug log falhou:", logErr);
          }
        };

        try {
          const { enfileirarMensagem } = await import("@/lib/fila.server");
          const result = await enfileirarMensagem(payload);
          if (!result.ok) {
            await registrarDebug(`erro=${result.error}`);
            return Response.json({ success: false, error: result.error }, { status: 422 });
          }
          if (result.ignorado) {
            const resumo = `ignorado · ${result.motivo} · origem=${result.source_chat_id ?? "sem-origem"} · categoria=${result.categoria_origem ?? "sem-categoria"}`;
            console.log(`[fila] ${resumo}`);
            await registrarDebug(resumo);
            return Response.json({ success: true, ...result });
          }
          const resumo = `lote ${result.lote_id} · itens ${result.itens} · novo=${result.novo_lote} · dup=${result.duplicado} · origem=${result.source_chat_id ?? "sem-origem"} · categoria=${result.categoria_origem ?? "sem-categoria"}`;
          console.log(`[fila] ${resumo}`);
          await registrarDebug(resumo);
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
