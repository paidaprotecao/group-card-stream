import { createServerFn } from "@tanstack/react-start";

/** Roda a fila manualmente (mesma lógica do cron). */
export const processarFilaAgora = createServerFn({ method: "POST" }).handler(async () => {
  const { processarFila } = await import("@/lib/fila.server");
  return processarFila();
});

/** Força um lote a entrar na fila agora, sem esperar a janela fechar. */
export const liberarLote = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("id obrigatório");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("fila_lotes")
      .update({ status: "pronto", fecha_em: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "aguardando");
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Cancela um lote que ainda não foi enviado. */
export const cancelarLote = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("id obrigatório");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("fila_lotes")
      .update({ status: "cancelado" })
      .eq("id", data.id)
      .in("status", ["aguardando", "pronto", "erro"]);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Reenvia um lote com erro / já enviado. */
export const reenviarLote = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("id obrigatório");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("fila_lotes")
      .update({ status: "pronto", enviados: 0, falhas: 0, erro: null, sent_at: null })
      .eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
