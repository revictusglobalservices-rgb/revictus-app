# Revictus — fondations techniques

Généré à partir du cadrage fonctionnel validé le 27/08/2026. Stack retenue (section 14) :
**Next.js** (front/full-stack) + **Vercel** (hébergement) + **Supabase** (auth, base, RLS, temps réel).

## Ce que contient ce squelette

- `supabase/migrations/` — le schéma complet (10 tables + enums), les fonctions RLS, et
  30 politiques de sécurité qui traduisent directement les décisions du cadrage :
  collaborateur → ses données uniquement · manager → lecture **et** modification sur son
  équipe · admin → tout son entreprise · intégrations backend (IA, Airtable...) → clé de
  service, hors RLS. **Déjà testé** : les trois fichiers s'appliquent sans erreur sur
  PostgreSQL 16 (schéma, fonctions, policies).
- `src/lib/supabase/` — trois clients : navigateur, serveur (session utilisateur), et
  service (clé de service, jamais exposée au client — voir le commentaire dans
  `service.ts`).
- `src/middleware.ts` — rafraîchit la session à chaque requête et redirige vers `/login`
  si non connecté.
- `src/app/` — connexion (e-mail/mot de passe + Google/Microsoft SSO), callback OAuth, et
  les deux tableaux de bord validés en section 9 (collaborateur / manager), en placeholders
  prêts à être branchés sur les tables réelles.
- `src/types/database.ts` — types de départ, écrits à la main pour les tables principales.

## Démarrer

```bash
npm install
cp .env.example .env.local   # renseigner avec les clés du projet Supabase
```

### 1. Créer le projet Supabase

Créer un projet sur [supabase.com](https://supabase.com), puis appliquer les migrations
dans l'ordre (SQL Editor du dashboard, ou CLI Supabase) :

```bash
supabase link --project-ref <votre-ref>
supabase db push   # ou : coller le contenu des 3 fichiers, dans l'ordre, dans le SQL Editor
```

Activer ensuite Google et Microsoft comme providers OAuth dans
Authentication → Providers, et créer la première entreprise + le premier compte admin
(à la main dans la table `entreprises` / `utilisateurs`, ou via un script — l'auto-inscription
n'est pas prévue, les comptes se créent uniquement par invitation admin).

### 2. Générer les types définitifs

```bash
npx supabase gen types typescript --project-id <votre-ref> > src/types/database.ts
```

### 3. Lancer en local

```bash
npm run dev
```

### 4. Déployer

Connecter le repo à Vercel, renseigner les 3 variables d'environnement
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
dans Project Settings → Environment Variables. Correspond à la section 14 du cadrage
(Local → Préproduction → Production).

## Ce qui reste à faire (hors fondations)

- Écrans Kanban (glisser-déposer), chrono, formulaires de pointage — l'essentiel de
  l'UI, à construire par-dessus ces routes.
- Synchronisation temps réel (section 8) via Supabase Realtime sur `taches`, `pointages`,
  `sessions_temps` — latence visée < 10 s.
- Job planifié de purge des lignes en soft delete après 45 jours (`deleted_at < now() -
  interval '45 days'`) — via une Edge Function Supabase planifiée (`pg_cron`) ou un cron
  Vercel.
- Notifications (section 10) : la table existe, il manque l'émission (via la clé de
  service) et les canaux e-mail/push/Slack-Teams/WhatsApp.
- Les deux décisions encore ouvertes du cadrage (objectif de disponibilité, priorisation
  des cas de test) — voir le document de cadrage, section « Décisions ouvertes ».
