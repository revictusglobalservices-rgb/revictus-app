// Types de base de données écrits à la main pour démarrer.
// À remplacer dès que possible par une génération automatique :
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts
//
// Note : ces types utilisent `type`, pas `interface` — le générateur de types
// Supabase/PostgREST résout mal les `interface` dans ses types conditionnels
// (une ligne `interface` casse l'inférence des colonnes après `.select()`).

export type RoleUtilisateur = "collaborateur" | "manager" | "admin";
export type StatutUtilisateur = "actif" | "invite" | "suspendu" | "archive";
export type StatutTache = "a_faire" | "en_cours" | "en_attente" | "terminee";
export type PrioriteTache = "urgent" | "important" | "normal";
// Kanban : tâche visible/modifiable seulement par son propriétaire (personnel)
// ou par toute l'entreprise (partage) — décision du 01/09/2026.
export type EspaceTache = "personnel" | "partage";
export type StatutPointage = "ouvert" | "ferme";
export type StatutCorrection = "en_attente" | "approuvee" | "refusee";
export type TableCible = "pointages" | "sessions_temps" | "taches";
export type CanalNotification = "in_app" | "email" | "push" | "slack_teams" | "whatsapp";
export type TypeEntreePlanning = "horaire_travail" | "evenement";
export type CategoriePlanning = "matin" | "apres_midi" | "journee" | "soir" | "teletravail" | "formation";
export type NatureCongeAbsence = "conge" | "absence";
export type TypeCongeAbsence =
  | "conge_paye"
  | "rtt"
  | "conge_sans_solde"
  | "conge_autre"
  | "maladie"
  | "absence_injustifiee"
  | "absence_autre";
export type StatutCongeAbsence = "en_attente" | "validee" | "refusee";

