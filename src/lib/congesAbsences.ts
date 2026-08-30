// Constantes partagées congés/absences (décision du 30/08/2026) — libellés,
// couleurs, options de type par nature. Même esprit que planningCategories.ts.
import type { NatureCongeAbsence, StatutCongeAbsence, TypeCongeAbsence } from "@/types/database";

export const NATURE_LABEL: Record<NatureCongeAbsence, string> = {
  conge: "Congé",
  absence: "Absence",
};

export const TYPES_PAR_NATURE: Record<NatureCongeAbsence, TypeCongeAbsence[]> = {
  conge: ["conge_paye", "rtt", "conge_sans_solde", "conge_autre"],
  absence: ["maladie", "absence_injustifiee", "absence_autre"],
};

export const TYPE_LABEL: Record<TypeCongeAbsence, string> = {
  conge_paye: "Congé payé",
  rtt: "RTT",
  conge_sans_solde: "Congé sans solde",
  conge_autre: "Autre congé",
  maladie: "Maladie / arrêt",
  absence_injustifiee: "Absence injustifiée",
  absence_autre: "Autre absence",
};

export const STATUT_LABEL: Record<StatutCongeAbsence, string> = {
  en_attente: "En attente",
  validee: "Validé",
  refusee: "Refusé",
};

export const STATUT_COULEUR: Record<StatutCongeAbsence, { bg: string; fg: string }> = {
  en_attente: { bg: "var(--important-bg)", fg: "var(--important)" },
  validee: { bg: "var(--normal-bg)", fg: "var(--normal)" },
  refusee: { bg: "var(--urgent-bg)", fg: "var(--urgent)" },
};

// Couleurs pour l'affichage dans les grilles de planning — distinctes des
// catégories d'horaires et du badge "Repos" (var(--urgent)).
export const CONGE_COULEUR = { bg: "#e3f5e9", fg: "#1f9254" };
export const ABSENCE_COULEUR = { bg: "#fdecea", fg: "#a93327" };

export function formatPeriode(dateDebut: string, dateFin: string) {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
  const d1 = new Date(dateDebut + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  const d2 = new Date(dateFin + "T00:00:00").toLocaleDateString("fr-FR", opts);
  return dateDebut === dateFin ? d2 : `${d1} – ${d2}`;
}

// true si la date (ISO "AAAA-MM-JJ") tombe dans la période [date_debut, date_fin].
export function couvre(dateISO: string, dateDebut: string, dateFin: string) {
  return dateISO >= dateDebut && dateISO <= dateFin;
}
