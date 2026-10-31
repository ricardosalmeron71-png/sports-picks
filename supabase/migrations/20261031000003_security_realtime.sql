-- =====================================================================
--  Seguridad (Row Level Security) + Realtime
-- =====================================================================

-- Datos deportivos: lectura pública, escritura solo service_role (Edge Functions)
do $$
declare t text;
begin
  foreach t in array array['leagues','venues','teams','athletes','events','competitions','competitors',
                           'odds','odds_history','standings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s lectura publica" on public.%I for select to anon, authenticated using (true)', t, t);
  end loop;
end $$;

alter table public.sync_runs enable row level security;  -- sin políticas: solo service_role

-- Perfiles
alter table public.profiles enable row level security;
create policy "perfiles visibles" on public.profiles for select to authenticated using (true);
create policy "editar mi perfil" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Favoritos
alter table public.favorites enable row level security;
create policy "mis favoritos" on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tokens push
alter table public.push_tokens enable row level security;
create policy "mis tokens" on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Notificaciones (bandeja)
alter table public.notifications enable row level security;
create policy "mis notificaciones" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "marcar leidas" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Grupos
alter table public.groups enable row level security;
create policy "ver mis grupos o publicos" on public.groups for select to authenticated
  using (is_public or is_group_member(id));
create policy "crear grupo" on public.groups for insert to authenticated with check (owner_id = auth.uid());
create policy "admin edita grupo" on public.groups for update to authenticated
  using (is_group_admin(id)) with check (is_group_admin(id));
create policy "owner borra grupo" on public.groups for delete to authenticated using (owner_id = auth.uid());

-- Miembros
alter table public.group_members enable row level security;
create policy "ver miembros de mis grupos" on public.group_members for select to authenticated
  using (is_group_member(group_id));
create policy "unirse a grupo publico" on public.group_members for insert to authenticated
  with check (user_id = auth.uid() and role = 'member'
              and exists (select 1 from groups g where g.id = group_id and g.is_public));
create policy "salir o expulsar" on public.group_members for delete to authenticated
  using ((user_id = auth.uid() and role <> 'owner') or (is_group_admin(group_id) and role <> 'owner'));
create policy "admin cambia roles" on public.group_members for update to authenticated
  using (is_group_admin(group_id)) with check (is_group_admin(group_id) and role <> 'owner');

-- Picks: los de los demás se ven hasta que inicia el juego (anti-copia)
alter table public.picks enable row level security;
create policy "ver picks" on public.picks for select to authenticated
  using (user_id = auth.uid() or (is_group_member(group_id) and competition_started(competition_id)));
create policy "crear mi pick" on public.picks for insert to authenticated
  with check (user_id = auth.uid() and is_group_member(group_id));
create policy "editar mi pick" on public.picks for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Defensa en profundidad: el cliente solo puede escribir las columnas de su selección
revoke insert, update on public.picks from anon, authenticated;
grant insert (group_id, user_id, competition_id, pick_type, selection_competitor_id, selection_value, line, odds_price, confidence)
  on public.picks to authenticated;
grant update (selection_competitor_id, selection_value, line, odds_price, confidence) on public.picks to authenticated;
create policy "borrar mi pick antes del juego" on public.picks for delete to authenticated
  using (user_id = auth.uid() and not competition_started(competition_id));

-- Chat del grupo
alter table public.group_messages enable row level security;
create policy "leer chat" on public.group_messages for select to authenticated using (is_group_member(group_id));
create policy "escribir chat" on public.group_messages for insert to authenticated
  with check (user_id = auth.uid() and is_group_member(group_id));

-- Funciones internas: no exponer a clientes
revoke execute on function public.grade_competition(uuid) from public, anon, authenticated;
revoke execute on function public.enqueue_notification(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.competition_audience(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Realtime: la app se suscribe a estos cambios (marcadores en vivo,
-- momios, picks del grupo, chat y bandeja de notificaciones)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.events, public.competitions, public.competitors, public.odds,
  public.picks, public.group_messages, public.notifications;

-- Para recibir el registro completo en UPDATE
alter table public.competitions replica identity full;
alter table public.competitors replica identity full;
