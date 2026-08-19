export type LimpezaResultado = {
  chat_id: string;
  group_name: string | null;
  ok: boolean;
  error?: string;
};

/**
 * Limpa (clearChatWhatsApp) o chat de todos os grupos ativos na uazapi.
 * Não deleta o chat nem sai do grupo: apenas limpa o histórico de mensagens.
 */
export async function limparChatsDeGruposAtivos(delayMs = 400) {
  const baseUrl = (process.env["UAZAPI_URL"] ?? "").replace(/\/+$/, "");
  const token = process.env["UAZAPI_TOKEN"];
  if (!baseUrl || !token) {
    return { ok: false as const, error: "Credenciais da uazapi não configuradas", resultados: [] };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: grupos, error } = await supabaseAdmin
    .from("wa_groups")
    .select("chat_id, group_name")
    .eq("ativo", true);

  if (error) return { ok: false as const, error: error.message, resultados: [] };

  const lista = grupos ?? [];
  const resultados: LimpezaResultado[] = [];
  const delay = Math.max(0, Math.min(delayMs, 5000));

  for (const g of lista) {
    try {
      const res = await fetch(`${baseUrl}/chat/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", token },
        body: JSON.stringify({
          number: g.chat_id,
          deleteChatDB: false,
          deleteMessagesDB: true,
          deleteChatWhatsApp: false,
          clearChatWhatsApp: true,
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        resultados.push({
          chat_id: g.chat_id,
          group_name: g.group_name,
          ok: false,
          error: `HTTP ${res.status}: ${detail.slice(0, 160)}`,
        });
      } else {
        resultados.push({ chat_id: g.chat_id, group_name: g.group_name, ok: true });
      }
    } catch {
      resultados.push({
        chat_id: g.chat_id,
        group_name: g.group_name,
        ok: false,
        error: "Falha de rede ao contatar a uazapi",
      });
    }
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  return {
    ok: true as const,
    total: resultados.length,
    limpos: resultados.filter((r) => r.ok).length,
    falhas: resultados.filter((r) => !r.ok).length,
    resultados,
  };
}
