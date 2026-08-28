-- Relais e-mail des notifications (section 10) — à chaque nouvelle ligne
-- dans `notifications`, un appel HTTP asynchrone (pg_net, ne bloque pas
-- l'insertion) est envoyé vers l'application, qui envoie l'e-mail via le
-- compte Gmail de l'entreprise (voir src/app/api/notifications/email/route.ts).
--
-- Prérequis avant d'exécuter ce fichier :
--   1. Dashboard Supabase → Database → Extensions → activer "pg_net".
--   2. Dans Vercel (Project Settings → Environment Variables), ajouter :
--        GMAIL_USER = revictusglobalservices@gmail.com
--        GMAIL_APP_PASSWORD = <mot de passe d'application Google>
--        NOTIFICATIONS_WEBHOOK_SECRET = f92db8973678b67bada1f6fc3c733009e855ec823697c164ac86e48661408bd9
--      (le même secret que ci-dessous — ne pas le communiquer en dehors de
--      Vercel/Supabase, il protège la route contre un envoi d'e-mail abusif
--      par un tiers qui la découvrirait).

create or replace function public.envoyer_email_notification()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  select email into v_email from utilisateurs where id = new.destinataire_id;
  if v_email is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://revictus-app.vercel.app/api/notifications/email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'f92db8973678b67bada1f6fc3c733009e855ec823697c164ac86e48661408bd9'
    ),
    body := jsonb_build_object(
      'email', v_email,
      'type', new.type,
      'contenu', new.contenu
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_envoyer_email_notification on notifications;
create trigger trg_envoyer_email_notification
after insert on notifications
for each row execute function public.envoyer_email_notification();
