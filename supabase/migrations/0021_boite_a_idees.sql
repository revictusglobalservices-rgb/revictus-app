-- Boîte à idées (demande d'Angelo, 07/09/2026) : chaque collaborateur peut
-- proposer une amélioration, la soutenir par un vote, et voir les idées des
-- autres une fois validées. Décisions retenues avec Angelo :
--   • Visibilité : chacun voit ses propres idées (tous statuts) + les idées
--     validées des autres collaborateurs/managers. Les idées proposées par
--     un admin restent invisibles aux collaborateurs/managers, même validées
--     (l'admin garde un usage à part de l'outil). L'admin, lui, voit tout.
--   • Votes : compteur de soutiens (1 vote par personne par idée, togglable).
--   • Statut : seul un admin peut valider/refuser une idée (comme pour les
--     congés/corrections, via RPC dédiée plutôt qu'un update direct).
--
-- `auteur_nom` et `auteur_est_admin` sont dénormalisés sur la ligne à la
-- création (trigger ci-dessous) : la RLS "utilisateurs: lecture" empêche un
-- collaborateur de lire le nom d'un collègue qui n'est ni lui-même ni dans
-- son équipe, alors que la boîte à idées doit pouvoir afficher "proposé par
-- X" sur une idée validée venant de n'importe qui dans l'entreprise. Même
-- logique pour la règle de visibilité (masquer les idées d'un admin), qui a
-- besoin du rôle de l'auteur sans dépendre de la RLS de `utilisateurs`.

create type statut_idee as enum ('en_attente', 'validee', 'refusee');

create table idees (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprises(id),
  auteur_id uuid not null references utilisateurs(id),
  auteur_nom text not null,
  auteur_est_admin boolean not null default false,
  titre text not null,
  description text,
  statut statut_idee not null default 'en_attente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_idees_entreprise on idees(entreprise_id);
comment on column idees.deleted_at is 'Soft delete';

create table idees_votes (
  idee_id uuid not null references idees(id) on delete cascade,
  utilisateur_id uuid not null references utilisateurs(id),
  created_at timestamptz not null default now(),
  primary key (idee_id, utilisateur_id)
);
create index idx_idees_votes_idee on idees_votes(idee_id);

-- ---------------------------------------------------------------- dénormalisation auteur
create or replace function public.renseigner_auteur_idee()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nom text;
  v_role role_utilisateur;
  v_entreprise_id uuid;
begin
  select nom, role, entreprise_id into v_nom, v_role, v_entreprise_id
  from utilisateurs where id = new.auteur_id;

  new.auteur_nom := v_nom;
  new.auteur_est_admin := (v_role = 'admin');
  new.entreprise_id := v_entreprise_id;
  return new;
end;
$$;

create trigger trg_renseigner_auteur_idee before insert on idees
  for each row execute function public.renseigner_auteur_idee();

create trigger trg_idees_updated_at before update on idees
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- RLS
alter table idees enable row level security;
alter table idees_votes enable row level security;

create policy "idees: lecture" on idees for select
  using (
    is_admin()
    or auteur_id = auth.uid()
    or (statut = 'validee' and not auteur_est_admin)
  );

create policy "idees: creation" on idees for insert
  with check (auteur_id = auth.uid());

-- Modification (édition de contenu ou suppression douce via deleted_at) :
-- l'auteur tant que l'idée n'a pas encore été traitée, l'admin à tout moment.
-- Le changement de statut lui-même ne passe jamais par ici : voir les RPC
-- valider_idee / refuser_idee plus bas (comme pour les congés, section 12).
create policy "idees: modification" on idees for update
  using (is_admin() or (auteur_id = auth.uid() and statut = 'en_attente'))
  with check (is_admin() or (auteur_id = auth.uid() and statut = 'en_attente'));

create policy "votes: lecture" on idees_votes for select
  using (exists (
    select 1 from idees i where i.id = idee_id
    and (is_admin() or i.auteur_id = auth.uid() or (i.statut = 'validee' and not i.auteur_est_admin))
  ));

create policy "votes: ajouter son vote" on idees_votes for insert
  with check (
    utilisateur_id = auth.uid()
    and exists (
      select 1 from idees i where i.id = idee_id
      and (is_admin() or i.auteur_id = auth.uid() or (i.statut = 'validee' and not i.auteur_est_admin))
    )
  );

create policy "votes: retirer son vote" on idees_votes for delete
  using (utilisateur_id = auth.uid());

-- ---------------------------------------------------------------- validation / refus (admin uniquement)
create or replace function public.valider_idee(p_id uuid)
returns idees
language plpgsql security definer set search_path = public as $$
declare
  v_ligne idees;
begin
  select * into v_ligne from idees where id = p_id and deleted_at is null;
  if v_ligne is null then
    raise exception 'Idee introuvable';
  end if;
  if not is_admin() then
    raise exception 'Non autorise';
  end if;
  if v_ligne.statut <> 'en_attente' then
    raise exception 'Cette idee a deja ete traitee';
  end if;

  update idees set statut = 'validee' where id = p_id returning * into v_ligne;
  return v_ligne;
end;
$$;
grant execute on function public.valider_idee(uuid) to authenticated;

create or replace function public.refuser_idee(p_id uuid)
returns idees
language plpgsql security definer set search_path = public as $$
declare
  v_ligne idees;
begin
  select * into v_ligne from idees where id = p_id and deleted_at is null;
  if v_ligne is null then
    raise exception 'Idee introuvable';
  end if;
  if not is_admin() then
    raise exception 'Non autorise';
  end if;
  if v_ligne.statut <> 'en_attente' then
    raise exception 'Cette idee a deja ete traitee';
  end if;

  update idees set statut = 'refusee' where id = p_id returning * into v_ligne;
  return v_ligne;
end;
$$;
grant execute on function public.refuser_idee(uuid) to authenticated;

-- ---------------------------------------------------------------- notifications
-- Nouvelle idée → notifie les admins de l'entreprise (pas l'auteur si
-- lui-même admin). Idée traitée → notifie l'auteur. In-app + e-mail comme
-- pour les congés/corrections (pas de raison de la traiter comme une simple
-- mention, contrairement à 0020_mention_sans_email.sql).
create or replace function public.notifier_nouvelle_idee()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (destinataire_id, type, canal, contenu, lien)
  select id, 'idee_nouvelle', 'in_app', new.auteur_nom || ' a propose une nouvelle idee : ' || new.titre, '/idees'
  from utilisateurs
  where entreprise_id = new.entreprise_id and role = 'admin' and id <> new.auteur_id and deleted_at is null;
  return new;
end;
$$;

drop trigger if exists trg_notifier_nouvelle_idee on idees;
create trigger trg_notifier_nouvelle_idee
after insert on idees
for each row execute function public.notifier_nouvelle_idee();

create or replace function public.notifier_statut_idee()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut <> old.statut and new.statut in ('validee', 'refusee') then
    insert into notifications (destinataire_id, type, canal, contenu, lien)
    values (
      new.auteur_id,
      case when new.statut = 'validee' then 'idee_validee' else 'idee_refusee' end,
      'in_app',
      case when new.statut = 'validee'
        then 'Ton idee a ete validee : ' || new.titre
        else 'Ton idee a ete refusee : ' || new.titre
      end,
      '/idees'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notifier_statut_idee on idees;
create trigger trg_notifier_statut_idee
after update on idees
for each row execute function public.notifier_statut_idee();
