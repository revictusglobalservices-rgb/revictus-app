// Disposition partagée des pages applicatives (groupe de routes (app) —
// n'affecte pas les URLs, voir doc Next.js). Ajouté le 29/08/2026 pour la
// refonte visuelle (maquette fournie par Angelo) : barre latérale de
// navigation + en-tête léger, sans toucher au contenu ni aux données des
// pages existantes. Le profil (nom, rôle) est lu une fois ici pour la
// sidebar ; chaque page continue de faire ses propres requêtes pour ses
// données métier, inchangées.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import NotificationsBell from "@/components/NotificationsBell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase.from("utilisateurs").select("nom, role").eq("id", user.id).single();
  if (!profil) redirect("/login");

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--app-bg)" }}>
      <Sidebar nom={profil.nom} role={profil.role} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            height: 60,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 32px",
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <NotificationsBell currentUserId={user.id} />
        </header>
        <div style={{ flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
