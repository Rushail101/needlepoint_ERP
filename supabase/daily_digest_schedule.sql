-- Schedules the evening Telegram digest at 8:00 pm IST (14:30 UTC) every day.
-- 1. Deploy the function:  supabase functions deploy ops-daily-digest --no-verify-jwt
-- 2. Set secrets:           supabase secrets set NP_TELEGRAM_BOT_TOKEN=... NP_TELEGRAM_CHAT_ID=... NP_DIGEST_SECRET=<any long random text>
-- 3. Enable pg_cron and pg_net (Database → Extensions), then run this with your values filled in.
select cron.unschedule('np-ops-daily-digest') where exists (select 1 from cron.job where jobname = 'np-ops-daily-digest');
select cron.schedule('np-ops-daily-digest', '30 14 * * *', $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/ops-daily-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-digest-secret', 'SAME-AS-NP_DIGEST_SECRET'),
    body := '{}'::jsonb
  );
$$);
