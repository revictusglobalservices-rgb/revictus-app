-- Client workspaces and delegated access. Existing tasks remain internal.
create table public.clients (
 id uuid primary key default gen_random_uuid(),
 entreprise_id uuid not null references public.entreprises(id),
 nom text not null check(char_length(trim(nom)) between 1 and 120),
 actif boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index clients_nom_entreprise on public.clients(entreprise_id,lower(nom));
create table public.acces_clients (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id),
 utilisateur_id uuid not null references public.utilisateurs(id),
 accorde_par uuid not null references public.utilisateurs(id),
 origine text not null check(origine in ('admin','manager')),
 date_debut date not null,
 date_fin date,
 revoque_le timestamptz,
 created_at timestamptz not null default now(),
 check(date_fin is null or date_fin>=date_debut),
 check(origine<>'manager' or date_fin is not null)
);
create index acces_clients_utilisateur on public.acces_clients(utilisateur_id,client_id,date_debut);
alter table public.taches add column client_id uuid references public.clients(id), add column service text check(service is null or char_length(service)<=100);
create index taches_client_idx on public.taches(client_id);
alter table public.clients enable row level security;
alter table public.acces_clients enable row level security;
revoke all on public.clients,public.acces_clients from public,anon,authenticated;
grant select on public.clients,public.acces_clients to authenticated;
grant select,insert,update on public.clients,public.acces_clients to service_role;
create function revictus_private.acces_client_pour(p_utilisateur uuid,p_client uuid)
returns boolean language sql stable security definer set search_path='' as $$
select exists(
 select 1 from public.utilisateurs u join public.clients c on c.id=p_client and c.entreprise_id=u.entreprise_id and c.actif
 where u.id=p_utilisateur and u.statut='actif' and u.deleted_at is null
 and (u.role='admin' or exists(
  select 1 from public.acces_clients a where a.client_id=c.id and a.utilisateur_id=u.id and a.revoque_le is null
   and a.date_debut<=(now() at time zone 'Indian/Antananarivo')::date
   and (a.date_fin is null or a.date_fin>=(now() at time zone 'Indian/Antananarivo')::date)
   and (a.origine='admin' or (u.role='collaborateur' and u.manager_id=a.accorde_par and exists(
    select 1 from public.utilisateurs m join public.acces_clients ma on ma.utilisateur_id=m.id and ma.client_id=c.id
    where m.id=a.accorde_par and m.role='manager' and m.statut='actif' and m.deleted_at is null and m.entreprise_id=c.entreprise_id
     and ma.origine='admin' and ma.revoque_le is null and ma.date_debut<=(now() at time zone 'Indian/Antananarivo')::date
     and (ma.date_fin is null or ma.date_fin>=(now() at time zone 'Indian/Antananarivo')::date)
   )))
  ))
);
$$;
revoke all on function revictus_private.acces_client_pour(uuid,uuid) from public,anon,authenticated;
create function revictus_private.client_visible(p_client uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select revictus_private.acces_client_pour(auth.uid(),p_client);
$$;
revoke all on function revictus_private.client_visible(uuid) from public,anon;
grant execute on function revictus_private.client_visible(uuid) to authenticated;
create policy "clients autorises" on public.clients for select to authenticated using (revictus_private.client_visible(id));
create policy "acces clients visibles" on public.acces_clients for select to authenticated using (
 revictus_private.client_visible(client_id) and (utilisateur_id=(select auth.uid()) or public.is_admin() or public.is_manager_of(utilisateur_id))
);
create function revictus_private.tache_client_visible(p_tache uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.taches t where t.id=p_tache and (t.client_id is null or revictus_private.acces_client_pour(auth.uid(),t.client_id)));
$$;
revoke all on function revictus_private.tache_client_visible(uuid) from public,anon;
grant execute on function revictus_private.tache_client_visible(uuid) to authenticated;
create policy "revictus_client_tache" on public.taches as restrictive for all to authenticated using(client_id is null or revictus_private.client_visible(client_id)) with check(client_id is null or revictus_private.client_visible(client_id));
create policy "revictus_client_commentaire" on public.commentaires as restrictive for all to authenticated using(revictus_private.tache_client_visible(tache_id)) with check(revictus_private.tache_client_visible(tache_id));
create policy "revictus_client_dependance" on public.taches_dependances as restrictive for all to authenticated using(revictus_private.tache_client_visible(tache_id) and revictus_private.tache_client_visible(depend_de_id)) with check(revictus_private.tache_client_visible(tache_id) and revictus_private.tache_client_visible(depend_de_id));
create policy "revictus_client_session" on public.sessions_temps as restrictive for all to authenticated using(revictus_private.tache_client_visible(tache_id)) with check(revictus_private.tache_client_visible(tache_id));
create policy "revictus_client_piece" on public.pieces_jointes as restrictive for all to authenticated using(revictus_private.tache_client_visible(tache_id)) with check(revictus_private.tache_client_visible(tache_id));
create or replace function public.peut_acceder_tache_id(p_tache_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.taches t where t.id=p_tache_id and (t.client_id is null or revictus_private.acces_client_pour(auth.uid(),t.client_id)) and ((t.espace='partage' and t.entreprise_id=public.current_entreprise_id()) or (t.espace='personnel' and (public.peut_acceder(t.assigne_id) or public.peut_acceder(t.createur_id)))));
$$;
create function revictus_private.verifier_affectation_client()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.client_id is distinct from old.client_id or new.entreprise_id is distinct from old.entreprise_id) and auth.uid() is not null
  and not exists(select 1 from public.utilisateurs u where u.id=auth.uid() and u.role='admin' and u.statut='actif' and u.deleted_at is null and u.entreprise_id=old.entreprise_id and u.entreprise_id=new.entreprise_id)
 then raise exception 'Le classement d’une tâche existante est réservé à l’administrateur.' using errcode='42501'; end if;
 if new.client_id is not null then
  if not exists(select 1 from public.clients c where c.id=new.client_id and c.entreprise_id=new.entreprise_id and c.actif) then raise exception 'Client non valide';end if;
  if (tg_op='INSERT' or new.assigne_id is distinct from old.assigne_id or new.client_id is distinct from old.client_id) and new.assigne_id is not null and not revictus_private.acces_client_pour(new.assigne_id,new.client_id) then raise exception 'Le collaborateur doit d’abord être rattaché au client.';end if;
 end if;
 return new;