export type Utilisateur = {
  id: string;
  entreprise_id: string;
  equipe_id: string | null;
  manager_id: string | null;
  nom: string;
  email: string;
  role: RoleUtilisateur;
  statut: StatutUtilisateur;
  fuseau_horaire: string;
  photo_url: string | null;
  langue: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Tache = {
  id: string;
  entreprise_id: string;
  titre: string;
  description: string | null;
  statut: StatutTache;
  priorite: PrioriteTache;
  colonne_id: string | null;
  assigne_id: string | null;
  createur_id: string;
  echeance: string | null;
  espace: EspaceTache;
  ordre: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ColonneKanban = {
  id: string;
  entreprise_id: string;
  nom: string;
  statut_lie: StatutTache;
  ordre: number;
  created_at: string;
};

export type Commentaire = {
  id: string;
  tache_id: string;
  auteur_id: string;
  contenu: string;
  mentions: string[];
  created_at: string;
  deleted_at: string | null;
};

// Pas de soft delete ici (contrairement au reste de l'app) : un fichier
// supprimé libère tout de suite le stockage (0019_kanban_pieces_jointes.sql).
export type PieceJointe = {
  id: string;
  tache_id: string;
  chemin_stockage: string;
  nom_fichier: string;
  taille_octets: number;
  type_mime: string | null;
  auteur_id: string;
  created_at: string;
};

export type Pointage = {
  id: string;
  utilisateur_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  statut: StatutPointage;
  duree_secondes: number | null;
  created_at: string;
};

export type SessionTemps = {
  id: string;
  tache_id: string;
  utilisateur_id: string;
  debut: string;
  fin: string | null;
  duree_secondes: number | null;
  source: "chrono" | "manuelle";
  motif_modification: string | null;
  created_at: string;
};

export type TypePause = "petite_pause" | "pause_dejeuner" | "permission";

export type Pause = {
  id: string;
  pointage_id: string;
  type: TypePause;
  debut: string;
  fin: string | null;
};

export type Correction = {
  id: string;
  table_cible: TableCible;
  ligne_id: string;
  auteur_id: string;
  ancienne_valeur: Record<string, unknown> | null;
  nouvelle_valeur: Record<string, unknown> | null;
  motif: string;
  approbateur_id: string | null;
  statut: StatutCorrection;
  created_at: string;
};

export type NotificationRevictus = {
  id: string;
  destinataire_id: string;
  type: string;
  canal: CanalNotification;
  contenu: string;
  lien: string | null;
  lu: boolean;
  created_at: string;
};

// Modèle hebdomadaire récurrent ("tous les lundis 8h-17h").
export type PlanningRecurrence = {
  id: string;
  utilisateur_id: string;
  entreprise_id: string;
  jour_semaine: number; // 0 = dimanche … 6 = samedi (Date.prototype.getDay())
  heure_debut: string; // "HH:MM:SS"
  heure_fin: string;
  libelle: string | null;
  categorie: CategoriePlanning;
  date_debut: string;
  date_fin: string | null;
  actif: boolean;
  createur_id: string;
  created_at: string;
  updated_at: string;
};

// Entrée concrète : exception à une occurrence récurrente (recurrence_id
// renseigné) ou entrée ponctuelle indépendante (recurrence_id nul).
export type PlanningEntree = {
  id: string;
  utilisateur_id: string;
  entreprise_id: string;
  recurrence_id: string | null;
  date: string;
  type: TypeEntreePlanning;
  annule: boolean;
  toute_journee: boolean;
  heure_debut: string | null;
  heure_fin: string | null;
  categorie: CategoriePlanning | null; // pertinent seulement si type = 'horaire_travail'
  titre: string | null;
  description: string | null;
  createur_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

// Ligne renvoyée par obtenir_planning() — le calendrier effectif d'une
// période, récurrences et entrées ponctuelles déjà combinées.
export type OccurrencePlanning = {
  jour: string;
  heure_debut: string | null;
  heure_fin: string | null;
  toute_journee: boolean;
  type: TypeEntreePlanning;
  categorie: CategoriePlanning | null;
  titre: string | null;
  description: string | null;
  recurrent: boolean;
  entree_id: string | null;
};

// Congé (planifié à l'avance) ou absence (signalée le jour même ou a
// posteriori) — même modèle, `nature` distingue les deux workflows côté
// front. Pas de solde de jours (décision du 30/08/2026) : on n'enregistre
// que la période.
export type CongeAbsence = {
  id: string;
  utilisateur_id: string;
  entreprise_id: string;
  nature: NatureCongeAbsence;
  type: TypeCongeAbsence;
  date_debut: string;
  date_fin: string;
  commentaire: string | null;
  statut: StatutCongeAbsence;
  motif_refus: string | null;
  createur_id: string;
  validateur_id: string | null;
  valide_le: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

// Placeholder minimal pour que `createClient<Database>()` compile dès maintenant.
// À affiner (ou remplacer entièrement) avec `supabase gen types`.
type TableDef<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      utilisateurs: TableDef<Utilisateur>;
      taches: TableDef<Tache>;
      colonnes_kanban: TableDef<ColonneKanban>;
      commentaires: TableDef<Commentaire>;
      pieces_jointes: TableDef<PieceJointe>;
      pointages: TableDef<Pointage>;
      pauses: TableDef<Pause>;
      sessions_temps: TableDef<SessionTemps>;
      corrections: TableDef<Correction>;
      notifications: TableDef<NotificationRevictus>;
      planning_recurrences: TableDef<PlanningRecurrence>;
      planning_entrees: TableDef<PlanningEntree>;
      conges_absences: TableDef<CongeAbsence>;
    };
    Views: Record<string, never>;
    Functions: {
      pointer_arrivee: { Args: { p_date: string }; Returns: Pointage };
      pointer_depart: { Args: { p_id: string }; Returns: Pointage };
      demarrer_pause: { Args: { p_pointage_id: string; p_type: TypePause }; Returns: Pause };
      terminer_pause: { Args: { p_pause_id: string }; Returns: Pause };
      heure_serveur: { Args: Record<string, never>; Returns: string };
      arreter_session: { Args: { p_id: string }; Returns: SessionTemps };
      approuver_correction: { Args: { p_id: string }; Returns: Correction };
      refuser_correction: { Args: { p_id: string }; Returns: Correction };
      obtenir_planning: {
        Args: { p_utilisateur_id: string; p_debut: string; p_fin: string };
        Returns: OccurrencePlanning[];
      };
      valider_conge_absence: { Args: { p_id: string }; Returns: CongeAbsence };
      refuser_conge_absence: { Args: { p_id: string; p_motif?: string | null }; Returns: CongeAbsence };
    };
    Enums: Record<string, never>;
  };
};
