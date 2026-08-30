-- Congés / absences (décision du 30/08/2026, phase suivante après la refonte
-- visuelle du planning) :
--   • "congé" = toujours planifié à l'avance (payé, RTT, sans solde, autre).
--   • "absence" = signalée le jour même ou a posteriori, imprévue (maladie,
--     injustifiée, autre) — même modèle de données, `nature` distingue les
--     deux workflows côté front (deux écrans différents).
--   • Le collaborateur peut soumettre une demande (reste "en_attente" jusqu'à
--     décision du manager/admin), OU le manager/admin peut créer directement
--     une entrée déjà "validee" (ex. congé imposé, oubli de saisie) — décision
--     du 30/08/2026, "les deux".
--   • Pas de solde de jours acquis/restants pour l'instant (décision du
--     30/08/2026) : on enregistre uniquement les périodes.

create type nature_conge_absence as enum ('conge', 'absence');

create type type_conge_absence as enum (
  'conge_paye', 'rtt', 'conge_sans_solde', 'conge_autre',
  'maladie', 'absence_injustifiee', 'absence_autre'
);

create type statut_conge_absence as enum ('en_attente', 'validee', 'refusee');

create table conges_absences (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references utilisateurs(id),
  entreprise_id uuid not null references entreprises(id),
  nature nature_conge_absence not null,
  type type_conge_absence not null,
  date_debut date not null,
  date_fin date not null,
  commentaire text,
  statut statut_conge_absence not null default 'en_attente',
  motif_refus text,
  createur_id uuid not null references utilisateurs(id),
  validateur_id uuid references utilisateurs(id),
  valide_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (date_fin >= date_debut),
  check (
    (nature = 'conge' and type in ('conge_paye', 'rtt', 'conge_sans_solde', 'conge_autre'))
    or
    (nature = 'absence' and type in ('maladie', 'absence_injustifiee', 'absence_autre'))
  )
);
create index idx_conges_absences_utilisateur on conges_absences(utilisateur_id, date_debut);
create index idx_conges_absences_entreprise_statut on conges_absences(entreprise_id, statut);

create trigger trg_conges_absences_updated_at before update on conges_absences
  for each row execute function set_updated_at();

-- Garde-fou : une demande faite par le collaborateur pour lui-même repart
-- toujours "en_attente" (même si un client malveillant tentait d'envoyer
-- autre chose) — seule une création par le manager/admin peut arriver
-- directement "validee".
create or replace function public.forcer_statut_demande_conge_absence()
returns trigger
language plpgsql as $$
begin
  if new.createur_id = new.utilisateur_id then
    new.statut := 'en_attente';
    new.validateur_id := null;
    new.valide_le := null;
  end if;
  return new;
end;
$$;

create trigger trg_forcer_statut_demande_conge_absence before insert on conges_absences
  for each row execute function public.forcer_statut_demande_conge_absence();

-- ---------------------------------------------------------------- RLS
alter table conges_absences enable row level security;

create policy "conges_absences: lecture" on conges_absences for select
  using (peut_acceder(utilisateur_id));

create policy "conges_absences: creation" on conges_absences for insert
  with check (utilisateur_id = auth.uid() or is_manager_of(utilisateur_id) or is_admin());

-- Le demandeur peut modifier (ou annuler, via soft delete) sa propre demande
-- tant qu'elle n'a pas été traitée — pas de self-validation possible : la
-- clause n'autorise pas de changer le statut vers autre chose que en_attente.
create policy "conges_absences: modification demandeur" on conges_absences for update
  using (utilisateur_id = auth.uid() and statut = 'en_attente')
  with check (utilisateur_id = auth.uid() and statut = 'en_attente');

create policy "conges_absences: modification manager" on conges_absences for update
  using (is_manager_of(utilisateur_id) or is_admin());

-- ---------------------------------------------------------------- validation / refus
-- Passent par RPC (comme approuver_correction/refuser_correction, voir
-- 0006_corrections_rpc.sql) pour garantir l'horodatage et l'auteur de la
-- décision, et empêcher de retraiter une demande déjà décidée.

create or replace function public.valider_conge_absence(p_id uuid)
returns conges_absences
language plpgsql security definer set search_path = public as $$
declare
  v_ligne conges_absences;
begin
  select * into v_ligne from conges_absences where id = p_id and deleted_at is null;
  if v_ligne is null then
    raise exception 'Demande introuvable';
  end if;
  if not (is_manager_of(v_ligne.utilisateur_id) or is_admin()) then
    raise exception 'Non autorisé';
  end if;
  if v_ligne.statut <> 'en_attente' then
    raise exception 'Cette demande a déjà été traitée';
  end if;

  update conges_absences
  set statut = 'validee', validateur_id = auth.uid(), valide_le = now(), motif_refus = null
  where id = p_id
  returning * into v_ligne;

  return v_ligne;
end;
$$;
grant execute on function public.valider_conge_absence(uuid) to authenticated;

