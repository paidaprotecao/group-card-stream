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

        const payloadRecord = payload && typeof payload === "object" && !Array.isArray(payload)
          ? payload as Record<string, unknown>
          : null;
        if (!payloadRecord || Object.keys(payloadRecord).length === 0 ||
          (Object.keys(payloadRecord).length === 1 && payloadRecord["message"] == null)) {
          const resumo = "Payload vazio: a UAZAPI/n8n enviou apenas message=null";
          console.error(`[mensagem] ${resumo}`);
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("webhook_debug").insert({ hook: "mensagem", payload: payload as never, resumo });
          } catch (logErr) {
            console.error("[mensagem] debug log falhou:", logErr);
          }
          return Response.json(
            { success: false, error: resumo },
            { status: 422 },
          );
        }

        try {
          const { registrarLinksDoPayload } = await import("@/lib/grupos-caminhao.server");
          const { enfileirarMensagem, temOrigemDeGrupo } = await import("@/lib/fila.server");
          const result = await registrarLinksDoPayload(payload);
          const temGrupo = temOrigemDeGrupo(payload);
          const fila = temGrupo
            ? await enfileirarMensagem(payload)
            : {
                ok: true as const,
                lote_id: null,
                novo_lote: false,
                duplicado: false,
                itens: 0,
                ignorado: true,
                motivo: "Payload sem dados de grupo para fila",
                source_chat_id: null,
                categoria_origem: null,
              };
          const resumo = `links=${result.encontrados}/${result.novos} · temGrupo=${temGrupo} · fila=${fila.ok ? `${fila.lote_id ?? fila.motivo ?? "ok"} · origem=${fila.source_chat_id ?? "sem-origem"} · categoria=${fila.categoria_origem ?? "sem-categoria"}` : fila.error}`;
          console.log(`[mensagem] ${resumo}`);
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("webhook_debug").insert({ hook: "mensagem", payload: payload as never, resumo });
          } catch (logErr) {
            console.error("[mensagem] debug log falhou:", logErr);
          }
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
