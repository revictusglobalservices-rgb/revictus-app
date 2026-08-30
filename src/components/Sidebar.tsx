"use client";

// Barre latérale de navigation partagée (refonte visuelle du 29/08/2026,
// alignée sur la maquette fournie par Angelo). Remplace TopNav pour les
// pages du groupe de routes (app) — TopNav reste en place, inutilisé, au
// cas où une page hors de ce groupe en aurait encore besoin.
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RoleUtilisateur } from "@/types/database";

function IconeAccueil() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}
function IconePointage() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}
function IconeChrono() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2h6" />
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2" />
    </svg>
  );
}
function IconeKanban() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M9 4v17M15 4v17" />
    </svg>
  );
}
function IconeCorrections() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function IconePlanning() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}
function IconePlanningEquipe() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 10h18" />
      <circle cx="8" cy="15" r="1.6" />
      <circle cx="16" cy="15" r="1.6" />
    </svg>
  );
}

export default function Sidebar({ nom, role }: { nom: string; role: RoleUtilisateur }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const accueil = role === "collaborateur" ? "/dashboard" : "/manager";

  const liens = [
    { href: accueil, label: "Tableau de bord", icone: <IconeAccueil /> },
    { href: "/pointage", label: "Pointage", icone: <IconePointage /> },
    { href: "/planning", label: role === "collaborateur" ? "Planning" : "Mon planning", icone: <IconePlanning /> },
    ...(role !== "collaborateur" ? [{ href: "/manager/planning", label: "Planning équipe", icone: <IconePlanningEquipe /> }] : []),
    { href: "/chrono", label: "Chrono", icone: <IconeChrono /> },
    { href: "/kanban", label: "Kanban", icone: <IconeKanban /> },
    { href: "/corrections", label: "Corrections", icone: <IconeCorrections /> },
  ];

  function estActif(href: string) {
    if (href === accueil) return pathname === "/dashboard" || pathname === "/manager" || pathname.startsWith("/manager/equipe");
    if (href === "/planning") return pathname === "/planning";
    return pathname.startsWith(href);
  }

  async function seDeconnecter() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      style={{
        width: 232,
        flexShrink: 0,
        background: "var(--sidebar-bg)",
        color: "var(--sidebar-text)",
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
      }}
    >
      <div style={{ padding: "22px 20px", borderBottom: "1px solid var(--sidebar-border)" }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: 0.3 }}>Revictus</span>
      </div>

      <nav style={{ flex: 1, padding: "14px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {liens.map((lien) => {
          const actif = estActif(lien.href);
          return (
            <a
              key={lien.href}
              href={lien.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: actif ? 600 : 500,
                color: actif ? "var(--sidebar-text-active)" : "var(--sidebar-text)",
                background: actif ? "var(--sidebar-bg-hover)" : "transparent",
                textDecoration: "none",
              }}
            >
              {lien.icone}
              {lien.label}
            </a>
          );
        })}
      </nav>

      <div style={{ padding: "14px 12px", borderTop: "1px solid var(--sidebar-border)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 4px" }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--accent)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {nom.slice(0, 1).toUpperCase()}
          </span>
          <span style={{ fontSize: 13, color: "var(--sidebar-text-active)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nom}
          </span>
        </div>
        <button
          onClick={seDeconnecter}
          style={{
            background: "transparent",
            border: "1px solid var(--sidebar-border)",
            borderRadius: 6,
            padding: "7px 10px",
            fontSize: 12,
            cursor: "pointer",
            color: "var(--sidebar-text)",
          }}
        >
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
