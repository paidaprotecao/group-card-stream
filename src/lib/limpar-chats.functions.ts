import { createServerFn } from "@tanstack/react-start";

export const limparChatsAgora = createServerFn({ method: "POST" }).handler(async () => {
  const { limparChatsDeGruposAtivos } = await import("./limpar-chats.server");
  return limparChatsDeGruposAtivos();
});