end;$$;
revoke all on function revictus_private.verifier_affectation_client() from public,anon,authenticated;
create trigger verifier_affectation_client before insert or update on public.taches for each row execute function revictus_private.verifier_affectation_client();
create function revictus_private.session_client_visible(p_session uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sessions_temps s where s.id=p_session and revictus_private.tache_client_visible(s.tache_id));
$$;
revoke all on function revictus_private.session_client_visible(uuid) from public,anon;
grant execute on function revictus_private.session_client_visible(uuid) to authenticated;
create policy "revictus_client_correction" on public.corrections as restrictive for all to authenticated using(case when table_cible::text='taches' then revictus_private.tache_client_visible(ligne_id) when table_cible::text='sessions_temps' then revictus_private.session_client_visible(ligne_id) else true end) with check(case when table_cible::text='taches' then revictus_private.tache_client_visible(ligne_id) when table_cible::text='sessions_temps' then revictus_private.session_client_visible(ligne_id) else true end);
create policy "revictus_client_historique" on public.historique as restrictive for select to authenticated using(case when cible_table='taches' then revictus_private.tache_client_visible(cible_id) when cible_table='sessions_temps' then revictus_private.session_client_visible(cible_id) else true end);
create function revictus_private.notification_client_visible(p_lien text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_id text;
begin
 if p_lien is null or p_lien not like '/kanban?tache=%' then return true;end if;
 v_id=split_part(p_lien,'=',2);
 if v_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false;end if;
 return revictus_private.tache_client_visible(v_id::uuid);
end;$$;
revoke all on function revictus_private.notification_client_visible(text) from public,anon;
grant execute on function revictus_private.notification_client_visible(text) to authenticated;
create policy "revictus_client_notification" on public.notifications as restrictive for all to authenticated using(revictus_private.notification_client_visible(lien)) with check(revictus_private.notification_client_visible(lien));
create function revictus_private.filtrer_notification_client()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_client uuid; v_id text;
begin
 if new.lien like '/kanban?tache=%' then
  v_id=split_part(new.lien,'=',2);
  if v_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return null;end if;
  select client_id into v_client from public.taches where id=v_id::uuid;
  if v_client is not null and not revictus_private.acces_client_pour(new.destinataire_id,v_client) then return null;end if;
 end if;
 return new;
end;$$;
revoke all on function revictus_private.filtrer_notification_client() from public,anon,authenticated;
create trigger filtrer_notification_client before insert on public.notifications for each row execute function revictus_private.filtrer_notification_client();
