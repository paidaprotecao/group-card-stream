import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/limpar-chats")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { limparChatsDeGruposAtivos } = await import("@/lib/limpar-chats.server");
        const result = await limparChatsDeGruposAtivos();
        if (!result.ok) {
          console.error("[limpar-chats] falhou:", result.error);
          return new Response(JSON.stringify({ success: false, error: result.error }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        console.log(`[limpar-chats] ${result.limpos}/${result.total} chats limpos`);
        return Response.json({
          success: true,
          total: result.total,
          limpos: result.limpos,
          falhas: result.falhas,
        });
      },
    },
  },
});
