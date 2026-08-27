"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function TopNav({ nom }: { nom: string }) {
  const router = useRouter();
  const supabase = createClient();

  async function seDeconnecter() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <span style={{ fontSize: 14, color: "var(--ink-2)" }}>{nom}</span>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <a href="/pointage" style={{ fontSize: 14, color: "var(--navy)", fontWeight: 600 }}>
          Pointage
        </a>
        <a href="/chrono" style={{ fontSize: 14, color: "var(--navy)", fontWeight: 600 }}>
          Chrono
        </a>
        <a href="/kanban" style={{ fontSize: 14, color: "var(--navy)", fontWeight: 600 }}>
          Kanban
        </a>
        <a href="/corrections" style={{ fontSize: 14, color: "var(--navy)", fontWeight: 600 }}>
          Corrections
        </a>
        <button
          onClick={seDeconnecter}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 13,
            cursor: "pointer",
            color: "var(--ink-2)",
          }}
        >
          Déconnexion
        </button>
      </div>
    </div>
  );
}
