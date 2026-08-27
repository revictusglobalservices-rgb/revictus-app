-- Politiques RLS — traduisent section par section les décisions du cadrage fonctionnel :
--   • collaborateur : lit/écrit uniquement ses propres objets (section 12, RLS collaborateur)
--   • manager       : lit ET modifie toutes les données de son équipe (décision du 27/08/2026)
--   • admin         : accès complet à son entreprise, jamais inter-entreprise (section 12, RLS admin)
--   • intégrations backend (IA, Airtable, etc.) : passent par la clé de service, qui
--     contourne la RLS — c'est pourquoi `historique` et `notifications` n'ont pas de
--     politique INSERT pour les utilisateurs (décision du 27/08/2026, section 12 « Accès services »).

alter table entreprises enable row level security;
alter table equipes enable row level security;
alter table utilisateurs enable row level security;
alter table colonnes_kanban enable row level security;
alter table taches enable row level security;
alter table taches_dependances enable row level security;
alter table commentaires enable row level security;
alter table pointages enable row level security;
alter table pauses enable row level security;
alter table sessions_temps enable row level security;
alter table corrections enable row level security;
alter table historique enable row level security;
alter table notifications enable row level security;

-- ---------------------------------------------------------------- entreprises / équipes
create policy "entreprise: lecture des membres" on entreprises for select
  using (id = current_entreprise_id() or is_admin());
create policy "entreprise: modification admin" on entreprises for update
  using (is_admin());

create policy "equipe: lecture des membres" on equipes for select
  using (entreprise_id = current_entreprise_id() or is_admin());
create policy "equipe: gestion admin" on equipes for insert with check (is_admin());
create policy "equipe: modification admin" on equipes for update using (is_admin());

-- ---------------------------------------------------------------- utilisateurs
create policy "utilisateurs: lecture" on utilisateurs for select
  using (id = auth.uid() or is_manager_of(id) or is_admin());
create policy "utilisateurs: creation par admin (invitation)" on utilisateurs for insert
  with check (is_admin());
create policy "utilisateurs: modification" on utilisateurs for update
  using (id = auth.uid() or is_manager_of(id) or is_admin());

-- ---------------------------------------------------------------- kanban / tâches
create policy "colonnes: lecture entreprise" on colonnes_kanban for select
  using (entreprise_id = current_entreprise_id() or is_admin());
create policy "colonnes: gestion admin" on colonnes_kanban for all
  using (is_admin()) with check (is_admin());

create policy "taches: lecture" on taches for select
  using (peut_acceder(assigne_id) or peut_acceder(createur_id));
create policy "taches: creation" on taches for insert
  with check (createur_id = auth.uid());
create policy "taches: modification" on taches for update
  using (peut_acceder(assigne_id) or peut_acceder(createur_id));

create policy "dependances: lecture" on taches_dependances for select
  using (exists (select 1 from taches t where t.id = tache_id
                 and (peut_acceder(t.assigne_id) or peut_acceder(t.createur_id))));
create policy "dependances: creation" on taches_dependances for insert
  with check (exists (select 1 from taches t where t.id = tache_id
                       and (peut_acceder(t.assigne_id) or peut_acceder(t.createur_id))));

create policy "commentaires: lecture" on commentaires for select
  using (exists (select 1 from taches t where t.id = tache_id
                 and (peut_acceder(t.assigne_id) or peut_acceder(t.createur_id))));
create policy "commentaires: creation" on commentaires for insert
  with check (auteur_id = auth.uid());

-- ---------------------------------------------------------------- pointage / chrono
create policy "pointages: lecture" on pointages for select
  using (peut_acceder(utilisateur_id));
create policy "pointages: creation (check-in)" on pointages for insert
  with check (utilisateur_id = auth.uid());
-- Le collaborateur ne modifie que son pointage du jour tant qu'il est ouvert (check-out) ;
-- toute correction sur un pointage déjà fermé passe par un manager/admin (section 4, "Correction").
create policy "pointages: modification" on pointages for update
  using (
    (utilisateur_id = auth.uid() and statut = 'ouvert')
    or is_manager_of(utilisateur_id)
    or is_admin()
  );

create policy "pauses: lecture" on pauses for select
  using (exists (select 1 from pointages p where p.id = pointage_id and peut_acceder(p.utilisateur_id)));
create policy "pauses: creation" on pauses for insert
  with check (exists (select 1 from pointages p where p.id = pointage_id and p.utilisateur_id = auth.uid()));
create policy "pauses: modification" on pauses for update
  using (exists (select 1 from pointages p where p.id = pointage_id and peut_acceder(p.utilisateur_id)));

create policy "sessions: lecture" on sessions_temps for select
  using (peut_acceder(utilisateur_id));
create policy "sessions: creation" on sessions_temps for insert
  with check (utilisateur_id = auth.uid());
create policy "sessions: modification" on sessions_temps for update
  using (peut_acceder(utilisateur_id));

-- ---------------------------------------------------------------- traçabilité & audit
create policy "corrections: lecture" on corrections for select
  using (peut_acceder(auteur_id));
create policy "corrections: creation" on corrections for insert
  with check (auteur_id = auth.uid());
-- Seuls un manager (de l'auteur) ou un admin peuvent approuver/refuser (section 6, "Validation").
create policy "corrections: approbation" on corrections for update
  using (is_manager_of(auteur_id) or is_admin());

-- Pas de politique INSERT : l'historique est écrit exclusivement par le serveur
-- (clé de service), jamais directement par un client authentifié.
create policy "historique: lecture" on historique for select
  using (is_admin() or is_manager_of(acteur_id));

-- Idem : les notifications sont émises côté serveur ; l'utilisateur peut seulement
-- les lire et les marquer comme lues.
create policy "notifications: lecture" on notifications for select
  using (destinataire_id = auth.uid());
create policy "notifications: marquer comme lue" on notifications for update
  using (destinataire_id = auth.uid())
  with check (destinataire_id = auth.uid());
