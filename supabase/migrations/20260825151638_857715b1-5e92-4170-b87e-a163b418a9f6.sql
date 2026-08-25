ALTER TABLE public.rotas_postagem
  ADD COLUMN IF NOT EXISTS cabecalho text,
  ADD COLUMN IF NOT EXISTS enviar_contato boolean NOT NULL DEFAULT true;

ALTER TABLE public.fila_lotes
  ADD COLUMN IF NOT EXISTS sender_phone text,
  ADD COLUMN IF NOT EXISTS sender_name text;

UPDATE public.rotas_postagem SET cabecalho = '🚛👇   FRETE disponível   👇🚛' WHERE categoria_origem = 'frete_fechado' AND cabecalho IS NULL;
UPDATE public.rotas_postagem SET cabecalho = '🚛 Caminhão a venda🚛👇' WHERE categoria_origem = 'venda_fechado' AND cabecalho IS NULL;

SELECT cron.unschedule(2);
SELECT cron.schedule(
  'processar-fila-app',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://project--091b67d1-9c2a-452d-a16a-cfda681b16ed-dev.lovable.app/api/public/hooks/processar-fila',
    headers:='{"Content-Type": "application/json", "apikey": "sb_publishable_IEwIKvXiaWsBfMqDK4fElw_TeJZ5W1F"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);