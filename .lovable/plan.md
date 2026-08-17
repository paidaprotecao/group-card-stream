# Kanban de Grupos do WhatsApp

Tela única em Kanban para classificar e ativar/desativar grupos de WhatsApp, com atualização em tempo real quando o n8n inserir novos grupos.

## Backend (Lovable Cloud)

Tabela `wa_groups` exatamente com os campos pedidos: `id`, `chat_id` (único), `group_name`, `categoria` (default `indefinido`), `ativo` (default true), `last_seen_at`, `created_at`.

- Acesso aberto sem login: leitura e atualização liberadas para visitantes; inserção feita pelo n8n com a chave de serviço.
- Realtime ativado na tabela (`REPLICA IDENTITY FULL` + publicação), para que novas linhas apareçam sem refresh.
- Alguns grupos de exemplo inseridos para a tela já nascer preenchida.

## Tela do Kanban (rota `/`)

- 5 colunas fixas na ordem: Indefinido, Frete (fechado), Venda (fechado), Aberto postável, Aberto bloqueado — cada uma com contador.
- Card: nome do grupo (ou "Sem nome"), `chat_id` em fonte monoespaçada e truncado, e um toggle "ativo".
- Arrastar o card para outra coluna grava a nova `categoria` no banco na hora; se falhar, o card volta e aparece um aviso.
- Toggle desligado grava `ativo = false` (a linha nunca é apagada); cards inativos continuam na coluna, esmaecidos.
- Ordenação dentro da coluna: `last_seen_at` mais recente primeiro (sem data vai para o fim).
- Realtime: INSERT, UPDATE e DELETE refletem na tela automaticamente, inclusive novos grupos caindo em "Indefinido".
- Estados de carregando, coluna vazia e erro tratados; layout com scroll horizontal no mobile.

## Página de credenciais para o n8n (rota `/integracao`)

Lista com botão de copiar para: URL do projeto, `chat_id` de exemplo, endpoint REST de insert (`/rest/v1/wa_groups`) e um exemplo de corpo JSON para o nó HTTP Request do n8n, além da chave pública. A chave de serviço (secreta) não é exibida na página: eu te informo no chat onde encontrá-la nas configurações do projeto, já que publicá-la na tela daria acesso total de escrita a qualquer visitante.

## Detalhes técnicos

- Drag and drop com `@dnd-kit/core` + `@dnd-kit/sortable`.
- Leitura via TanStack Query (`useQuery`) no cliente + canal `postgres_changes` do Supabase atualizando o cache; mutations otimistas para categoria e toggle.
- Design system próprio em `src/styles.css` (paleta verde/grafite inspirada em mensageria, tokens semânticos), sem cores hardcoded.
- `head()` com title/description/OG próprios em cada rota.