create or replace function public.refuser_conge_absence(p_id uuid, p_motif text default null)
returns conges_absences
language plpgsql security definer set search_path = public as $$
declare
  v_ligne conges_absences;
begin
  select * into v_ligne from conges_absences where id = p_id and deleted_at is null;
  if v_ligne is null then
    raise exception 'Demande introuvable';
  end if;
  if not (is_manager_of(v_ligne.utilisateur_id) or is_admin()) then
    raise exception 'Non autorisé';
  end if;
  if v_ligne.statut <> 'en_attente' then
    raise exception 'Cette demande a déjà été traitée';
  end if;

  update conges_absences
  set statut = 'refusee', validateur_id = auth.uid(), valide_le = now(), motif_refus = p_motif
  where id = p_id
  returning * into v_ligne;

  return v_ligne;
end;
$$;
grant execute on function public.refuser_conge_absence(uuid, text) to authenticated;

-- ---------------------------------------------------------------- notifications
create or replace function public.notifier_conge_absence_creation()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_manager_id uuid;
  v_entreprise_id uuid;
  v_nom text;
  v_nature_label text;
  v_periode text;
begin
  select manager_id, entreprise_id, nom into v_manager_id, v_entreprise_id, v_nom
  from utilisateurs where id = new.utilisateur_id;

  v_nature_label := case when new.nature = 'conge' then 'congé' else 'absence' end;
  v_periode := to_char(new.date_debut, 'DD/MM') || ' au ' || to_char(new.date_fin, 'DD/MM');

  if new.statut = 'en_attente' then
    -- Demande à valider : notifie le manager (ou tous les admins s'il n'en a pas).
    if v_manager_id is not null then
      insert into notifications (destinataire_id, type, canal, contenu, lien)
      values (v_manager_id, new.nature || '_demande', 'in_app',
              v_nom || ' a demandé un ' || v_nature_label || ' du ' || v_periode || '.', '/manager/conges');
    else
      insert into notifications (destinataire_id, type, canal, contenu, lien)
      select id, new.nature || '_demande', 'in_app',
             v_nom || ' a demandé un ' || v_nature_label || ' du ' || v_periode || '.', '/manager/conges'
      from utilisateurs
      where entreprise_id = v_entreprise_id and role = 'admin' and id <> new.utilisateur_id;
    end if;
  elsif new.statut = 'validee' and new.createur_id <> new.utilisateur_id then
    -- Créé directement par le manager/admin, déjà validé : informe le collaborateur.
    insert into notifications (destinataire_id, type, canal, contenu, lien)
    values (new.utilisateur_id, new.nature || '_ajoute', 'in_app',
            'Un ' || v_nature_label || ' a été ajouté à ton planning, du ' || v_periode || '.', '/conges');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notifier_conge_absence_creation on conges_absences;
create trigger trg_notifier_conge_absence_creation
after insert on conges_absences
for each row execute function public.notifier_conge_absence_creation();

create or replace function public.notifier_conge_absence_statut()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nature_label text;
  v_periode text;
begin
  if new.statut <> old.statut and new.statut in ('validee', 'refusee') then
    v_nature_label := case when new.nature = 'conge' then 'congé' else 'absence' end;
    v_periode := to_char(new.date_debut, 'DD/MM') || '–' || to_char(new.date_fin, 'DD/MM');

    insert into notifications (destinataire_id, type, canal, contenu, lien)
    values (
      new.utilisateur_id,
      new.nature || '_' || new.statut::text,
      'in_app',
      case when new.statut = 'validee'
        then 'Ta demande de ' || v_nature_label || ' (' || v_periode || ') a été validée.'
        else 'Ta demande de ' || v_nature_label || ' (' || v_periode || ') a été refusée' ||
             coalesce(' : ' || new.motif_refus, '.')
      end,
      '/conges'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notifier_conge_absence_statut on conges_absences;
create trigger trg_notifier_conge_absence_statut
after update on conges_absences
for each row execute function public.notifier_conge_absence_statut();

-- ---------------------------------------------------------------- purge (soft delete, 45j)
-- Ajoute conges_absences à la purge automatique existante (0007) — même
-- fonction redéfinie en entier (pas de "returns void" à changer).
create or replace function public.purger_soft_delete()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_seuil timestamptz := now() - interval '45 days';
  v_id uuid;
begin
  for v_id in select id from commentaires where deleted_at < v_seuil loop
    begin
      delete from commentaires where id = v_id;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  for v_id in select id from conges_absences where deleted_at < v_seuil loop
    begin
      delete from conges_absences where id = v_id;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  for v_id in select id from taches where deleted_at < v_seuil loop
    begin
      delete from taches where id = v_id;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  for v_id in select id from utilisateurs where deleted_at < v_seuil loop
    begin
      delete from utilisateurs where id = v_id;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  for v_id in select id from equipes where deleted_at < v_seuil loop
    begin
      delete from equipes where id = v_id;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  for v_id in select id from entreprises where deleted_at < v_seuil loop
    begin
      delete from entreprises where id = v_id;
    exception when foreign_key_violation then
      null;
    end;
  end loop;
end;
$$;
