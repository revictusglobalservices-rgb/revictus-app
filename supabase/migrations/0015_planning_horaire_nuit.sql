-- Autorise les horaires à cheval sur minuit (ex. 17h-01h, décision du
-- 30/08/2026 suite à un cas réel remonté par Angelo) : jusqu'ici,
-- `check (heure_fin > heure_debut)` sur planning_recurrences et
-- planning_entrees rejetait toute plage où l'heure de fin est plus petite
-- que l'heure de début, ce qui empêchait de saisir un horaire de nuit.
--
-- On garde une garde-fou minimale (les deux heures ne peuvent pas être
-- identiques — ambiguïté 0h/24h) mais on autorise heure_fin < heure_debut,
-- qui signifie désormais "se termine le lendemain". La plage est stockée
-- telle quelle sur le jour de début ; `obtenir_planning()` n'a pas besoin de
-- changer, il ne fait que renvoyer heure_debut/heure_fin telles quelles.
-- Les contraintes originales n'avaient pas de nom explicite (héritage de
-- 0013_planning.sql) — on les retrouve dynamiquement via leur définition
-- avant de les remplacer par une version nommée.

do $$
declare
  c record;
begin
  for c in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.planning_recurrences'::regclass, 'public.planning_entrees'::regclass)
      and pg_get_constraintdef(oid) ilike '%heure_fin%heure_debut%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table planning_recurrences
  add constraint planning_recurrences_heures_distinctes check (heure_fin <> heure_debut);

alter table planning_entrees
  add constraint planning_entrees_heures_distinctes
  check (heure_debut is null or heure_fin is null or heure_fin <> heure_debut);
