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
- `src/app/` — connexion (Google SSO ; Microsoft écarté pour le MVP, ajoutable plus tard),
  callback OAuth, les deux tableaux de bord (collaborateur / manager, section 9) branchés
  sur les données réelles, et les écrans Kanban, Chrono et Pointage (section 4/5/7).
- `src/types/database.ts` — types écrits à la main, incluant les fonctions RPC serveur
  (pointage, chrono) qui évitent tout écart d'horloge client/serveur.

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

## Ce qui reste à faire

- Microsoft SSO (écarté du MVP, décision du 27/08/2026) — ajoutable en suivant la même
  procédure que Google (Azure AD app + provider Supabase). Callback OAuth à renseigner
  dans l'app Azure : `https://qrvnqryjhvadwrkkluyg.supabase.co/auth/v1/callback` (le
  bouton « Continuer avec Microsoft » existe déjà côté front, `src/app/login/page.tsx`).
  Tentative du 29/08/2026 : le compte Microsoft personnel utilisé n'a pas de tenant
  Azure AD, et l'inscription au Microsoft 365 Developer Program a été refusée (« vous ne
  remplissez pas les conditions pour un abonnement sandbox », raison non précisée par
  Microsoft). Deux pistes pour la prochaine tentative : inscription Azure classique
  (peut demander une carte pour vérification d'identité, même si l'usage reste gratuit),
  ou réessayer avec un autre compte Microsoft.
