CREATE TABLE IF NOT EXISTS public.webhook_debug (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hook text NOT NULL,
  payload jsonb,
  resumo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.webhook_debug TO authenticated;
GRANT ALL ON public.webhook_debug TO service_role;
ALTER TABLE public.webhook_debug ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth can read webhook debug" ON public.webhook_debug FOR SELECT TO authenticated USING (true);