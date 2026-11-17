-- Schedules the evening Telegram digest at 8:00 pm IST (14:30 UTC) every day.
-- 1. Deploy the function:  supabase functions deploy daily-digest --no-verify-jwt
-- 2. Set secrets:           supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... DIGEST_SECRET=<any long random text>
-- 3. Enable pg_cron and pg_net (Database → Extensions), then run this with your values filled in.
select cron.unschedule('np-daily-digest') where exists (select 1 from cron.job where jobname = 'np-daily-digest');
select cron.schedule('np-daily-digest', '30 14 * * *', $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/daily-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-digest-secret', 'SAME-DIGEST-SECRET-AS-ABOVE'),
    body := '{}'::jsonb
  );
$$);
