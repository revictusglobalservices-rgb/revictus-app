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
export type StatutPointage = "ouvert" | "ferme";

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

// Placeholder minimal pour que `createClient<Database>()` compile dès maintenant.
// À affiner (ou remplacer entièrement) avec `supabase gen types`.
type TableDef<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      utilisateurs: TableDef<Utilisateur>;
      taches: TableDef<Tache>;
      colonnes_kanban: TableDef<ColonneKanban>;
      pointages: TableDef<Pointage>;
      pauses: TableDef<Pause>;
      sessions_temps: TableDef<SessionTemps>;
    };
    Views: Record<string, never>;
    Functions: {
      pointer_arrivee: { Args: { p_date: string }; Returns: Pointage };
      pointer_depart: { Args: { p_id: string }; Returns: Pointage };
      demarrer_pause: { Args: { p_pointage_id: string; p_type: TypePause }; Returns: Pause };
      terminer_pause: { Args: { p_pause_id: string }; Returns: Pause };
    };
    Enums: Record<string, never>;
  };
};