- Canaux de notification push/Slack-Teams/WhatsApp (le canal `whatsapp` existe dans
  l'énum mais n'est pas branché — écarté pour l'instant, décision du 28/08/2026).

## Fait depuis les fondations

- Vue détaillée par collaborateur côté manager (`/manager/equipe/[id]`) : chrono actif,
  temps travaillé sur 14 jours, compteurs de tâches, historique de pointage, tâches en
  cours, demandes de correction récentes.
- Notifications (section 10) : émission automatique par triggers SQL (demande/statut de
  correction, tâche assignée, pointage d'arrivée et de départ — décision du 29/08/2026)
  sur les canaux in-app (cloche avec mise à jour en direct via Supabase Realtime, clic =
  redirection vers la page concernée) et e-mail (Gmail SMTP via pg_net). Le pointage
  (arrivée comme départ) notifie le manager direct du collaborateur (ou tous les admins
  s'il n'en a pas), avec un lien direct vers sa fiche détaillée.
- Refonte visuelle en cours (maquette du 29/08/2026) : sidebar de navigation + groupe de
  routes `(app)` livrés (phase 1). Restylage détaillé de chaque écran (cartes, badges,
  etc.) à venir.
- Planning / agenda par collaborateur (décision du 30/08/2026) : horaires de travail
  récurrents (hebdo, avec exceptions par date : heure modifiée ou jour annulé sans toucher
  au modèle général) + événements ponctuels (rendez-vous, congé...). Le collaborateur voit
  son planning en lecture seule ; seul son manager ou un admin le modifie, depuis sa fiche
  détaillée (`/manager/equipe/[id]`). Notifié comme le pointage (in-app + e-mail) à chaque
  création/modification. Recomposition récurrences + exceptions faite côté base par
  `obtenir_planning()` (0013_planning.sql) — le front n'y touche pas.
- Refonte visuelle du planning (maquettes du 30/08/2026, décision : relooker le planning
  d'abord, congés/absences/événements dédiés ensuite) : chaque horaire porte désormais une
  catégorie explicite (matin/après-midi/journée/soir/télétravail/formation —
  `categorie_planning`, 0014_planning_categorie.sql) qui pilote la couleur d'affichage.
  Vue collaborateur (`/planning`) en grille semaine sans axe horaire par défaut (bascule
  vue mois conservée) — les tâches n'y apparaissent jamais, les événements ponctuels sont
  volontairement sortis de la grille et listés à part sous "Événements à venir" (règle UX :
  le planning répond à "quand est-ce que je travaille ?", pas "qu'est-ce qui est prévu ?").
  Nouvelle vue manager `/manager/planning` : grille équipe (une ligne par collaborateur,
  une colonne par jour), lecture seule — la modification reste sur la fiche détaillée de
  chaque collaborateur pour ne pas dupliquer l'éditeur.
- Sélection multi-jours pour l'horaire récurrent (30/08/2026) : dans l'éditeur de planning,
  le champ Jour est remplacé par des cases à cocher (+ raccourcis Lun-Ven / Tous les jours) —
  un horaire identique sur plusieurs jours se saisit en un seul ajout, plutôt qu'un par jour.
- Horaires de nuit (30/08/2026) : un horaire récurrent ou ponctuel peut désormais avoir une
  heure de fin plus petite que l'heure de début (ex. 17h-01h) — ça signifie qu'il se termine
  le lendemain (0015_planning_horaire_nuit.sql, seule contrainte restante : début ≠ fin). Le
  calcul des heures cumulées côté `/manager/planning` gère ce passage de minuit.
- Congés / absences (30/08/2026, phase suivante après la refonte visuelle) : table dédiée
  `conges_absences` (0016_conges_absences.sql — nature congé/absence, type par
  nature, statut en_attente/validee/refusee, pas de solde de jours pour l'instant). Chacun
  peut demander un congé ou signaler une absence pour lui-même (`/conges`, reste en attente
  tant que non traité) ; le manager/admin valide/refuse (RPC `valider_conge_absence` /
  `refuser_conge_absence`, horodatage + auteur de la décision) ou ajoute directement une
  entrée déjà validée, depuis la fiche du collaborateur (`CongesEditor`) ou la vue globale
  `/manager/conges`. Les congés/absences validés remplacent l'affichage "Repos"/horaires
  dans les grilles de planning (`/planning`, `/manager/planning`) le temps de la période, et
  ne comptent plus dans les heures prévues. Notifié comme le reste (in-app + e-mail) à
  chaque demande et décision.
- Kanban — panneau de tâche complet (30/08/2026, phase 1 de l'amélioration du Kanban) : cliquer sur une carte ouvre un panneau détaillé (titre, description, échéance avec badge "En retard", assigné et priorité modifiables, commentaires). Un commentaire peut taguer une ou plusieurs personnes (chips, pas de parsing "@Nom") — la personne taguée reçoit une notification (in-app + e-mail, `mentions` sur `commentaires`, 0017_kanban_mentions.sql) avec lien direct vers la tâche. Assignation et échéance dès la création rapide d'une tâche. Gestion des colonnes réservée à l'admin (renommer, réordonner, ajouter, supprimer — bloqué si la colonne contient encore des tâches). Restent pour une phase future, à la demande explicite : pièces jointes (nécessite Supabase Storage, pas encore en place) et "espaces de travail" Kanban (plusieurs tableaux distincts avec partage, façon Trello/Asana — pour l'instant un seul tableau par entreprise).

## Purge automatique (soft delete, 45 jours)

`supabase/migrations/0007_purge_soft_delete.sql` crée la fonction `purger_soft_delete()`
qui supprime définitivement les lignes soft-deletées depuis plus de 45 jours (prudente :
une ligne encore référencée ailleurs est simplement retentée au passage suivant, rien
n'est jamais supprimé en cascade silencieusement). Pour la planifier :

1. Dashboard Supabase → **Database** → **Extensions** → activer **pg_cron**.
2. Dans le SQL Editor, exécuter :
   ```sql
   select cron.schedule(
     'purge-soft-delete-45j',
     '0 3 * * *',
     $$select public.purger_soft_delete();$$
   );
   ```
3. Vérifier : `select * from cron.job;`

## Décisions de cadrage tranchées après les fondations

- **Disponibilité (section 8)** — décision du 27/08/2026 : pas d'objectif chiffré (SLA)
  pour le MVP, vu la taille de l'équipe (5 personnes) et l'infra (Vercel + Supabase). À
  revoir si l'usage grandit.
- **Procédure incident (section 8)** — décision du 27/08/2026 : pas de notification
  automatique ; le gérant est informé (via les dashboards Vercel/Supabase) et prévient
  l'équipe directement (WhatsApp/appel). Pas d'outil de monitoring/alerting à mettre en
  place pour l'instant.
- **Responsive (section 14)** — décision du 27/08/2026 : Desktop prioritaire, Mobile
  utilisable mais moins peaufiné.
- **Priorisation des cas de test** — décision du 27/08/2026 : pas de plan de test formel ;
  l'équipe (Larissa, Yacinthe, Alain, Prisca) teste au fil de l'usage réel et remonte les
  problèmes au gérant.
