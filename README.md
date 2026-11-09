# WhatsApp Group Board

Quero um app de gestão de grupos do WhatsApp, estilo Kanban.

Tabela no Supabase: wa_groups
- id (uuid, pk, default gen_random_uuid())
- chat_id (text, unique, not null) — ex: "120363422987854683@g.us"
- group_name (text)
- categoria (text, not null, default 'indefinido') — valores possíveis:
  'frete_fechado', 'venda_fechado', 'aberto_postavel', 'aberto_bloqueado', 'indefinido'
- ativo (boolean, not null, default true)
- last_seen_at (timestamptz)
- created_at (timestamptz, default now())

Tela única em Kanban:
- 5 colunas, uma para cada valor de categoria (indefinido, frete_fechado, venda_fechado, aberto_postavel, aberto_bloqueado)
- cada card mostra group_name e chat_id, com um toggle "ativo"
- arrastar um card entre colunas atualiza o campo categoria no banco
- desligar o toggle atualiza ativo = false (sem deletar a linha)
- lista ordenada por last_seen_at (mais recente primeiro)
- realtime: quando o n8n inserir uma linha nova (grupo desconhecido chegando), ela deve aparecer na coluna "indefinido" sem precisar dar refresh (Supabase Realtime)

Preciso também que a Supabase connection string / URL + anon/service key deste projeto fiquem visíveis para eu configurar uma credential externa no n8n.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://group-card-stream.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/091b67d1-9c2a-452d-a16a-cfda681b16ed).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
