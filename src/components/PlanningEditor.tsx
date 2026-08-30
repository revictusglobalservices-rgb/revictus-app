"use client";

// Édition du planning d'un collaborateur — réservé au manager/admin (RLS :
// is_manager_of(utilisateur_id) or is_admin() sur planning_recurrences /
// planning_entrees, voir 0013_planning.sql). Utilisé dans la fiche détaillée
// `/manager/equipe/[id]`. Le collaborateur, lui, ne voit que `/planning` en
// lecture seule.
//
// Deux formulaires :
//   1. Horaire récurrent hebdo ("tous les lundis 8h-17h").
//   2. Entrée ponctuelle — si la date tombe sur un horaire récurrent actif,
//      elle devient automatiquement une exception (heure modifiée ou jour
//      annulé) rattachée à ce modèle ; sinon c'est une entrée indépendante
//      (horaire one-shot ou événement libre).
import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OccurrencePlanning, PlanningRecurrence } from "@/types/database";

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function plusJours(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function heureCourte(heure: string | null) {
  return heure ? heure.slice(0, 5) : "";
}

function champStyle() {
  return { padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14 };
}

function labelStyle() {
  return { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13, color: "var(--ink-2)" };
}

export default function PlanningEditor({
  utilisateurId,
  entrepriseId,
  createurId,
  recurrencesInitiales,
  occurrencesInitiales,
}: {
  utilisateurId: string;
  entrepriseId: string;
  createurId: string;
  recurrencesInitiales: PlanningRecurrence[];
  occurrencesInitiales: OccurrencePlanning[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [recurrences, setRecurrences] = useState<PlanningRecurrence[]>(recurrencesInitiales);
  const [occurrences, setOccurrences] = useState<OccurrencePlanning[]>(occurrencesInitiales);
  const [erreur, setErreur] = useState<string | null>(null);

  const rafraichir = useCallback(async () => {
    const [{ data: r }, { data: o }] = await Promise.all([
      supabase.from("planning_recurrences").select("*").eq("utilisateur_id", utilisateurId).eq("actif", true).order("jour_semaine"),
      supabase.rpc("obtenir_planning", { p_utilisateur_id: utilisateurId, p_debut: todayISO(), p_fin: plusJours(60) }),
    ]);
    setRecurrences(r ?? []);
    setOccurrences((o as OccurrencePlanning[] | null) ?? []);
  }, [supabase, utilisateurId]);

  // ---- Formulaire 1 : horaire récurrent ----
  const [rJour, setRJour] = useState(1);
  const [rDebut, setRDebut] = useState("08:00");
  const [rFin, setRFin] = useState("17:00");
  const [rLibelle, setRLibelle] = useState("");
  const [rDateDebut, setRDateDebut] = useState(todayISO());
  const [rDateFin, setRDateFin] = useState("");
  const [rEnCours, setREnCours] = useState(false);

  async function ajouterRecurrence() {
    if (rFin <= rDebut) {
      setErreur("L'heure de fin doit être après l'heure de début.");
      return;
    }
    setErreur(null);
    setREnCours(true);
    const { error } = await supabase.from("planning_recurrences").insert({
      utilisateur_id: utilisateurId,
      entreprise_id: entrepriseId,
      jour_semaine: rJour,
      heure_debut: rDebut,
      heure_fin: rFin,
      libelle: rLibelle.trim() || null,
      date_debut: rDateDebut,
      date_fin: rDateFin || null,
      createur_id: createurId,
    });
    setREnCours(false);
    if (error) {
      setErreur("Impossible d'ajouter cet horaire : " + error.message);
      return;
    }
    setRLibelle("");
    await rafraichir();
  }

  async function desactiverRecurrence(id: string) {
    setErreur(null);
    const { error } = await supabase.from("planning_recurrences").update({ actif: false }).eq("id", id);
    if (error) {
      setErreur("Impossible de désactiver cet horaire : " + error.message);
      return;
    }
    await rafraichir();
  }

  // ---- Formulaire 2 : entrée ponctuelle / exception ----
  const [eDate, setEDate] = useState(todayISO());
  const [eMode, setEMode] = useState<"horaire" | "evenement" | "annulation">("evenement");
  const [eDebut, setEDebut] = useState("08:00");
  const [eFin, setEFin] = useState("17:00");
  const [eTouteJournee, setETouteJournee] = useState(false);
  const [eTitre, setETitre] = useState("");
  const [eDescription, setEDescription] = useState("");
  const [eEnCours, setEEnCours] = useState(false);

  function recurrenceCouvrant(dateStr: string): PlanningRecurrence | null {
    const jourSemaine = new Date(dateStr + "T00:00:00").getDay();
    return (
      recurrences.find(
        (r) => r.jour_semaine === jourSemaine && r.date_debut <= dateStr && (!r.date_fin || r.date_fin >= dateStr)
      ) ?? null
    );
  }

  async function ajouterEntree() {
    setErreur(null);
    const couvrante = recurrenceCouvrant(eDate);

    if (eMode === "annulation") {
      if (!couvrante) {
        setErreur("Aucun horaire récurrent ne couvre cette date — rien à annuler.");
        return;
      }
      setEEnCours(true);
      const { error } = await supabase.from("planning_entrees").insert({
        utilisateur_id: utilisateurId,
        entreprise_id: entrepriseId,
        recurrence_id: couvrante.id,
        date: eDate,
        type: "horaire_travail",
        annule: true,
        createur_id: createurId,
      });
      setEEnCours(false);
      if (error) {
        setErreur("Impossible d'annuler cette date : " + error.message);
        return;
      }
      await rafraichir();
      return;
    }

    if (!eTouteJournee && eFin <= eDebut) {
      setErreur("L'heure de fin doit être après l'heure de début.");
      return;
    }

    setEEnCours(true);
    const { error } = await supabase.from("planning_entrees").insert({
      utilisateur_id: utilisateurId,
      entreprise_id: entrepriseId,
      // Une date qui tombe sur un horaire récurrent actif devient une
      // exception à ce modèle (heure modifiée) plutôt qu'une entrée
      // indépendante — sauf pour un événement, toujours ajouté à part.
      recurrence_id: eMode === "horaire" ? couvrante?.id ?? null : null,
      date: eDate,
      type: eMode === "evenement" ? "evenement" : "horaire_travail",
      toute_journee: eTouteJournee,
      heure_debut: eTouteJournee ? null : eDebut,
      heure_fin: eTouteJournee ? null : eFin,
      titre: eTitre.trim() || null,
      description: eDescription.trim() || null,
      createur_id: createurId,
    });
    setEEnCours(false);
    if (error) {
      setErreur("Impossible d'ajouter cette entrée : " + error.message);
      return;
    }
    setETitre("");
    setEDescription("");
    await rafraichir();
  }

  async function supprimerEntree(id: string) {
    setErreur(null);
    const { error } = await supabase.from("planning_entrees").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      setErreur("Impossible de supprimer cette entrée : " + error.message);
      return;
    }
    await rafraichir();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {erreur && (
        <div style={{ background: "#fdecea", border: "1px solid var(--urgent)", color: "var(--urgent)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
          {erreur}
        </div>
      )}

      {/* Horaires récurrents actifs */}
      <div>
        <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--navy)" }}>Horaires récurrents</h4>
        {recurrences.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0 }}>Aucun horaire récurrent défini.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {recurrences.map((r) => (
              <li key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                <span>
                  {JOURS[r.jour_semaine]} {heureCourte(r.heure_debut)}–{heureCourte(r.heure_fin)}
                  {r.libelle ? ` · ${r.libelle}` : ""}
                  <span style={{ color: "var(--ink-2)" }}>
                    {" "}
                    (depuis le {new Date(r.date_debut + "T00:00:00").toLocaleDateString("fr-FR")}
                    {r.date_fin ? ` jusqu'au ${new Date(r.date_fin + "T00:00:00").toLocaleDateString("fr-FR")}` : ""})
                  </span>
                </span>
                <button
                  onClick={() => desactiverRecurrence(r.id)}
                  style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", color: "var(--urgent)" }}
                >
                  Désactiver
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="card" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={labelStyle()}>
              Jour
              <select value={rJour} onChange={(e) => setRJour(Number(e.target.value))} style={champStyle()}>
                {JOURS.map((j, i) => (
                  <option key={i} value={i}>
                    {j}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle()}>
              Début
              <input type="time" value={rDebut} onChange={(e) => setRDebut(e.target.value)} style={champStyle()} />
            </label>
            <label style={labelStyle()}>
              Fin
              <input type="time" value={rFin} onChange={(e) => setRFin(e.target.value)} style={champStyle()} />
            </label>
            <label style={labelStyle()}>
              Libellé (optionnel)
              <input type="text" value={rLibelle} onChange={(e) => setRLibelle(e.target.value)} placeholder="Ex. Service matin" style={{ ...champStyle(), minWidth: 140 }} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={labelStyle()}>
              À partir du
              <input type="date" value={rDateDebut} onChange={(e) => setRDateDebut(e.target.value)} style={champStyle()} />
            </label>
            <label style={labelStyle()}>
              Jusqu&apos;au (optionnel)
              <input type="date" value={rDateFin} onChange={(e) => setRDateFin(e.target.value)} style={champStyle()} />
            </label>
          </div>
          <button
            onClick={ajouterRecurrence}
            disabled={rEnCours}
            style={{ alignSelf: "flex-start", padding: "7px 16px", background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: rEnCours ? "default" : "pointer", opacity: rEnCours ? 0.6 : 1 }}
          >
            Ajouter l&apos;horaire récurrent
          </button>
        </div>
      </div>

      {/* Entrées à venir (60 jours) */}
      <div>
        <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--navy)" }}>Entrées à venir (60 jours)</h4>
        {occurrences.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0 }}>Aucune entrée à venir.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
            {occurrences.map((o, i) => (
              <li key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                <span>
                  {new Date(o.jour + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}{" "}
                  <span
                    className="badge"
                    style={{
                      background: o.type === "evenement" ? "var(--accent-2-bg)" : "var(--normal-bg)",
                      color: o.type === "evenement" ? "var(--accent-2)" : "var(--normal)",
                    }}
                  >
                    {o.toute_journee ? "Journée" : `${heureCourte(o.heure_debut)}–${heureCourte(o.heure_fin)}`}
                  </span>
                  {o.titre ? ` ${o.titre}` : ""}
                </span>
                {o.entree_id && (
                  <button
                    onClick={() => supprimerEntree(o.entree_id!)}
                    style={{ background: "transparent", border: "none", color: "var(--urgent)", fontSize: 12, cursor: "pointer" }}
                  >
                    Supprimer
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="card" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={labelStyle()}>
              Date
              <input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} style={champStyle()} />
            </label>
            <label style={labelStyle()}>
              Type
              <select value={eMode} onChange={(e) => setEMode(e.target.value as typeof eMode)} style={champStyle()}>
                <option value="evenement">Événement (rendez-vous, congé…)</option>
                <option value="horaire">Horaire ponctuel / modifié</option>
                <option value="annulation">Annuler cette date (jour off)</option>
              </select>
            </label>
          </div>

          {eMode !== "annulation" && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-2)" }}>
                <input type="checkbox" checked={eTouteJournee} onChange={(e) => setETouteJournee(e.target.checked)} />
                Toute la journée
              </label>
              {!eTouteJournee && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <label style={labelStyle()}>
                    Début
                    <input type="time" value={eDebut} onChange={(e) => setEDebut(e.target.value)} style={champStyle()} />
                  </label>
                  <label style={labelStyle()}>
                    Fin
                    <input type="time" value={eFin} onChange={(e) => setEFin(e.target.value)} style={champStyle()} />
                  </label>
                </div>
              )}
              <label style={labelStyle()}>
                Titre
                <input type="text" value={eTitre} onChange={(e) => setETitre(e.target.value)} placeholder="Ex. Rendez-vous client" style={champStyle()} />
              </label>
              <label style={labelStyle()}>
                Description (optionnel)
                <textarea value={eDescription} onChange={(e) => setEDescription(e.target.value)} rows={2} style={{ ...champStyle(), resize: "vertical" }} />
              </label>
            </>
          )}

          <button
            onClick={ajouterEntree}
            disabled={eEnCours}
            style={{ alignSelf: "flex-start", padding: "7px 16px", background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: eEnCours ? "default" : "pointer", opacity: eEnCours ? 0.6 : 1 }}
          >
            {eMode === "annulation" ? "Annuler cette date" : "Ajouter l'entrée"}
          </button>
        </div>
      </div>
    </div>
  );
}
