-- Versioned daily objectives: a new effective date never rewrites old periods.
create table public.objectifs_horaires (
 utilisateur_id uuid not null references public.utilisateurs(id),
 date_effet date not null,
 objectif_minutes integer not null check(objectif_minutes between 30 and 960),
 jours integer[] not null default array[1,2,3,4,5] check(cardinality(jours) between 1 and 7 and jours <@ array[1,2,3,4,5,6,7]),
 created_at timestamptz not null default now(),
 primary key(utilisateur_id,date_effet)
);
alter table public.objectifs_horaires enable row level security;
revoke all on public.objectifs_horaires from anon, authenticated, public;
grant select on public.objectifs_horaires to authenticated;
grant select,insert,update on public.objectifs_horaires to service_role;
create policy "lecture objectifs equipe" on public.objectifs_horaires for select to authenticated using (
 exists(select 1 from public.utilisateurs cible join public.utilisateurs lecteur on lecteur.id=(select auth.uid())
 where cible.id=utilisateur_id and lecteur.statut='actif' and lecteur.deleted_at is null and cible.entreprise_id=lecteur.entreprise_id
 and (cible.id=lecteur.id or lecteur.role='admin' or (lecteur.role='manager' and cible.manager_id=lecteur.id)))
);
insert into public.objectifs_horaires(utilisateur_id,date_effet,objectif_minutes)
select id,flexible_depuis,objectif_minutes from public.utilisateurs where mode_pointage='flexible' and flexible_depuis is not null and objectif_minutes is not null and deleted_at is null;
create or replace function revictus_private.initialiser_objectif_flexible()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.mode_pointage='flexible' and new.flexible_depuis is not null and new.objectif_minutes is not null then
  if tg_op='INSERT' or old.mode_pointage<>'flexible' then
   insert into public.objectifs_horaires(utilisateur_id,date_effet,objectif_minutes)
   values(new.id,new.flexible_depuis,new.objectif_minutes) on conflict do nothing;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function revictus_private.initialiser_objectif_flexible() from public,anon,authenticated;
create trigger initialiser_objectif_flexible after insert or update of mode_pointage, objectif_minutes, flexible_depuis on public.utilisateurs for each row execute function revictus_private.initialiser_objectif_flexible();
