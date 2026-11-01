-- Los picks son definitivos: una vez guardados no se pueden cambiar ni borrar
-- (evita cambiar el pick viendo cómo va el juego o lo que eligieron los demás).
drop policy if exists "editar mi pick" on public.picks;
drop policy if exists "borrar mi pick antes del juego" on public.picks;
revoke update, delete on public.picks from anon, authenticated;
