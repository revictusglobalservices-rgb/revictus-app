// Relais e-mail des notifications (section 10) — appelé par un trigger
// Postgres (pg_net) à chaque nouvelle ligne dans `notifications` (voir
// 0009_email_notifications.sql). Protégé par un secret partagé, car cette
// route est publique (appelée depuis Supabase, pas depuis le navigateur).
//
// Envoi via le compte Gmail existant de l'entreprise (pas de nom de domaine
// propre à Revictus pour l'instant — décision du 28/08/2026) : nécessite un
// "mot de passe d'application" Google, pas le mot de passe du compte.
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const SUJETS: Record<string, string> = {
  correction_demande: "Nouvelle demande de correction — Revictus",
  correction_approuvee: "Correction approuvée — Revictus",
  correction_refusee: "Correction refusée — Revictus",
  tache_assignee: "Nouvelle tâche assignée — Revictus",
  pointage_arrivee: "Pointage d'arrivée — Revictus",
  pointage_depart: "Pointage de départ — Revictus",
  planning_modifie: "Votre planning a été mis à jour — Revictus",
  conge_demande: "Nouvelle demande de congé — Revictus",
  absence_demande: "Nouvelle absence signalée — Revictus",
  conge_ajoute: "Congé ajouté à votre planning — Revictus",
  absence_ajoute: "Absence ajoutée à votre planning — Revictus",
  conge_validee: "Congé validé — Revictus",
  conge_refusee: "Congé refusé — Revictus",
  absence_validee: "Absence validée — Revictus",
  absence_refusee: "Absence refusée — Revictus",
};

export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.NOTIFICATIONS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: { email?: string; type?: string; contenu?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "payload invalide" }, { status: 400 });
  }

  const { email, type, contenu } = payload;
  if (!email || !contenu) {
    return NextResponse.json({ error: "payload invalide" }, { status: 400 });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error("GMAIL_USER / GMAIL_APP_PASSWORD manquants dans les variables d'environnement.");
    return NextResponse.json({ error: "e-mail non configuré" }, { status: 500 });
  }

  const transporteur = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  try {
    await transporteur.sendMail({
      from: `Revictus <${process.env.GMAIL_USER}>`,
      to: email,
      subject: (type && SUJETS[type]) ?? "Notification Revictus",
      text: contenu,
    });
  } catch (error) {
    console.error("Échec envoi e-mail notification :", error);
    return NextResponse.json({ error: "envoi échoué" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
