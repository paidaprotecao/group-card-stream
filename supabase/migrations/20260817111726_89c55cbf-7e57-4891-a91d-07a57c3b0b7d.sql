GRANT INSERT ON public.wa_groups TO anon;
CREATE POLICY "wa_groups public insert" ON public.wa_groups FOR INSERT TO anon WITH CHECK (true);