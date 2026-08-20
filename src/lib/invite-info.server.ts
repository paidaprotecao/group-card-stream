// Server-only: consulta informações de um grupo de WhatsApp pelo código de convite (uazapi).

export type InviteInfo = {
  group_jid: string | null;
  group_name: string | null;
  group_description: string | null;
  group_owner: string | null;
  participants_count: number | null;
};

function first(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = key.split(".").reduce<unknown>((acc, part) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
      return undefined;
    }, obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  return null;
}

/** Chama POST /group/inviteInfo da uazapi e normaliza a resposta. */
export async function fetchInviteInfo(inviteCode: string): Promise<InviteInfo> {
  const baseUrl = (process.env["UAZAPI_URL"] ?? "").replace(/\/+$/, "");
  const token = process.env["UAZAPI_TOKEN"] ?? "";
  if (!baseUrl || !token) throw new Error("Credenciais da uazapi não configuradas");

  const response = await fetch(`${baseUrl}/group/inviteInfo`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token,
    },
    body: JSON.stringify({ invitecode: inviteCode }),
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object"
        ? asString((payload as Record<string, unknown>)["error"])
        : null) ?? text.slice(0, 200) ?? `HTTP ${response.status}`;
    throw new Error(message);
  }

  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const obj = ((first(root, ["group", "data", "result", "groupInfo"]) as Record<
    string,
    unknown
  >) ?? root) as Record<string, unknown>;

  return {
    group_jid: asString(first(obj, ["JID", "jid", "id", "chatid", "chatId", "gid"])),
    group_name: asString(first(obj, ["Name", "name", "subject", "GroupName", "groupName", "title"])),
    group_description: asString(first(obj, ["Topic", "topic", "desc", "description"])),
    group_owner: asString(first(obj, ["OwnerJID", "owner", "ownerJid", "creator", "GroupCreated"])),
    participants_count:
      asNumber(first(obj, ["size", "Size", "participantsCount", "participants_count"])) ??
      asNumber(first(obj, ["Participants", "participants"])),
  };
}

/** Busca e grava as informações do grupo na linha informada. */
export async function preencherInfoDoConvite(
  rowId: string,
  inviteCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  try {
    const info = await fetchInviteInfo(inviteCode);
    const { error } = await supabaseAdmin
      .from("grupos_caminhao")
      .update({ ...info, info_fetched_at: nowIso, info_error: null })
      .eq("id", rowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (err) {
    const message = (err as Error).message;
    await supabaseAdmin
      .from("grupos_caminhao")
      .update({ info_fetched_at: nowIso, info_error: message.slice(0, 300) })
      .eq("id", rowId);
    return { ok: false, error: message };
  }
}

/** Preenche as informações de todas as linhas ainda sem consulta feita. */
export async function preencherInfosPendentes(limite = 30): Promise<{
  total: number;
  ok: number;
  falhas: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("grupos_caminhao")
    .select("id, invite_code")
    .is("info_fetched_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  let ok = 0;
  for (const row of rows) {
    const result = await preencherInfoDoConvite(row.id, row.invite_code);
    if (result.ok) ok += 1;
  }
  return { total: rows.length, ok, falhas: rows.length - ok };
}
