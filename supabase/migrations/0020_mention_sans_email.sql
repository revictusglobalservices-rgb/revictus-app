-- Mention en commentaire : pas d'e-mail, seulement la cloche in-app (décision
-- du 02/09/2026, demande d'Angelo). Jusqu'ici le trigger générique
-- `envoyer_email_notification()` (0009_email_notifications.sql) envoyait un
-- e-mail pour TOUTE notification insérée, quel que soit `canal` — une mention
-- (type 'tache_mention', 0017_kanban_mentions.sql) déclenchait donc un e-mail
-- (avec un sujet générique faute d'entrée dans SUJETS côté route API). La
-- cloche, elle, fonctionnait déjà : NotificationsBell.tsx est générique et ne
-- filtre pas par type — pas besoin d'y toucher.
--
-- Changement ciblé : seul le type 'tache_mention' saute l'envoi d'e-mail.
-- Les autres notifications gardent leur comportement actuel (in-app + e-mail).

create or replace function public.envoyer_email_notification()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  if new.type = 'tache_mention' then
    return new;
  end if;

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
