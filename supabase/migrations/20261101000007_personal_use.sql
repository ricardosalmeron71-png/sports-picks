-- Uso personal: cuidar la cuota gratuita de The Odds API (500 consultas/mes).
-- Los momios de ESPN/DraftKings siguen llegando gratis con sync-schedule cada 3 h.
select cron.schedule('sync-odds', '17 14,22 * * *',   -- 7:17 am y 3:17 pm (UTC-7)
  $$ select public.call_edge_function('sync-odds') $$);
