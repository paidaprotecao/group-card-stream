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
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
      "message.messageType",
      "type",
      "message.type",
      "mediaType",
      "message.mediaType",
      "mimetype",
      "message.mimetype",
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
  return get(payload, "message") ?? get(payload, "body.message") ?? payload;
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
  sourceChatId: string | null;
  sourceGroupName: string | null;
  tipo: string;
  text: string | null;
  mediaUrl: string | null;
  docName: string | null;
  externalId: string | null;
};

export function normalizarMensagem(payload: unknown): MensagemNormalizada {
  const tipoDetectado = detectarTipo(payload);
  const mediaUrlBruto = pickStr(payload, [
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
  ]);
  const mediaUrl = isUrl(mediaUrlBruto) ? mediaUrlBruto : null;

  let text = pickStr(payload, [
    "text",
    "message.text",
    "caption",
    "message.caption",
    "body",
    "message.body",
    "conteudo",
  ]);
  if (!text) {
    const content = pickStr(payload, ["content", "message.content"]);
    if (content && !isUrl(content)) text = content;
  }

  const tipo = mediaUrl ? (tipoDetectado === "text" ? "image" : tipoDetectado) : tipoDetectado;

  return {
    sender:
      pickStr(payload, [
        "sender",
        "message.sender",
        "senderName",
        "message.senderName",
        "participant",
        "from",
      ]) ?? null,
    sourceChatId: pickStr(payload, [
      "chatid",
      "chatId",
      "message.chatid",
      "message.chatId",
      "groupJid",
      "group_id",
    ]),
    sourceGroupName: pickStr(payload, [
      "chatName",
      "message.chatName",
      "groupName",
      "group_name",
      "grupo",
    ]),
    tipo,
    text: text ? text.slice(0, 4000) : null,
    mediaUrl,
    docName: pickStr(payload, ["docName", "message.docName", "fileName", "message.fileName"]),
    externalId: pickStr(payload, ["messageid", "messageId", "message.messageid", "message.id", "id"]),
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
  const msg = normalizarMensagem(payload);

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
    };
  }
  if (triagem.groupName) msg.sourceGroupName = triagem.groupName;

  if (!msg.mediaUrl && msg.tipo !== "text") {
    const baixada = await baixarMidiaDaMensagem(payload);
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
      return { ok: true, lote_id: dup.lote_id, novo_lote: false, duplicado: true, itens: 0 };
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
    .update({ itens_count: itens, fecha_em: fechaEm })
    .eq("id", loteId);
  if (updErr) return { ok: false, error: updErr.message };

  return { ok: true, lote_id: loteId, novo_lote: novoLote, duplicado: false, itens };
}

type Grupo = { chat_id: string; group_name: string | null };

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
    .select("categoria_origem, destino_chat_id, destino_nome")
    .eq("ativo", true);
  const rotaPorCategoria = new Map<string, Grupo[]>();
  for (const rota of rotas ?? []) {
    const lista = rotaPorCategoria.get(rota.categoria_origem) ?? [];
    lista.push({ chat_id: rota.destino_chat_id, group_name: rota.destino_nome });
    rotaPorCategoria.set(rota.categoria_origem, lista);
  }

  if ((!grupos || grupos.length === 0) && rotaPorCategoria.size === 0) {
    return { ok: true as const, processados: 0, motivo: "nenhum destino configurado" };
  }

  const { data: lotes, error: lotesErr } = await supabaseAdmin
    .from("fila_lotes")
    .select("id, categoria_origem, source_chat_id")
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
      for (const item of itens ?? []) {
        const res = await enviarItem(baseUrl, token, grupo, item);
        if (res.ok) enviados += 1;
        else {
          falhas += 1;
          ultimoErro = res.error ?? "erro desconhecido";
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
