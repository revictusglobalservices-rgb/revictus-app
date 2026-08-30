-- Refonte visuelle du planning (demande du 30/08/2026, maquettes fournies) —
-- ajoute une catégorie explicite à chaque horaire de travail, pour la grille
-- colorée (matin/après-midi/journée/soir en fonction de l'heure, télétravail/
-- formation en fonction du lieu — pas déductible de l'heure seule). Les
-- congés restent hors planning pour l'instant (système dédié à venir) ; une
-- journée sans occurrence reste affichée "Repos/OFF" côté front, sans ligne
-- en base — cohérent avec le modèle existant.
--
-- Additif uniquement : aucune donnée existante perdue, `categorie` a une
-- valeur par défaut pour les lignes déjà en place.

create type categorie_planning as enum ('matin', 'apres_midi', 'journee', 'soir', 'teletravail', 'formation');

alter table planning_recurrences add column categorie categorie_planning not null default 'matin';
alter table planning_entrees add column categorie categorie_planning; -- pertinent seulement si type = 'horaire_travail'

-- obtenir_planning() renvoie désormais la catégorie effective (celle de
-- l'exception si elle en définit une, sinon celle du modèle récurrent).
-- La signature de retour change → on ne peut pas se contenter d'un
-- `create or replace`, il faut d'abord supprimer l'ancienne version.
drop function if exists public.obtenir_planning(uuid, date, date);

create or replace function public.obtenir_planning(p_utilisateur_id uuid, p_debut date, p_fin date)
returns table (
  jour date,
  heure_debut time,
  heure_fin time,
  toute_journee boolean,
  type text,
  categorie categorie_planning,
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
      r.libelle as libelle,
      r.categorie as categorie
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
    coalesce(e.categorie, o.categorie),
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
    e.categorie,
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
