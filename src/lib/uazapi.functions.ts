import { createServerFn } from "@tanstack/react-start";

type UazapiGroup = {
  JID?: string;
  Name?: string;
  NameSetAt?: string;
  GroupCreated?: string;
};

export const syncUazapiGroups = createServerFn({ method: "POST" }).handler(async () => {
  const baseUrl = (process.env["UAZAPI_URL"] ?? "").replace(/\/+$/, "");
  const token = process.env["UAZAPI_TOKEN"];
  if (!baseUrl || !token) {
    return { ok: false as const, error: "Credenciais da uazapi não configuradas", inserted: 0, updated: 0, total: 0 };
  }

  let payload: unknown;
  try {
    const res = await fetch(`${baseUrl}/group/list?noparticipants=true`, {
      headers: { Accept: "application/json", token },
    });
    if (!res.ok) {
      return { ok: false as const, error: `uazapi respondeu ${res.status}`, inserted: 0, updated: 0, total: 0 };
    }
    payload = await res.json();
  } catch {
    return { ok: false as const, error: "Falha ao contatar a uazapi", inserted: 0, updated: 0, total: 0 };
  }

  const raw = Array.isArray(payload)
    ? payload
    : ((payload as { groups?: unknown })?.groups as unknown[] | undefined) ?? [];

  const groups = (raw as UazapiGroup[])
    .map((g) => ({
      chat_id: String(g.JID ?? "").trim(),
      group_name: (g.Name ?? "").trim() || null,
      last_seen_at: g.NameSetAt ?? g.GroupCreated ?? new Date().toISOString(),
    }))
    .filter((g) => g.chat_id.endsWith("@g.us"));

  if (groups.length === 0) {
    return { ok: true as const, inserted: 0, updated: 0, total: 0 };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing, error: selectError } = await supabaseAdmin
    .from("wa_groups")
    .select("chat_id")
    .in(
      "chat_id",
      groups.map((g) => g.chat_id),
    );
  if (selectError) {
    return { ok: false as const, error: selectError.message, inserted: 0, updated: 0, total: groups.length };
  }

  const known = new Set((existing ?? []).map((r) => r.chat_id));
  const toInsert = groups.filter((g) => !known.has(g.chat_id));
  const toUpdate = groups.filter((g) => known.has(g.chat_id));

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin.from("wa_groups").insert(
      toInsert.map((g) => ({ ...g, categoria: "indefinido", ativo: true })),
    );
    if (error) {
      return { ok: false as const, error: error.message, inserted: 0, updated: 0, total: groups.length };
    }
  }

  for (const g of toUpdate) {
    // preserva categoria e ativo definidos no Kanban
    await supabaseAdmin
      .from("wa_groups")
      .update({ group_name: g.group_name, last_seen_at: g.last_seen_at })
      .eq("chat_id", g.chat_id);
  }

  return {
    ok: true as const,
    inserted: toInsert.length,
    updated: toUpdate.length,
    total: groups.length,
  };
});
