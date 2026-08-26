// Server-only: fila de postagem. Agrupa mensagens do mesmo remetente em pacotes
// e encaminha na ordem para os grupos "Aberto postável".
import { DELAY_ENTRE_GRUPOS, DELAY_ENTRE_ITENS, JANELA_SEGUNDOS } from "@/lib/fila";

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, obj);
}

function pickStr(payload: unknown, paths: string[]): string | null {
  for (const p of paths) {
    const v = get(payload, p);
    const str = valueAsString(v);
    if (str) return str;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function valueAsString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const record = asRecord(value);
  if (!record) return null;

  const serialized = record["_serialized"] ?? record["serialized"] ?? record["String"];
  if (typeof serialized === "string" && serialized.trim()) return serialized.trim();

  const user = record["User"] ?? record["user"];
  const server = record["Server"] ?? record["server"];
  if ((typeof user === "string" || typeof user === "number") && typeof server === "string" && server.trim()) {
    return `${String(user).trim()}@${server.trim()}`;
  }

  return null;
}

const GROUP_JID_RE = /\d[\d-]{5,}@g\.us/i;
const BARE_GROUP_ID_RE = /^(?:120363\d{8,}|\d{8,}-\d{5,})$/;
const SENDER_JID_RE = /\d[\d:-]{5,}@(s\.whatsapp\.net|c\.us|lid)/i;

function normalizeJid(value: string | null, suffix: "group" | "sender"): string | null {
  if (!value) return null;
  const pattern = suffix === "group" ? GROUP_JID_RE : SENDER_JID_RE;
  const trimmed = value.trim();
  const match = trimmed.match(pattern);
  if (match?.[0]) return match[0];
  if (suffix === "group" && BARE_GROUP_ID_RE.test(trimmed)) return `${trimmed}@g.us`;
  return trimmed;
}

function findStringDeep(
  value: unknown,
  keyMatches: (key: string) => boolean,
  valueMatches: (value: string) => boolean,
  depth = 0,
): string | null {
  if (depth > 8) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringDeep(item, keyMatches, valueMatches, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;

  for (const [key, raw] of Object.entries(record)) {
    const str = valueAsString(raw);
    if (str && keyMatches(key) && valueMatches(str)) return str;
  }

  for (const raw of Object.values(record)) {
    const found = findStringDeep(raw, keyMatches, valueMatches, depth + 1);
    if (found) return found;
  }

  return null;
}

function findAnyStringDeep(value: unknown, valueMatches: (value: string) => boolean, depth = 0): string | null {
  if (depth > 8) return null;

  const str = valueAsString(value);
  if (str && valueMatches(str)) return str;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAnyStringDeep(item, valueMatches, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;
  for (const raw of Object.values(record)) {
    const found = findAnyStringDeep(raw, valueMatches, depth + 1);
    if (found) return found;
  }
  return null;
}

function isGroupJid(value: string): boolean {
  const normalized = normalizeJid(value, "group");
  return Boolean(normalized && GROUP_JID_RE.test(normalized));
}

function isSenderJid(value: string): boolean {
  return SENDER_JID_RE.test(value);
}

function pickGroupJid(payload: unknown, paths: string[]): string | null {
  const explicit = normalizeJid(pickStr(payload, paths), "group");
  if (explicit && isGroupJid(explicit)) return explicit;

  const byKey = findStringDeep(
    payload,
    (key) => {
      const normalized = key.toLowerCase();
      return (
        normalized.includes("chat") ||
        normalized.includes("remotejid") ||
        normalized.includes("groupjid") ||
        normalized.includes("group") ||
        normalized === "from" ||
        normalized === "jid"
      );
    },
    isGroupJid,
  );
  return normalizeJid(byKey ?? findAnyStringDeep(payload, isGroupJid), "group");
}

function pickSenderJid(payload: unknown, paths: string[]): string | null {
  const explicit = normalizeJid(pickStr(payload, paths), "sender");
  if (explicit && isSenderJid(explicit)) return explicit;

  const byKey = findStringDeep(
    payload,
    (key) => {
      const normalized = key.toLowerCase();
      return normalized.includes("sender") || normalized.includes("participant") || normalized.includes("author");
    },
    isSenderJid,
  );
  return normalizeJid(byKey ?? findAnyStringDeep(payload, isSenderJid), "sender");
}

function isMensagemTexto(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[{[]/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/\d[\d:-]{5,}@(g\.us|s\.whatsapp\.net|c\.us|lid)/i.test(trimmed)) return false;
  return true;
}

function extrairTelefone(value: string | null): string | null {
  // @lid é um identificador interno do WhatsApp, não um telefone real.
  if (!value || /@g\.us/i.test(value) || /@lid/i.test(value)) return null;
  const base = value.split("@")[0] ?? value;
  const phonePart = base.split(":")[0] ?? base;
  const digits = phonePart.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

function pickSenderPhone(payload: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const phone = extrairTelefone(valueAsString(get(payload, path)));
    if (phone) return phone;
  }

  const byKey = findStringDeep(
    payload,
    (key) => {
      const normalized = key.toLowerCase();
      return (
        normalized.includes("phone") ||
        normalized.includes("number") ||
        normalized.includes("participant") ||
        normalized.includes("sender") ||
        normalized.includes("author") ||
        normalized.includes("from")
      );
    },
    (value) => Boolean(extrairTelefone(value)),
  );

  return extrairTelefone(byKey ?? findAnyStringDeep(payload, (value) => Boolean(extrairTelefone(value))));
}

export function temOrigemDeGrupo(payload: unknown): boolean {
  const normalizado = unwrapMensagemPayload(payload);
  return Boolean(
    pickGroupJid(normalizado, [
      "chatid",
      "chatId",
      "ChatID",
      "chat.wa_chatid",
      "body.chat.wa_chatid",
      "message.chatid",
      "message.chatId",
      "message.chat_id",
      "Message.chatid",
      "Message.chatId",
      "body.chatid",
      "body.chatId",
      "body.ChatID",
      "body.message.chatid",
      "body.message.chatId",
      "body.message.chat_id",
      "data.chatid",
      "data.chatId",
      "data.ChatID",
      "data.chat.wa_chatid",
      "data.message.chatid",
      "data.message.chatId",
      "data.message.chat_id",
      "data.Message.chatid",
      "data.Message.chatId",
      "data.groupJid",
      "data.group_id",
      "data.remoteJid",
      "data.message.remoteJid",
      "data.key.remoteJid",
      "data.message.key.remoteJid",
      "data.Message.key.remoteJid",
      "data.Data.key.remoteJid",
      "data.Data.Key.remoteJid",
      "data.Data.Key.RemoteJid",
      "data.Data.Info.Chat",
      "data.Data.Info.MessageSource.Chat",
      "data.Data.Info.Source.Chat",
      "groupJid",
      "group_id",
      "remoteJid",
      "message.remoteJid",
      "key.remoteJid",
      "message.key.remoteJid",
      "Message.key.remoteJid",
      "Data.key.remoteJid",
      "Data.Key.remoteJid",
      "Data.Key.RemoteJid",
      "Data.Info.Chat",
      "Data.Info.MessageSource.Chat",
      "Data.Info.Source.Chat",
      "event.Data.Info.Chat",
      "event.Info.Chat",
    ]),
  );
}

function pickMessageText(payload: unknown, paths: string[]): string | null {
  const explicit = pickStr(payload, paths);
  if (explicit && isMensagemTexto(explicit)) return explicit;

  return findStringDeep(
    payload,
    (key) => {
      const normalized = key.toLowerCase();
      return normalized === "text" || normalized === "caption" || normalized === "conversation" || normalized === "content" || normalized === "body";
    },
    isMensagemTexto,
  );
}

function parseJsonString(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function unwrapMensagemPayload(payload: unknown): unknown {
  const record = asRecord(payload);
  if (!record) return payload;

  const mensagem = record["mensagem"];
  if (typeof mensagem === "string") {
    const parsed = parseJsonString(mensagem);
    if (parsed) return unwrapMensagemPayload(parsed);
  }
  if (asRecord(mensagem)) return unwrapMensagemPayload(mensagem);

  const data = record["data"];
  if (typeof data === "string") {
    const parsed = parseJsonString(data);
    if (parsed) return unwrapMensagemPayload(parsed);
  }
  if (asRecord(data)) return unwrapMensagemPayload(data);

  const body = record["body"];
  if (typeof body === "string") {
    const parsed = parseJsonString(body);
    if (parsed) return unwrapMensagemPayload(parsed);
  }

  const event = record["event"] ?? record["Event"];
  if (asRecord(event)) return unwrapMensagemPayload(event);

  const upperData = record["Data"];
  if (asRecord(upperData)) return payload;

  if (asRecord(body)) return payload;

  return payload;
}

const MEDIA_KIND: Array<[RegExp, string]> = [
  [/image|photo|figur/i, "image"],
  [/video/i, "video"],
  [/audio|ptt|voice/i, "audio"],
  [/document|file|pdf|sticker/i, "document"],
];

function detectarTipo(payload: unknown): string {
  const raw =
    pickStr(payload, [
      "messageType",
      "Data.Message.Type",
      "Data.messageType",
      "Data.type",
      "message.messageType",
      "Message.messageType",
      "type",
      "message.type",
      "Message.type",
      "mediaType",
      "message.mediaType",
      "Message.mediaType",
      "mimetype",
      "message.mimetype",
      "Message.mimetype",
      "Data.Message.imageMessage.mimetype",
      "Data.Message.videoMessage.mimetype",
      "Data.Message.audioMessage.mimetype",
      "Data.Message.documentMessage.mimetype",
      "body.Data.Message.imageMessage.mimetype",
      "body.Data.Message.videoMessage.mimetype",
      "body.Data.Message.audioMessage.mimetype",
      "body.Data.Message.documentMessage.mimetype",
    ]) ?? "";
  for (const [re, tipo] of MEDIA_KIND) if (re.test(raw)) return tipo;

  const hint = detectarTipoPorChaves(payload);
  if (hint) return hint;
  return "text";
}

function detectarTipoPorChaves(payload: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  const obj = asRecord(payload);
  if (!obj) return null;

  for (const [key, value] of Object.entries(obj)) {
    const normalized = key.toLowerCase();
    if (normalized.includes("imagemessage") || normalized.includes("photomessage")) return "image";
    if (normalized.includes("videomessage")) return "video";
    if (normalized.includes("audiomessage") || normalized.includes("pttmessage")) return "audio";
    if (normalized.includes("documentmessage") || normalized.includes("stickermessage")) return "document";
    if (typeof value === "string") {
      for (const [re, tipo] of MEDIA_KIND) if (re.test(value)) return tipo;
    }
  }

  for (const value of Object.values(obj)) {
    const nested = detectarTipoPorChaves(value, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function isUrl(value: string | null): boolean {
  return Boolean(value && /^(https?:\/\/|data:)/i.test(value));
}

function isProvavelBase64(value: string | null): boolean {
  return Boolean(value && value.length > 120 && /^[A-Za-z0-9+/]+={0,2}$/.test(value));
}

function payloadParaDownload(payload: unknown): unknown {
  const unwrapped = unwrapMensagemPayload(payload);
  return get(unwrapped, "message") ?? get(unwrapped, "body.message") ?? unwrapped;
}

function pickMediaBaixada(payload: unknown): string | null {
  const value = pickStr(payload, [
    "file",
    "File",
    "fileURL",
    "fileUrl",
    "url",
    "URL",
    "mediaUrl",
    "downloadUrl",
    "base64",
    "data",
    "Data",
    "result.file",
    "result.fileURL",
    "result.fileUrl",
    "result.url",
    "result.mediaUrl",
    "result.downloadUrl",
    "result.base64",
    "result.data",
    "data.file",
    "data.fileURL",
    "data.fileUrl",
    "data.url",
    "data.mediaUrl",
    "data.downloadUrl",
    "data.base64",
    "Data.file",
    "Data.fileURL",
    "Data.fileUrl",
    "Data.url",
    "Data.mediaUrl",
    "Data.downloadUrl",
    "Data.base64",
  ]);
  if (!value) return null;
  return isUrl(value) || isProvavelBase64(value) ? value : null;
}

async function baixarMidiaDaMensagem(
  payload: unknown,
): Promise<{ ok: true; mediaUrl: string; tipo: string | null; docName: string | null } | { ok: false; error: string }> {
  const baseUrl = (process.env["UAZAPI_URL"] ?? "").replace(/\/+$/, "");
  const token = process.env["UAZAPI_TOKEN"];
  if (!baseUrl || !token) {
    return { ok: false, error: "Credenciais da uazapi não configuradas para baixar mídia" };
  }

  try {
    const res = await fetch(`${baseUrl}/message/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", token },
      body: JSON.stringify(payloadParaDownload(payload)),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: `Erro ao baixar mídia: HTTP ${res.status}: ${detail.slice(0, 180)}` };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("json")) {
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0) return { ok: false, error: "Baixar mídia retornou arquivo vazio" };
      const mime = contentType || "application/octet-stream";
      return {
        ok: true,
        mediaUrl: `data:${mime};base64,${bytes.toString("base64")}`,
        tipo: detectarTipo({ mimetype: mime }),
        docName: null,
      };
    }

    const data: unknown = await res.json();
    const mediaUrl = pickMediaBaixada(data);
    if (!mediaUrl) return { ok: false, error: "Baixar mídia não retornou arquivo utilizável" };
    const tipo = detectarTipo(data);
    const docName = pickStr(data, ["docName", "fileName", "filename", "name", "data.docName", "data.fileName", "Data.FileName"]);
    return { ok: true, mediaUrl, tipo: tipo === "text" ? null : tipo, docName };
  } catch {
    return { ok: false, error: "Falha de rede ao baixar mídia na uazapi" };
  }
}

export type MensagemNormalizada = {
  sender: string | null;
  senderPhone: string | null;
  senderName: string | null;
  sourceChatId: string | null;
  sourceGroupName: string | null;
  tipo: string;
  text: string | null;
  mediaUrl: string | null;
  docName: string | null;
  externalId: string | null;
};

export function normalizarMensagem(payload: unknown): MensagemNormalizada {
  const normalizado = unwrapMensagemPayload(payload);
  const tipoDetectado = detectarTipo(normalizado);
  const mediaUrlBruto = pickStr(normalizado, [
    "file",
    "message.file",
    "fileURL",
    "message.fileURL",
    "mediaUrl",
    "message.mediaUrl",
    "url",
    "message.url",
    "downloadUrl",
    "message.downloadUrl",
    "content",
    "message.content",
    "body.file",
    "body.message.file",
    "body.fileURL",
    "body.message.fileURL",
    "body.mediaUrl",
    "body.message.mediaUrl",
    "body.url",
    "body.message.url",
    "body.downloadUrl",
    "body.message.downloadUrl",
    "body.content",
    "body.message.content",
  ]);
  const mediaUrl = isUrl(mediaUrlBruto) ? mediaUrlBruto : null;

  let text = pickMessageText(normalizado, [
    "text",
    "message.text",
    "Message.text",
    "Data.text",
    "Data.Message.text",
    "Data.Message.conversation",
    "Data.Message.extendedTextMessage.text",
    "Data.Message.imageMessage.caption",
    "Data.Message.videoMessage.caption",
    "Data.Message.documentMessage.caption",
    "data.Message.conversation",
    "data.message.conversation",
    "caption",
    "message.caption",
    "Message.caption",
    "body",
    "message.body",
    "Message.body",
    "body.text",
    "body.message.text",
    "body.Data.Message.conversation",
    "body.Data.Message.extendedTextMessage.text",
    "body.Data.Message.imageMessage.caption",
    "body.Data.Message.videoMessage.caption",
    "body.Data.Message.documentMessage.caption",
    "body.caption",
    "body.message.caption",
    "body.body",
    "body.message.body",
    "body.conteudo",
    "conteudo",
  ]);
  if (!text) {
    const content = pickStr(normalizado, ["content", "message.content", "body.content", "body.message.content"]);
    if (content && !isUrl(content)) text = content;
  }

  const tipo = mediaUrl ? (tipoDetectado === "text" ? "image" : tipoDetectado) : tipoDetectado;

  const senderJid = pickSenderJid(normalizado, [
    "participant",
    "key.participant",
    "message.key.participant",
    "Message.key.participant",
    "Data.key.participant",
    "Data.Key.participant",
    "Data.Key.Participant",
    "Data.Info.Sender",
    "Data.Info.MessageSource.Sender",
    "Data.Info.Source.Sender",
    "event.Data.Info.Sender",
    "event.Info.Sender",
    "senderJid",
    "sender",
    "message.sender",
    "body.sender",
    "body.message.sender",
    "from",
    "body.from",
    "body.message.from",
  ]);
  const senderPhone = pickSenderPhone(normalizado, [
    "sender_pn",
    "message.sender_pn",
    "body.sender_pn",
    "body.message.sender_pn",
    "senderPhone",
    "phone",
    "number",
    "Data.Info.Sender.User",
    "Data.Info.MessageSource.Sender.User",
    "Data.Info.Source.Sender.User",
    "Data.Key.participant",
    "Data.Key.Participant",
    "participant",
    "key.participant",
    "message.key.participant",
    "from",
    "body.from",
    "body.senderPhone",
    "body.phone",
    "body.number",
    "data.sender_pn",
    "data.message.sender_pn",
    "data.senderPhone",
    "data.phone",
    "data.number",
    "data.Data.Info.Sender.User",
    "data.Data.Info.MessageSource.Sender.User",
    "data.Data.Info.Source.Sender.User",
    "data.Data.Key.participant",
    "data.Data.Key.Participant",
    "data.participant",
    "data.key.participant",
    "data.message.key.participant",
    "data.from",
    "data.message.from",
  ]);
  const senderNome = pickStr(normalizado, [

    "senderName",
    "message.senderName",
    "body.senderName",
    "body.message.senderName",
    "pushName",
    "message.pushName",
    "body.pushName",
    "body.message.pushName",
    "notifyName",
    "message.notifyName",
    "Data.PushName",
    "Data.Info.PushName",
    "Data.Info.SenderName",
    "Data.Info.ParticipantName",
    "data.senderName",
    "data.message.senderName",
    "data.pushName",
    "data.message.pushName",
    "data.notifyName",
    "data.Data.PushName",
    "data.Data.Info.PushName",
    "data.Data.Info.SenderName",
    "data.Data.Info.ParticipantName",
  ]) ?? pickSenderNomeDeep(payload) ?? pickSenderNomeDeep(normalizado);


  return {
    sender: senderNome ?? senderJid ?? null,
    senderPhone: senderPhone ?? extrairTelefone(senderJid),
    senderName: senderNome,

    sourceChatId: pickGroupJid(normalizado, [
      "chatid",
      "chatId",
      "ChatID",
      "chat.wa_chatid",
      "body.chat.wa_chatid",
      "message.chatid",
      "message.chatId",
      "message.chat_id",
      "Message.chatid",
      "Message.chatId",
      "body.chatid",
      "body.chatId",
      "body.ChatID",
      "body.message.chatid",
      "body.message.chatId",
      "body.message.chat_id",
      "data.chatid",
      "data.chatId",
      "data.ChatID",
      "data.chat.wa_chatid",
      "data.message.chatid",
      "data.message.chatId",
      "data.message.chat_id",
      "data.Message.chatid",
      "data.Message.chatId",
      "data.groupJid",
      "data.group_id",
      "data.remoteJid",
      "data.message.remoteJid",
      "data.key.remoteJid",
      "data.message.key.remoteJid",
      "data.Message.key.remoteJid",
      "data.Data.key.remoteJid",
      "data.Data.Key.remoteJid",
      "data.Data.Key.RemoteJid",
      "data.Data.Info.Chat",
      "data.Data.Info.MessageSource.Chat",
      "data.Data.Info.Source.Chat",
      "groupJid",
      "group_id",
      "remoteJid",
      "message.remoteJid",
      "key.remoteJid",
      "message.key.remoteJid",
      "Message.key.remoteJid",
      "Data.key.remoteJid",
      "Data.Key.remoteJid",
      "Data.Key.RemoteJid",
      "Data.Info.Chat",
      "Data.Info.MessageSource.Chat",
      "Data.Info.Source.Chat",
      "event.Data.Info.Chat",
      "event.Info.Chat",
    ]),
    sourceGroupName: pickStr(normalizado, [
      "chatName",
      "chat.name",
      "chat.wa_name",
      "message.chatName",
      "body.chatName",
      "body.chat.name",
      "body.chat.wa_name",
      "body.message.chatName",
      "groupName",
      "group_name",
      "body.groupName",
      "body.group_name",
      "body.message.groupName",
      "body.message.group_name",
      "data.chatName",
      "data.chat.name",
      "data.chat.wa_name",
      "data.message.chatName",
      "data.groupName",
      "data.group_name",
      "data.message.groupName",
      "data.message.group_name",
      "grupo",
    ]),
    tipo,
    text: text ? text.slice(0, 4000) : null,
    mediaUrl,
    docName: pickStr(normalizado, ["docName", "message.docName", "fileName", "message.fileName", "body.docName", "body.message.docName", "body.fileName", "body.message.fileName"]),
    externalId: pickStr(normalizado, ["messageid", "messageId", "message.messageid", "message.id", "id", "body.messageid", "body.messageId", "body.message.messageid", "body.message.id"]),
  };
}

export type EnfileirarResult = {
  ok: true;
  lote_id: string | null;
  novo_lote: boolean;
  duplicado: boolean;
  itens: number;
  ignorado?: boolean;
  motivo?: string | undefined;
  categoria_origem?: string | null;
  source_chat_id?: string | null;
  source_group_name?: string | null;

};

/** Triagem: só entra na fila quem vem de grupo com rota ativa (ex: frete_fechado, venda_fechado). */
async function triarOrigem(
  supabaseAdmin: any,
  sourceChatId: string | null,
  sourceGroupName: string | null,
): Promise<{ permitido: boolean; categoria: string | null; groupName: string | null; motivo?: string }> {
  if (!sourceChatId) {
    return { permitido: false, categoria: null, groupName: null, motivo: "Sem grupo de origem" };
  }

  const { data: origem } = await supabaseAdmin
    .from("wa_groups")
    .select("categoria, group_name, ativo")
    .eq("chat_id", sourceChatId)
    .maybeSingle();

  // Grupo desconhecido: cadastra como "indefinido" para aparecer no Kanban, mas não posta.
  if (!origem) {
    await supabaseAdmin
      .from("wa_groups")
      .upsert(
        {
          chat_id: sourceChatId,
          group_name: sourceGroupName,
          categoria: "indefinido",
          ativo: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "chat_id" },
      );
    return {
      permitido: false,
      categoria: "indefinido",
      groupName: sourceGroupName,
      motivo: "Grupo novo cadastrado como indefinido (sem rota)",
    };
  }

  await supabaseAdmin
    .from("wa_groups")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("chat_id", sourceChatId);

  const categoria = origem.categoria ?? null;
  const groupName = origem.group_name ?? sourceGroupName;

  if (origem.ativo === false) {
    return { permitido: false, categoria, groupName, motivo: "Grupo inativo" };
  }

  const { data: rotas } = await supabaseAdmin
    .from("rotas_postagem")
    .select("id")
    .eq("ativo", true)
    .eq("categoria_origem", categoria ?? "")
    .limit(1);

  if (!rotas || rotas.length === 0) {
    return {
      permitido: false,
      categoria,
      groupName,
      motivo: `Categoria "${categoria ?? "indefinido"}" sem rota de postagem ativa`,
    };
  }

  return { permitido: true, categoria, groupName };
}

/** Guarda a mensagem no pacote aberto do mesmo remetente/grupo (ou cria um novo). */
export async function enfileirarMensagem(payload: unknown): Promise<EnfileirarResult | { ok: false; error: string }> {
  const payloadNormalizado = unwrapMensagemPayload(payload);
  const msg = normalizarMensagem(payloadNormalizado);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1) Triagem ANTES de baixar mídia: evita trabalho e flood de grupos que não repostam.
  const triagem = await triarOrigem(supabaseAdmin, msg.sourceChatId, msg.sourceGroupName);
  if (!triagem.permitido) {
    return {
      ok: true,
      lote_id: null,
      novo_lote: false,
      duplicado: false,
      itens: 0,
      ignorado: true,
      motivo: triagem.motivo,
      categoria_origem: triagem.categoria,
      source_chat_id: msg.sourceChatId,
      source_group_name: msg.sourceGroupName,
    };
  }
  if (triagem.groupName) msg.sourceGroupName = triagem.groupName;

  if (!msg.mediaUrl && msg.tipo !== "text") {
    const baixada = await baixarMidiaDaMensagem(payloadNormalizado);
    if (!baixada.ok) return { ok: false, error: baixada.error };
    msg.mediaUrl = baixada.mediaUrl;
    msg.tipo = baixada.tipo ?? msg.tipo;
    msg.docName = msg.docName ?? baixada.docName;
  }
  if (!msg.text && !msg.mediaUrl) {
    return { ok: false, error: "Mensagem sem texto nem mídia" };
  }


  if (msg.externalId) {
    const { data: dup } = await supabaseAdmin
      .from("fila_itens")
      .select("id, lote_id")
      .eq("external_id", msg.externalId)
      .maybeSingle();
    if (dup) {
      return {
        ok: true,
        lote_id: dup.lote_id,
        novo_lote: false,
        duplicado: true,
        itens: 0,
        categoria_origem: triagem.categoria,
        source_chat_id: msg.sourceChatId,
        source_group_name: msg.sourceGroupName,
      };
    }
  }

  const fechaEm = new Date(Date.now() + JANELA_SEGUNDOS * 1000).toISOString();

  // Pacote aberto = mesmo remetente + mesmo grupo de origem, ainda aguardando.
  let query = supabaseAdmin
    .from("fila_lotes")
    .select("id, itens_count")
    .eq("status", "aguardando")
    .order("created_at", { ascending: false })
    .limit(1);
  query = msg.sender ? query.eq("sender", msg.sender) : query.is("sender", null);
  query = msg.sourceChatId
    ? query.eq("source_chat_id", msg.sourceChatId)
    : query.is("source_chat_id", null);

  const { data: abertos, error: selErr } = await query;
  if (selErr) return { ok: false, error: selErr.message };

  let loteId = abertos?.[0]?.id ?? null;
  let ordem = abertos?.[0]?.itens_count ?? 0;
  const novoLote = !loteId;

  if (!loteId) {
    const categoriaOrigem = triagem.categoria;


    const { data: criado, error } = await supabaseAdmin
      .from("fila_lotes")
      .insert({
        sender: msg.sender,
        sender_phone: msg.senderPhone,
        sender_name: msg.senderName,

        source_chat_id: msg.sourceChatId,
        source_group_name: msg.sourceGroupName,
        categoria_origem: categoriaOrigem,
        status: "aguardando",
        fecha_em: fechaEm,
      })
      .select("id")
      .single();
    if (error || !criado) return { ok: false, error: error?.message ?? "Falha ao criar lote" };
    loteId = criado.id;
    ordem = 0;
  }


  const { error: itemErr } = await supabaseAdmin.from("fila_itens").insert({
    lote_id: loteId,
    ordem,
    tipo: msg.tipo,
    text: msg.text,
    media_url: msg.mediaUrl,
    doc_name: msg.docName,
    external_id: msg.externalId,
  });
  if (itemErr) return { ok: false, error: itemErr.message };

  const itens = ordem + 1;
  const { error: updErr } = await supabaseAdmin
    .from("fila_lotes")
    .update({
      itens_count: itens,
      fecha_em: fechaEm,
      ...(msg.senderPhone ? { sender_phone: msg.senderPhone } : {}),
      ...(msg.senderName ? { sender_name: msg.senderName } : {}),
    })

    .eq("id", loteId);
  if (updErr) return { ok: false, error: updErr.message };

  return {
    ok: true,
    lote_id: loteId,
    novo_lote: novoLote,
    duplicado: false,
    itens,
    categoria_origem: triagem.categoria,
    source_chat_id: msg.sourceChatId,
    source_group_name: msg.sourceGroupName,
  };
}

type Grupo = {
  chat_id: string;
  group_name: string | null;
  cabecalho?: string | null;
  enviar_contato?: boolean;
};

/** Envia um texto simples (usado no cabeçalho de cada frete/caminhão). */
async function enviarTexto(
  baseUrl: string,
  token: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", token },
      body: JSON.stringify({ number: chatId, text }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${detail.slice(0, 160)}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Falha de rede ao enviar cabeçalho" };
  }
}

/** Envia o contato (vCard) de quem originou a mensagem. */
async function enviarContato(
  baseUrl: string,
  token: string,
  chatId: string,
  phone: string,
  fullName: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/send/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", token },
      body: JSON.stringify({
        number: chatId,
        fullName,
        phoneNumber: phone,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${detail.slice(0, 160)}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Falha de rede ao enviar contato" };
  }
}


async function enviarItem(
  baseUrl: string,
  token: string,
  grupo: Grupo,
  item: { tipo: string; text: string | null; media_url: string | null; doc_name: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const hasMedia = Boolean(item.media_url);
  const endpoint = hasMedia ? `${baseUrl}/send/media` : `${baseUrl}/send/text`;
  const body: Record<string, unknown> = hasMedia
    ? {
        number: grupo.chat_id,
        type: item.tipo === "text" ? "image" : item.tipo,
        file: item.media_url,
        ...(item.text ? { text: item.text } : {}),
        ...(item.doc_name ? { docName: item.doc_name } : {}),
      }
    : { number: grupo.chat_id, text: item.text ?? "" };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", token },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${detail.slice(0, 160)}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Falha de rede ao contatar a uazapi" };
  }
}

/**
 * Processa a fila: fecha as janelas vencidas e envia UM lote por execução,
 * na ordem de chegada, item por item, grupo por grupo.
 */
export async function processarFila(maxLotes = 1) {
  const baseUrl = (process.env["UAZAPI_URL"] ?? "").replace(/\/+$/, "");
  const token = process.env["UAZAPI_TOKEN"];
  if (!baseUrl || !token) {
    return { ok: false as const, error: "Credenciais da uazapi não configuradas" };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();

  // 1. Janelas vencidas passam para "pronto".
  await supabaseAdmin
    .from("fila_lotes")
    .update({ status: "pronto" })
    .eq("status", "aguardando")
    .lte("fecha_em", nowIso);

  // 2. Nada de paralelismo: se já existe um lote enviando, sai.
  const { data: emAndamento } = await supabaseAdmin
    .from("fila_lotes")
    .select("id")
    .eq("status", "enviando")
    .limit(1);
  if (emAndamento && emAndamento.length > 0) {
    return { ok: true as const, processados: 0, motivo: "já existe um lote em envio" };
  }

  // Destino padrão: todos os grupos ativos de "Aberto postável".
  const { data: grupos, error: gruposErr } = await supabaseAdmin
    .from("wa_groups")
    .select("chat_id, group_name")
    .eq("categoria", "aberto_postavel")
    .eq("ativo", true);
  if (gruposErr) return { ok: false as const, error: gruposErr.message };

  // Rotas por categoria de origem (ex: frete_fechado -> Fretes br).
  const { data: rotas } = await supabaseAdmin
    .from("rotas_postagem")
    .select("categoria_origem, destino_chat_id, destino_nome, cabecalho, enviar_contato")
    .eq("ativo", true);
  const rotaPorCategoria = new Map<string, Grupo[]>();
  for (const rota of rotas ?? []) {
    const lista = rotaPorCategoria.get(rota.categoria_origem) ?? [];
    lista.push({
      chat_id: rota.destino_chat_id,
      group_name: rota.destino_nome,
      cabecalho: rota.cabecalho ?? null,
      enviar_contato: rota.enviar_contato !== false,
    });
    rotaPorCategoria.set(rota.categoria_origem, lista);
  }

  if ((!grupos || grupos.length === 0) && rotaPorCategoria.size === 0) {
    return { ok: true as const, processados: 0, motivo: "nenhum destino configurado" };
  }

  const { data: lotes, error: lotesErr } = await supabaseAdmin
    .from("fila_lotes")
    .select("id, categoria_origem, source_chat_id, sender, sender_name, sender_phone")

    .eq("status", "pronto")
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(maxLotes, 5)));
  if (lotesErr) return { ok: false as const, error: lotesErr.message };
  if (!lotes || lotes.length === 0) {
    return { ok: true as const, processados: 0, motivo: "nada pronto na fila" };
  }

  let processados = 0;
  const detalhes: Array<{ lote_id: string; enviados: number; falhas: number }> = [];

  for (const lote of lotes) {
    // Trava o lote (só quem conseguir sair de "pronto" processa).
    const { data: travado } = await supabaseAdmin
      .from("fila_lotes")
      .update({ status: "enviando" })
      .eq("id", lote.id)
      .eq("status", "pronto")
      .select("id");
    if (!travado || travado.length === 0) continue;

    // Se a categoria de origem não veio no pacote, busca agora pelo chat de origem.
    let categoria = lote.categoria_origem;
    if (!categoria && lote.source_chat_id) {
      const { data: origem } = await supabaseAdmin
        .from("wa_groups")
        .select("categoria")
        .eq("chat_id", lote.source_chat_id)
        .maybeSingle();
      categoria = origem?.categoria ?? null;
      if (categoria) {
        await supabaseAdmin
          .from("fila_lotes")
          .update({ categoria_origem: categoria })
          .eq("id", lote.id);
      }
    }

    // Só posta no destino da rota da categoria de origem (sem fallback "posta em tudo").
    const destinos: Grupo[] = (categoria ? rotaPorCategoria.get(categoria) : undefined) ?? [];


    if (destinos.length === 0) {
      await supabaseAdmin
        .from("fila_lotes")
        .update({
          status: "erro",
          erro: `Sem destino configurado para a origem "${categoria ?? "desconhecida"}"`,
          sent_at: new Date().toISOString(),
        })
        .eq("id", lote.id);
      continue;
    }

    const { data: itens } = await supabaseAdmin
      .from("fila_itens")
      .select("tipo, text, media_url, doc_name")
      .eq("lote_id", lote.id)
      .order("ordem", { ascending: true });

    let enviados = 0;
    let falhas = 0;
    let ultimoErro: string | null = null;

    for (const grupo of destinos) {
      // 1) Cabeçalho separando cada frete/caminhão.
      if (grupo.cabecalho && grupo.cabecalho.trim()) {
        const cab = await enviarTexto(baseUrl, token, grupo.chat_id, grupo.cabecalho.trim());
        if (!cab.ok) {
          falhas += 1;
          ultimoErro = cab.error ?? "erro no cabeçalho";
        }
        await new Promise((r) => setTimeout(r, DELAY_ENTRE_ITENS));
      }

      // 2) Mensagens encaminhadas, na ordem.
      for (const item of itens ?? []) {
        const res = await enviarItem(baseUrl, token, grupo, item);
        if (res.ok) enviados += 1;
        else {
          falhas += 1;
          ultimoErro = res.error ?? "erro desconhecido";
        }
        await new Promise((r) => setTimeout(r, DELAY_ENTRE_ITENS));
      }

      // 3) Contato (vCard) de quem enviou.
      if (grupo.enviar_contato !== false && lote.sender_phone) {
        const contato = await enviarContato(
          baseUrl,
          token,
          grupo.chat_id,
          lote.sender_phone,
          lote.sender_name ?? lote.sender ?? lote.sender_phone,
        );
        if (!contato.ok) {
          falhas += 1;
          ultimoErro = contato.error ?? "erro no contato";
        }
        await new Promise((r) => setTimeout(r, DELAY_ENTRE_ITENS));
      }

      await new Promise((r) => setTimeout(r, DELAY_ENTRE_GRUPOS));
    }



    await supabaseAdmin
      .from("fila_lotes")
      .update({
        status: falhas > 0 && enviados === 0 ? "erro" : "enviado",
        enviados,
        falhas,
        erro: ultimoErro,
        sent_at: new Date().toISOString(),
      })
      .eq("id", lote.id);

    processados += 1;
    detalhes.push({ lote_id: lote.id, enviados, falhas });
  }

  return { ok: true as const, processados, grupos: grupos?.length ?? 0, detalhes };
}
