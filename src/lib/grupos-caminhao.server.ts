// Server-only: extrai convites de grupos de WhatsApp de um payload de webhook e grava no banco.

const INVITE_REGEX = /https?:\/\/chat\.whatsapp\.com\/(?:invite\/)?([0-9A-Za-z]{15,30})/gi;

export type InviteFound = { code: string; url: string };

export function extractInvites(text: string): InviteFound[] {
  const out = new Map<string, InviteFound>();
  for (const m of text.matchAll(INVITE_REGEX)) {
    const code = m[1]!;
    out.set(code, { code, url: `https://chat.whatsapp.com/${code}` });
  }
  return [...out.values()];
}

/** Percorre qualquer JSON e junta todos os textos, para achar links em qualquer formato de payload. */
export function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 8) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((v) => collectStrings(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((v) =>
      collectStrings(v, depth + 1),
    );
  }
  return [];
}

function pick(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = key.split(".").reduce<unknown>((acc, part) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
      return undefined;
    }, record);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export type RegistrarResult = {
  ok: true;
  encontrados: number;
  novos: number;
  repetidos: number;
  codigos: string[];
};

export async function registrarLinksDoPayload(payload: unknown): Promise<RegistrarResult> {
  const texts = collectStrings(payload);
  const invites = new Map<string, InviteFound>();
  for (const t of texts) {
    for (const invite of extractInvites(t)) invites.set(invite.code, invite);
  }

  const messageText =
    pick(payload, [
      "message.text",
      "message.content",
      "text",
      "body",
      "conteudo",
      "messageText",
    ]) ?? texts.find((t) => INVITE_REGEX.test(t)) ?? null;

  const sourceChatId = pick(payload, [
    "chatid",
    "chatId",
    "message.chatid",
    "message.chatId",
    "group_id",
    "groupJid",
  ]);
  const sourceGroupName = pick(payload, [
    "chatName",
    "message.chatName",
    "group_name",
    "groupName",
    "grupo",
  ]);
  const sender = pick(payload, [
    "sender",
    "message.sender",
    "senderName",
    "message.senderName",
    "from",
    "participant",
  ]);

  if (invites.size === 0) {
    return { ok: true, encontrados: 0, novos: 0, repetidos: 0, codigos: [] };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const codes = [...invites.keys()];
  const { data: existentes, error: selectError } = await supabaseAdmin
    .from("grupos_caminhao")
    .select("id, invite_code, hits")
    .in("invite_code", codes);
  if (selectError) throw new Error(selectError.message);

  const existentesMap = new Map((existentes ?? []).map((r) => [r.invite_code, r]));
  const nowIso = new Date().toISOString();
  let novos = 0;
  let repetidos = 0;

  for (const invite of invites.values()) {
    const found = existentesMap.get(invite.code);
    if (found) {
      repetidos += 1;
      const { error } = await supabaseAdmin
        .from("grupos_caminhao")
        .update({ hits: (found.hits ?? 1) + 1, last_seen_at: nowIso })
        .eq("id", found.id);
      if (error) console.error("[grupos-caminhao] update falhou:", error.message);
      continue;
    }
    const { error } = await supabaseAdmin.from("grupos_caminhao").insert({
      invite_code: invite.code,
      invite_url: invite.url,
      status: "novo",
      source_chat_id: sourceChatId,
      source_group_name: sourceGroupName,
      sender,
      message_text: messageText ? messageText.slice(0, 2000) : null,
      last_seen_at: nowIso,
    });
    if (error) {
      console.error("[grupos-caminhao] insert falhou:", error.message);
      continue;
    }
    novos += 1;
  }

  return { ok: true, encontrados: invites.size, novos, repetidos, codigos: codes };
}
