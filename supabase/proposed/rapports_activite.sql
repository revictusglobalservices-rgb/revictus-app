-- Reports and quality reviews. New tables only; no change to existing records.
create table public.rapports_activite (
 id uuid primary key default gen_random_uuid(),
 auteur_id uuid not null references public.utilisateurs(id),
 entreprise_id uuid not null references public.entreprises(id),
 client_id uuid references public.clients(id),
 jour date not null,
 activites text not null check(char_length(trim(activites)) between 1 and 12000),
 difficultes text not null default '' check(char_length(difficultes)<=12000),
 restantes text not null default '' check(char_length(restantes)<=12000),
 statut text not null default 'a_valider' check(statut in ('a_valider','a_corriger','valide')),
 qualite text check(qualite in ('conforme','a_ameliorer','non_conforme')),
 observations text not null default '' check(char_length(observations)<=12000),
 evaluateur_id uuid references public.utilisateurs(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 version integer not null default 1 check(version>=1),
 check((statut='a_valider' and qualite is null and evaluateur_id is null and observations='') or (statut in ('a_corriger','valide') and qualite is not null and evaluateur_id is not null)),
 check(statut<>'a_corriger' or char_length(trim(observations))>0)
);
create unique index rapport_client_jour on public.rapports_activite(auteur_id,client_id,jour) where client_id is not null;
create unique index rapport_interne_jour on public.rapports_activite(auteur_id,jour) where client_id is null;
create index rapport_periode on public.rapports_activite(entreprise_id,jour);
create table public.rapports_activite_historique (
 id uuid primary key default gen_random_uuid(),
 rapport_id uuid not null references public.rapports_activite(id),
 version integer not null,
 acteur_id uuid not null references public.utilisateurs(id),
 instant timestamptz not null default now(),
 instantane jsonb not null,
 unique(rapport_id,version)
);
alter table public.rapports_activite enable row level security;
alter table public.rapports_activite_historique enable row level security;
revoke all on public.rapports_activite,public.rapports_activite_historique from public,anon,authenticated;
grant select on public.rapports_activite,public.rapports_activite_historique to authenticated;
grant insert(auteur_id,entreprise_id,client_id,jour,activites,difficultes,restantes) on public.rapports_activite to authenticated;
grant update(activites,difficultes,restantes,statut,qualite,observations) on public.rapports_activite to authenticated;
create function revictus_private.rapport_autorise(p_auteur uuid,p_entreprise uuid,p_client uuid,p_revision boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.utilisateurs a join public.utilisateurs u on u.id=p_auteur and u.entreprise_id=a.entreprise_id
  where a.id=auth.uid() and a.statut='actif' and a.deleted_at is null and a.entreprise_id=p_entreprise
  and (p_client is null or (exists(select 1 from public.clients c where c.id=p_client and c.entreprise_id=p_entreprise) and revictus_private.acces_client_pour(a.id,p_client)))
  and ((not p_revision and a.id=u.id) or ((not p_revision or a.id<>u.id) and (a.role='admin' or (a.role='manager' and u.manager_id=a.id)))))
$$;
revoke all on function revictus_private.rapport_autorise(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function revictus_private.rapport_autorise(uuid,uuid,uuid,boolean) to authenticated;
create policy rapports_lecture on public.rapports_activite for select to authenticated using(revictus_private.rapport_autorise(auteur_id,entreprise_id,client_id,false));
create policy rapports_creation on public.rapports_activite for insert to authenticated with check(auteur_id=(select auth.uid()) and revictus_private.rapport_autorise(auteur_id,entreprise_id,client_id,false));
create policy rapports_modification on public.rapports_activite for update to authenticated using(revictus_private.rapport_autorise(auteur_id,entreprise_id,client_id,false)) with check(revictus_private.rapport_autorise(auteur_id,entreprise_id,client_id,false));
create policy rapports_historique_lecture on public.rapports_activite_historique for select to authenticated using(exists(select 1 from public.rapports_activite r where r.id=rapport_id));
create function revictus_private.rapport_transition() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is null or not revictus_private.rapport_autorise(new.auteur_id,new.entreprise_id,new.client_id,false) then raise exception 'Accès refusé'; end if;
 if tg_op='INSERT' then
  if new.auteur_id<>auth.uid() or new.jour>(now() at time zone 'Indian/Antananarivo')::date then raise exception 'Date ou auteur non valide'; end if;
  new.statut:='a_valider';new.qualite:=null;new.observations:='';new.evaluateur_id:=null;new.version:=1;
 else
  if new.auteur_id<>old.auteur_id or new.entreprise_id<>old.entreprise_id or new.jour<>old.jour or new.client_id is distinct from old.client_id then raise exception 'Identité du rapport immuable';end if;
  if old.statut='a_corriger' and old.auteur_id=auth.uid() and new.statut='a_valider' then
   new.qualite:=null;new.observations:='';new.evaluateur_id:=null;
  elsif old.statut='a_valider' and new.statut in ('valide','a_corriger') and revictus_private.rapport_autorise(old.auteur_id,old.entreprise_id,old.client_id,true) then
   if new.activites is distinct from old.activites or new.difficultes is distinct from old.difficultes or new.restantes is distinct from old.restantes then raise exception 'Le contenu appartient à son auteur';end if;
   new.evaluateur_id:=auth.uid();
  else raise exception 'Transition non autorisée';end if;
  new.version:=old.version+1;
 end if;
 new.updated_at:=now();return new;
end;$$;
revoke all on function revictus_private.rapport_transition() from public,anon,authenticated;
create trigger rapport_transition before insert or update on public.rapports_activite for each row execute function revictus_private.rapport_transition();
create function revictus_private.rapport_archiver() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Auteur manquant';end if;
 insert into public.rapports_activite_historique(rapport_id,version,acteur_id,instantane) values(new.id,new.version,auth.uid(),to_jsonb(new));return new;
end;$$;
revoke all on function revictus_private.rapport_archiver() from public,anon,authenticated;
create trigger rapport_archiver after insert or update on public.rapports_activite for each row execute function revictus_private.rapport_archiver();
