SELECT cron.unschedule('processar-fila-app');

SELECT cron.schedule(
  'processar-fila-app',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://group-card-stream.lovable.app/api/public/hooks/processar-fila',
    headers:='{"Content-Type": "application/json", "apikey": "sb_publishable_IEwIKvXiaWsBfMqDK4fElw_TeJZ5W1F"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);