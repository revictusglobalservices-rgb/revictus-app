-- Revictus — schéma initial
-- Reflète la section 11 (Données, historique et règles métier) du cadrage fonctionnel,
-- ainsi que les décisions de sécurité/suppression prises en section 12 et le 27/08/2026.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
create type role_utilisateur as enum ('collaborateur', 'manager', 'admin');
create type statut_utilisateur as enum ('actif', 'invite', 'suspendu', 'archive');
create type statut_tache as enum ('a_faire', 'en_cours', 'en_attente', 'terminee');
create type priorite_tache as enum ('urgent', 'important', 'normal'); -- échelle personnalisée Revictus (section 7)
create type statut_pointage as enum ('ouvert', 'ferme');
create type type_pause as enum ('petite_pause', 'pause_dejeuner', 'permission');
create type source_session as enum ('chrono', 'manuelle');
create type canal_notification as enum ('in_app', 'email', 'push', 'slack_teams', 'whatsapp');
create type statut_correction as enum ('en_attente', 'approuvee', 'refusee');

-- ---------------------------------------------------------------- entreprises & équipes
-- Une seule entreprise au MVP (décision section 12), mais modélisé multi-entreprise
-- dès le départ : bien moins coûteux à prévoir maintenant qu'à retrofitter plus tard.
create table entreprises (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  fuseau_horaire text not null default 'Indian/Antananarivo',
  parametres jsonb not null default '{}'::jsonb, -- horaires, jours fériés, statuts custom (section 13)
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table equipes (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprises(id),
  nom text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------- utilisateurs
-- 1:1 avec auth.users. Hiérarchie simple : un seul manager par collaborateur (section 2).
create table utilisateurs (
  id uuid primary key references auth.users(id) on delete cascade,
  entreprise_id uuid not null references entreprises(id),
  equipe_id uuid references equipes(id),
  manager_id uuid references utilisateurs(id),
  nom text not null,
  email text not null unique,
  role role_utilisateur not null default 'collaborateur',
  statut statut_utilisateur not null default 'invite',
  fuseau_horaire text not null default 'Indian/Antananarivo',
  photo_url text, -- décision du 27/08/2026 : photo de profil = donnée personnelle stockée
  langue text not null default 'fr',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_utilisateurs_manager on utilisateurs(manager_id);
create index idx_utilisateurs_entreprise on utilisateurs(entreprise_id);

-- ---------------------------------------------------------------- kanban & tâches
create table colonnes_kanban (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprises(id),
  nom text not null,
  statut_lie statut_tache not null,
  ordre int not null default 0,
  created_at timestamptz not null default now()
);

create table taches (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprises(id),
  titre text not null,
  description text,
  statut statut_tache not null default 'a_faire',
  priorite priorite_tache not null default 'normal',
  colonne_id uuid references colonnes_kanban(id),
  assigne_id uuid references utilisateurs(id),
  createur_id uuid not null references utilisateurs(id),
  echeance timestamptz,
  ordre int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_taches_assigne on taches(assigne_id);
create index idx_taches_entreprise on taches(entreprise_id);

create table taches_dependances (
  tache_id uuid not null references taches(id) on delete cascade,
  depend_de_id uuid not null references taches(id) on delete cascade,
  primary key (tache_id, depend_de_id)
);

create table commentaires (
  id uuid primary key default gen_random_uuid(),
  tache_id uuid not null references taches(id) on delete cascade,
  auteur_id uuid not null references utilisateurs(id),
  contenu text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------- pointage & chrono
create table pointages (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references utilisateurs(id),
  date date not null,
  check_in timestamptz,
  check_out timestamptz,
  statut statut_pointage not null default 'ouvert',
  duree_secondes int,
  created_at timestamptz not null default now(),
  unique (utilisateur_id, date)
);

create table pauses (
  id uuid primary key default gen_random_uuid(),
  pointage_id uuid not null references pointages(id) on delete cascade,
  type type_pause not null,
  debut timestamptz not null default now(),
  fin timestamptz
);

create table sessions_temps (
  id uuid primary key default gen_random_uuid(),
  tache_id uuid not null references taches(id),
  utilisateur_id uuid not null references utilisateurs(id),
  debut timestamptz not null default now(),
  fin timestamptz,
  duree_secondes int,
  source source_session not null default 'chrono',
  motif_modification text,
  created_at timestamptz not null default now()
);
create index idx_sessions_utilisateur on sessions_temps(utilisateur_id);
create index idx_sessions_tache on sessions_temps(tache_id);

-- ---------------------------------------------------------------- traçabilité (section 6)
create table corrections (
  id uuid primary key default gen_random_uuid(),
  table_cible text not null,       -- 'pointages' | 'sessions_temps' | 'taches'
  ligne_id uuid not null,
  auteur_id uuid not null references utilisateurs(id),
  ancienne_valeur jsonb,
  nouvelle_valeur jsonb,
  motif text not null,
  approbateur_id uuid references utilisateurs(id),
  statut statut_correction not null default 'en_attente',
  created_at timestamptz not null default now()
);

-- Audit général — écrit uniquement via la clé de service (voir section 12, décision du 27/08/2026).
create table historique (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprises(id),
  acteur_id uuid references utilisateurs(id),
  action text not null,
  cible_table text,
  cible_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  destinataire_id uuid not null references utilisateurs(id),
  type text not null,
  canal canal_notification not null default 'in_app',
  contenu text not null,
  lu boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_destinataire on notifications(destinataire_id, lu);

-- ---------------------------------------------------------------- suppression (soft delete, 45 jours)
comment on column entreprises.deleted_at is 'Soft delete — purge définitive après 45 jours (job planifié à mettre en place, voir README).';
comment on column equipes.deleted_at is 'Soft delete — purge définitive après 45 jours.';
comment on column utilisateurs.deleted_at is 'Soft delete — purge définitive après 45 jours.';
comment on column taches.deleted_at is 'Soft delete — purge définitive après 45 jours.';
comment on column commentaires.deleted_at is 'Soft delete — purge définitive après 45 jours.';
