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
  return "text";
}

function isUrl(value: string | null): boolean {
  return Boolean(value && /^(https?:\/\/|data:)/i.test(value));
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

  const tipo = mediaUrl ? (tipoDetectado === "text" ? "image" : tipoDetectado) : "text";

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
  lote_id: string;
  novo_lote: boolean;
  duplicado: boolean;
  itens: number;
};

/** Guarda a mensagem no pacote aberto do mesmo remetente/grupo (ou cria um novo). */
export async function enfileirarMensagem(payload: unknown): Promise<EnfileirarResult | { ok: false; error: string }> {
  const msg = normalizarMensagem(payload);
  if (!msg.text && !msg.mediaUrl) {
    return { ok: false, error: "Mensagem sem texto nem mídia" };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
    // Descobre a categoria do grupo de origem (define para onde o pacote vai).
    let categoriaOrigem: string | null = null;
    if (msg.sourceChatId) {
      const { data: origem } = await supabaseAdmin
        .from("wa_groups")
        .select("categoria, group_name")
        .eq("chat_id", msg.sourceChatId)
        .maybeSingle();
      categoriaOrigem = origem?.categoria ?? null;
      if (!msg.sourceGroupName && origem?.group_name) msg.sourceGroupName = origem.group_name;
    }

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

    const destinos: Grupo[] =
      (categoria ? rotaPorCategoria.get(categoria) : undefined) ?? (grupos ?? []);

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
