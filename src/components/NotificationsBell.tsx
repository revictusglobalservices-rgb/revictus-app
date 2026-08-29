"use client";

// Cloche de notifications in-app (section 10) — émises côté serveur via des
// triggers (voir 0008_notifications.sql) sur les demandes/statuts de
// correction et les tâches assignées. Les canaux e-mail/push/Slack-Teams/
// WhatsApp restent à brancher plus tard (voir README).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { NotificationRevictus } from "@/types/database";

function formatRelatif(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  return `il y a ${jours} j`;
}

export default function NotificationsBell({ currentUserId }: { currentUserId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRevictus[]>([]);
  const [ouvert, setOuvert] = useState(false);

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("destinataire_id", currentUserId)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications(data ?? []);
  }, [supabase, currentUserId]);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let annule = false;

    // Le client Supabase créé côté navigateur (cookies, via @supabase/ssr)
    // ne pousse pas toujours automatiquement le token d'auth vers le canal
    // Realtime : l'abonnement passe bien en statut SUBSCRIBED, mais côté
    // serveur auth.uid() reste nul pour ce websocket, donc la RLS
    // (destinataire_id = auth.uid()) bloque silencieusement tous les
    // évènements — la cloche ne se mettait à jour qu'après un rafraîchissement
    // de page (qui relit les notifications via une requête REST classique,
    // authentifiée normalement). Bug diagnostiqué le 29/08/2026 avec un
    // abonnement de test : identique mais avec `realtime.setAuth(token)`
    // appelé avant `.subscribe()`, les évènements arrivaient bien en direct.
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        await supabase.realtime.setAuth(data.session.access_token);
      }
      if (annule) return;

      channel = supabase
        .channel(`notifications-${currentUserId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: `destinataire_id=eq.${currentUserId}` },
          () => charger()
        )
        .subscribe();
    })();

    // Si le token est rafraîchi pendant que la cloche est montée, on
    // repropage aussi le nouveau token vers Realtime.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
    });

    return () => {
      annule = true;
      subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, currentUserId, charger]);

  const nonLues = notifications.filter((n) => !n.lu);

  async function marquerLue(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, lu: true } : n)));
    await supabase.from("notifications").update({ lu: true }).eq("id", id);
  }

  function ouvrirNotification(n: NotificationRevictus) {
    if (!n.lu) marquerLue(n.id);
    setOuvert(false);
    if (n.lien) router.push(n.lien);
  }

  async function toutMarquerLu() {
    const ids = nonLues.map((n) => n.id);
    if (ids.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, lu: true })));
    await supabase.from("notifications").update({ lu: true }).in("id", ids);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOuvert((o) => !o)}
        aria-label="Notifications"
        style={{
          position: "relative",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "6px 10px",
          fontSize: 14,
          cursor: "pointer",
          color: "var(--navy)",
          lineHeight: 1,
        }}
      >
        🔔
        {nonLues.length > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "var(--urgent)",
              color: "#fff",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              minWidth: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
            }}
          >
            {nonLues.length}
          </span>
        )}
      </button>

      {ouvert && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setOuvert(false)} />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 8px)",
              width: 320,
              maxHeight: 400,
              overflowY: "auto",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              zIndex: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>Notifications</span>
              {nonLues.length > 0 && (
                <button
                  onClick={toutMarquerLu}
                  style={{ background: "transparent", border: "none", color: "var(--navy)", fontSize: 12, cursor: "pointer" }}
                >
                  Tout marquer comme lu
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p style={{ padding: 14, color: "var(--ink-2)", fontSize: 13 }}>Aucune notification.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => ouvrirNotification(n)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    background: n.lu ? "transparent" : "rgba(31, 58, 95, 0.06)",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--ink)",
                  }}
                >
                  <p style={{ margin: 0 }}>{n.contenu}</p>
                  <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{formatRelatif(n.created_at)}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
