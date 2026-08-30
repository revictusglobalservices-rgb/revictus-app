// Libellés/couleurs des catégories de planning — partagés entre la vue
// collaborateur (`/planning`), la grille équipe manager (`/manager/planning`)
// et l'éditeur (`PlanningEditor`). Palette pastel alignée sur les maquettes
// du 30/08/2026 : vert = matin, orange = après-midi, bleu = journée,
// violet = soir/télétravail/formation (regroupés, pas assez de teintes
// distinctes dans la palette existante pour les séparer proprement).
import type { CategoriePlanning } from "@/types/database";

export const CATEGORIE_LABEL: Record<CategoriePlanning, string> = {
  matin: "Matin",
  apres_midi: "Après-midi",
  journee: "Journée",
  soir: "Soir",
  teletravail: "Télétravail",
  formation: "Formation",
};

export const CATEGORIE_COULEUR: Record<CategoriePlanning, { bg: string; fg: string }> = {
  matin: { bg: "var(--normal-bg)", fg: "var(--normal)" },
  apres_midi: { bg: "var(--important-bg)", fg: "var(--important)" },
  journee: { bg: "var(--accent-2-bg)", fg: "var(--accent-2)" },
  soir: { bg: "#f1e9fb", fg: "var(--accent-3)" },
  teletravail: { bg: "#f1e9fb", fg: "var(--accent-3)" },
  formation: { bg: "#f1e9fb", fg: "var(--accent-3)" },
};

export const REPOS_COULEUR = { bg: "var(--urgent-bg)", fg: "var(--urgent)" };
export const EVENEMENT_COULEUR = { bg: "var(--accent-2-bg)", fg: "var(--accent-2)" };

// Devine une catégorie par défaut à partir de l'heure de début — sert
// uniquement à pré-remplir le formulaire manager, jamais à recalculer une
// catégorie déjà choisie explicitement.
export function categorieParDefaut(heureDebut: string): CategoriePlanning {
  const heure = Number(heureDebut.slice(0, 2));
  if (heure < 12) return "matin";
  if (heure < 17) return "apres_midi";
  return "soir";
}
