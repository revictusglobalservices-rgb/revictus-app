-- Planning / agenda par collaborateur — demande du 30/08/2026. Décisions
-- retenues avec Angelo :
--   • contenu : horaires de travail prévus (récurrents, hebdo) + événements
--     ponctuels (rendez-vous, congé, etc.) ;
--   • édition : manager (de l'intéressé) ou admin uniquement — le
--     collaborateur voit son planning en lecture seule (même principe que
--     pour les autres écrans : peut_acceder() en lecture, is_manager_of()/
--     is_admin() en écriture) ;
--   • récurrence : un horaire hebdomadaire (ex. "tous les lundis 8h-17h")
--     avec possibilité de modifier ou annuler une occurrence précise sans
--     toucher au modèle général ;
--   • notifications : le collaborateur est notifié (in-app + e-mail, comme
--     le pointage) quand son planning est créé/modifié.
--
-- Modèle à deux tables :
--   `planning_recurrences`  — le modèle hebdomadaire ("tous les lundis...").
--   `planning_entrees`      — les entrées concrètes : soit une exception à
--                              une occurrence précise d'un modèle récurrent
--                              (`recurrence_id` renseigné : heure modifiée,
--                              ou `annule = true` pour un jour off), soit une
--                              entrée ponctuelle indépendante (`recurrence_id`
--                              nul : horaire one-shot ou événement libre).
-- `obtenir_planning()` recompose le calendrier effectif d'une période en
-- combinant les deux (récurrences moins leurs exceptions, plus les entrées
-- ponctuelles) — c'est cette fonction que les pages front appellent, jamais
-- les tables directement en lecture.
--
-- Convention jour de la semaine : 0 = dimanche … 6 = samedi, alignée sur
-- `extract(dow from ...)` côté SQL et `Date.prototype.getDay()` côté JS —
-- pas besoin de conversion entre front et back.

create type type_entree_planning as enum ('horaire_travail', 'evenement');

-- ---------------------------------------------------------------- modèle récurrent
create table planning_recurrences (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references utilisateurs(id),
  entreprise_id uuid not null references entreprises(id),
  jour_semaine smallint not null check (jour_semaine between 0 and 6),
  heure_debut time not null,
  heure_fin time not null,
  libelle text,
  date_debut date not null default current_date,
  date_fin date, -- null = pas de fin prévue
  actif boolean not null default true, -- désactivation douce, jamais de delete (historique)
  createur_id uuid not null references utilisateurs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (heure_fin > heure_debut),
  check (date_fin is null or date_fin >= date_debut)
);
create index idx_planning_recurrences_utilisateur on planning_recurrences(utilisateur_id);

create trigger trg_planning_recurrences_updated_at before update on planning_recurrences
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- entrées concrètes
create table planning_entrees (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references utilisateurs(id),
  entreprise_id uuid not null references entreprises(id),
  recurrence_id uuid references planning_recurrences(id) on delete cascade,
  date date not null,
  type type_entree_planning not null default 'evenement',
  annule boolean not null default false, -- true = occurrence récurrente annulée ce jour-là
  toute_journee boolean not null default false,
  heure_debut time,
  heure_fin time,
  titre text,
  description text,
  createur_id uuid not null references utilisateurs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (toute_journee or annule or (heure_debut is not null and heure_fin is not null)),
  check (heure_debut is null or heure_fin is null or heure_fin > heure_debut)
);
create index idx_planning_entrees_utilisateur_date on planning_entrees(utilisateur_id, date);
create index idx_planning_entrees_recurrence on planning_entrees(recurrence_id);
-- Une seule exception par occurrence récurrente (une date donnée d'un modèle donné).
create unique index uq_planning_entrees_exception on planning_entrees(recurrence_id, date)
  where recurrence_id is not null and deleted_at is null;

create trigger trg_planning_entrees_updated_at before update on planning_entrees
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- RLS
alter table planning_recurrences enable row level security;
alter table planning_entrees enable row level security;

create policy "planning_recurrences: lecture" on planning_recurrences for select
  using (peut_acceder(utilisateur_id));
create policy "planning_recurrences: creation" on planning_recurrences for insert
  with check (is_manager_of(utilisateur_id) or is_admin());
create policy "planning_recurrences: modification" on planning_recurrences for update
  using (is_manager_of(utilisateur_id) or is_admin());

create policy "planning_entrees: lecture" on planning_entrees for select
  using (peut_acceder(utilisateur_id));
create policy "planning_entrees: creation" on planning_entrees for insert
  with check (is_manager_of(utilisateur_id) or is_admin());
create policy "planning_entrees: modification" on planning_entrees for update
  using (is_manager_of(utilisateur_id) or is_admin());

-- ---------------------------------------------------------------- lecture combinée
-- Recompose le planning effectif d'un utilisateur sur [p_debut, p_fin] :
-- occurrences des modèles récurrents actifs, en appliquant leurs exceptions
-- (heure modifiée ou jour annulé), plus les entrées ponctuelles indépendantes.
-- `security invoker` (par défaut) : la RLS des deux tables s'applique
-- normalement au demandeur (lui-même, son manager, ou un admin).
create or replace function public.obtenir_planning(p_utilisateur_id uuid, p_debut date, p_fin date)
returns table (
  jour date,
  heure_debut time,
  heure_fin time,
  toute_journee boolean,
  type text,
  titre text,
  description text,
  recurrent boolean,
  entree_id uuid
)
language sql stable as $$
  with occurrences as (
    select
      d::date as jour,
      r.id as recurrence_id,
      r.heure_debut as heure_debut,
      r.heure_fin as heure_fin,
      r.libelle as libelle
    from planning_recurrences r
    cross join lateral generate_series(
      greatest(p_debut, r.date_debut),
      least(p_fin, coalesce(r.date_fin, p_fin)),
      interval '1 day'
    ) as d
    where r.utilisateur_id = p_utilisateur_id
      and r.actif
      and r.date_debut <= p_fin
      and (r.date_fin is null or r.date_fin >= p_debut)
      and extract(dow from d) = r.jour_semaine
  )
  select
    o.jour,
    coalesce(e.heure_debut, o.heure_debut),
    coalesce(e.heure_fin, o.heure_fin),
    coalesce(e.toute_journee, false),
    'horaire_travail'::text,
    coalesce(e.titre, o.libelle, 'Horaire de travail'),
    e.description,
    true,
    e.id
  from occurrences o
  left join planning_entrees e
    on e.recurrence_id = o.recurrence_id and e.date = o.jour and e.deleted_at is null
  where e.id is null or e.annule = false

  union all

  select
    e.date,
    e.heure_debut,
    e.heure_fin,
    e.toute_journee,
    e.type::text,
    e.titre,
    e.description,
    false,
    e.id
  from planning_entrees e
  where e.utilisateur_id = p_utilisateur_id
    and e.recurrence_id is null
    and e.date between p_debut and p_fin
    and e.deleted_at is null

  order by 1, 2 nulls first;
$$;

-- ---------------------------------------------------------------- notifications
-- Le manager/admin qui crée ou modifie le planning n'est jamais le
-- destinataire (RLS interdit déjà au collaborateur d'écrire lui-même) — on
-- exclut quand même auth.uid() par cohérence avec notifier_tache_assignee().

create or replace function public.notifier_planning_recurrence()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_jours text[] := array['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  v_msg text;
begin
  if new.utilisateur_id = auth.uid() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_msg := 'Un nouvel horaire récurrent a été ajouté à votre planning : ' || v_jours[new.jour_semaine + 1] ||
             ' ' || to_char(new.heure_debut, 'HH24:MI') || '–' || to_char(new.heure_fin, 'HH24:MI') || '.';
  else
    if new.actif = false and old.actif = true then
      v_msg := 'Votre horaire récurrent du ' || v_jours[new.jour_semaine + 1] || ' a été désactivé.';
    elsif new.heure_debut <> old.heure_debut or new.heure_fin <> old.heure_fin then
      v_msg := 'Votre horaire récurrent du ' || v_jours[new.jour_semaine + 1] || ' a été modifié : ' ||
               to_char(new.heure_debut, 'HH24:MI') || '–' || to_char(new.heure_fin, 'HH24:MI') || '.';
    else
      return new;
    end if;
  end if;

  insert into notifications (destinataire_id, type, canal, contenu, lien)
  values (new.utilisateur_id, 'planning_modifie', 'in_app', v_msg, '/planning');

  return new;
end;
$$;

drop trigger if exists trg_notifier_planning_recurrence_insert on planning_recurrences;
create trigger trg_notifier_planning_recurrence_insert
after insert on planning_recurrences
for each row execute function public.notifier_planning_recurrence();

drop trigger if exists trg_notifier_planning_recurrence_update on planning_recurrences;
create trigger trg_notifier_planning_recurrence_update
after update on planning_recurrences
for each row execute function public.notifier_planning_recurrence();

create or replace function public.notifier_planning_entree()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_date text;
  v_msg text;
begin
  if new.utilisateur_id = auth.uid() then
    return new;
  end if;

  v_date := to_char(new.date, 'DD/MM');

  if tg_op = 'INSERT' then
    if new.annule then
      v_msg := 'Votre horaire du ' || v_date || ' a été annulé.';
    elsif new.type = 'evenement' then
      v_msg := 'Un nouvel événement a été ajouté à votre planning le ' || v_date ||
               coalesce(' : ' || new.titre, '') || '.';
    else
      v_msg := 'Un nouvel horaire a été ajouté à votre planning le ' || v_date || '.';
    end if;
  else
    if new.deleted_at is not null and old.deleted_at is null then
      v_msg := 'Une entrée de votre planning du ' || v_date || ' a été supprimée.';
    else
      v_msg := 'Votre planning du ' || v_date || ' a été modifié.';
    end if;
  end if;

  insert into notifications (destinataire_id, type, canal, contenu, lien)
  values (new.utilisateur_id, 'planning_modifie', 'in_app', v_msg, '/planning');

  return new;
end;
$$;

drop trigger if exists trg_notifier_planning_entree_insert on planning_entrees;
create trigger trg_notifier_planning_entree_insert
after insert on planning_entrees
for each row execute function public.notifier_planning_entree();

drop trigger if exists trg_notifier_planning_entree_update on planning_entrees;
create trigger trg_notifier_planning_entree_update
after update on planning_entrees
for each row execute function public.notifier_planning_entree();
