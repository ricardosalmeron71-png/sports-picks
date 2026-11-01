-- Crear grupo: el INSERT ... RETURNING de la app necesita poder leer la fila recién creada,
-- pero la membresía del creador se agrega por trigger después. El dueño siempre puede ver su grupo.
drop policy if exists "ver mis grupos o publicos" on public.groups;
create policy "ver mis grupos o publicos" on public.groups for select to authenticated
  using (is_public or owner_id = auth.uid() or is_group_member(id));
