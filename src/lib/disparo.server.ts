export type DisparoInput = {
  text: string;
  fileUrl?: string | null;
  mediaType?: string | null;
  docName?: string | null;
  delayMs?: number | null;
};

export type DisparoResultado = {
  chat_id: string;
  group_name: string | null;
  ok: boolean;
  error?: string;
};

export async function enviarParaGrupos(input: DisparoInput) {
  const baseUrl = (process.env["UAZAPI_URL"] ?? "").replace(/\/+$/, "");
  const token = process.env["UAZAPI_TOKEN"];
  if (!baseUrl || !token) {
    return { ok: false as const, error: "Credenciais da uazapi não configuradas", resultados: [] };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: grupos, error } = await supabaseAdmin
    .from("wa_groups")
    .select("chat_id, group_name")
    .eq("categoria", "aberto_postavel")
    .eq("ativo", true);

  if (error) return { ok: false as const, error: error.message, resultados: [] };
  if (!grupos || grupos.length === 0) {
    return { ok: false as const, error: "Nenhum grupo ativo em 'Aberto postável'", resultados: [] };
  }

  const hasMedia = Boolean(input.fileUrl && input.fileUrl.trim());
  const endpoint = hasMedia ? `${baseUrl}/send/media` : `${baseUrl}/send/text`;
  const delay = Math.max(0, Math.min(input.delayMs ?? 1500, 20000));
  const resultados: DisparoResultado[] = [];

  for (const g of grupos) {
    const body: Record<string, unknown> = hasMedia
      ? {
          number: g.chat_id,
          type: input.mediaType || "image",
          file: input.fileUrl!.trim(),
          ...(input.text.trim() ? { text: input.text.trim() } : {}),
          ...(input.docName?.trim() ? { docName: input.docName.trim() } : {}),
        }
      : { number: g.chat_id, text: input.text.trim() };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", token },
        body: JSON.stringify(body),
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
    enviados: resultados.filter((r) => r.ok).length,
    falhas: resultados.filter((r) => !r.ok).length,
    resultados,
  };
}
