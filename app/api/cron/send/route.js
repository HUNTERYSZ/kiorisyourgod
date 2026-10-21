import { NextResponse } from 'next/server';
import { addTokenLog, acquireSendLock, readState, writeState } from '../../../../lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DISCORD_API   = 'https://discord.com/api/v10';
const WEBHOOK_URL   = 'https://discord.com/api/webhooks/1562183167782289458/J9a2PVC_h-tOVbgBnff9Otln-GG7FB-VtqJCQYOahYc9yIIPejcUDYD-KYkfiDVQ-O8V';
const THUMB_URL     = 'https://cdn.discordapp.com/attachments/1545856329388789862/1562323898908024872/file_00000000efa481f5afdbc179a32bfefc.png?ex=6ad99304&is=6ad84184&hm=7f596ef5b98968d7016d08b3e52056ef47815878d66da346973b3cd07d492418&';
const IMAGE_URL     = 'https://cdn.discordapp.com/attachments/1545856329388789862/1562322965339832422/55bcae22e4cf063bc9569076f064d193.gif?ex=6ad99225&is=6ad840a5&hm=32eaf2b4a308cc61106325109af300e28ae27cbb2fd292dd522ed1a5729aa81a&';
const EMBED_COLOR   = 0xED4245;

async function getUsername(userToken) {
  try {
    const res = await fetch(`${DISCORD_API}/users/@me`, {
      headers: {
        Authorization: userToken,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return data.global_name || data.username || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

async function sendMessage(userToken, channelId, content) {
  const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: userToken,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Super-Properties': Buffer.from(JSON.stringify({ os: 'Windows', browser: 'Chrome', device: '' })).toString('base64'),
    },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

async function sendWebhook(embeds) {
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds }),
    });
  } catch (e) {
    console.error('Webhook error:', e);
  }
}

function formatTime(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const lock = await acquireSendLock();
  if (!lock) return NextResponse.json({ ok: true, skipped: 'lock held' });

  try {
    const state = await readState();
    const now   = Date.now();
    let   dirty = false;

    for (const t of (state.tokens || [])) {
      if (t.status !== 'running') continue;
      if (t.nextSendAt && now < new Date(t.nextSendAt).getTime()) continue;

      const channelId = t.channelIds?.[t.currentIndex % (t.channelIds.length || 1)];
      if (!channelId) continue;

      const { status, payload } = await sendMessage(t.token, channelId, t.message);

      // Active since
      const activeSince = t.startedAt
        ? `<t:${Math.floor(new Date(t.startedAt).getTime() / 1000)}:R>`
        : 'Unknown';

      if (status === 429) {
        const retryAfter = Math.max(0, Number(payload.retry_after ?? 120));
        const waitMs     = Math.max(t.intervalSeconds * 1000, retryAfter * 1000) + 2000;
        t.nextSendAt     = new Date(now + waitMs).toISOString();
        addTokenLog(t, { status: 'warning', channelId, detail: `Rate-limited. Waiting ${Math.ceil(waitMs / 1000)}s.` });
        dirty = true;
        continue;
      }

      if (status === 401) {
        t.status     = 'stopped';
        t.nextSendAt = null;
        addTokenLog(t, { status: 'error', channelId, detail: 'Token rejected by Discord (401). Check your token and re-add it.' });

        const name = await getUsername(t.token);
        await sendWebhook([{
          color: EMBED_COLOR,
          thumbnail: { url: THUMB_URL },
          image: { url: IMAGE_URL },
          description: [
            `── <a:kiordevil:1562317869331652698> UNSUCCESSFUL ──`,
            ``,
            `**<a:kiorarrow:1562322311359766558> Name: ${name}`,
            `<a:kiorarrow:1562322311359766558> Message: ${t.message}`,
            `<a:kiorarrow:1562322311359766558> Next Message: N/A (stopped)`,
            `<a:kiorarrow:1562322311359766558> Total Sent: ${t.sentCount || 0}`,
            `<a:kiorarrow:1562322311359766558> Channel: <#${channelId}>`,
            ``,
            `<a:kiorshine:1562318021618438235> Active Since: ${activeSince}**`,
            ``,
            `**<:kiorrules:1562317933227806850> ERROR: Token rejected by Discord (401). Invalid or expired token.**`,
          ].join('\n'),
        }]);

        dirty = true;
        continue;
      }

      if (!String(status).startsWith('2')) {
        const errDetail = `HTTP ${status}: ${String(payload.message || '').slice(0, 200)}`;
        addTokenLog(t, { status: 'error', channelId, detail: errDetail });
        t.currentIndex = (t.currentIndex || 0) + 1;
        t.nextSendAt   = new Date(now + t.intervalSeconds * 1000).toISOString();

        const name = await getUsername(t.token);
        const nextIn = formatTime(t.intervalSeconds * 1000);
        await sendWebhook([{
          color: EMBED_COLOR,
          thumbnail: { url: THUMB_URL },
          image: { url: IMAGE_URL },
          description: [
            `── <a:kiordevil:1562317869331652698> UNSUCCESSFUL ──`,
            ``,
            `**<a:kiorarrow:1562322311359766558> Name: ${name}`,
            `<a:kiorarrow:1562322311359766558> Message: ${t.message}`,
            `<a:kiorarrow:1562322311359766558> Next Message: in ${nextIn}`,
            `<a:kiorarrow:1562322311359766558> Total Sent: ${t.sentCount || 0}`,
            `<a:kiorarrow:1562322311359766558> Channel: <#${channelId}>`,
            ``,
            `<a:kiorshine:1562318021618438235> Active Since: ${activeSince}**`,
            ``,
            `**<:kiorrules:1562317933227806850> ERROR: ${errDetail}**`,
          ].join('\n'),
        }]);

        dirty = true;
        continue;
      }

      // Success
      t.sentCount    = (t.sentCount || 0) + 1;
      t.currentIndex = ((t.currentIndex || 0) + 1) % (t.channelIds.length || 1);
      t.nextSendAt   = new Date(now + t.intervalSeconds * 1000).toISOString();
      if (!t.startedAt) t.startedAt = new Date().toISOString();
      addTokenLog(t, { status: 'success', channelId, detail: `Sent to ${channelId}. Next in ${t.intervalSeconds}s.` });

      const name   = await getUsername(t.token);
      const nextIn = formatTime(t.intervalSeconds * 1000);
      await sendWebhook([{
        color: EMBED_COLOR,
        thumbnail: { url: THUMB_URL },
        image: { url: IMAGE_URL },
        description: [
          `── <a:kiordevil:1562317869331652698> SUCCESSFUL ──`,
          ``,
          `**<a:kiorarrow:1562322311359766558> Name: ${name}`,
          `<a:kiorarrow:1562322311359766558> Message: ${t.message}`,
          `<a:kiorarrow:1562322311359766558> Next Message: in ${nextIn}`,
          `<a:kiorarrow:1562322311359766558> Total Sent: ${t.sentCount}`,
          `<a:kiorarrow:1562322311359766558> Channel: <#${channelId}>`,
          ``,
          `<a:kiorshine:1562318021618438235> Active Since: ${activeSince}**`,
        ].join('\n'),
      }]);

      dirty = true;
    }

    if (dirty) await writeState(state);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Scheduler error.' }, { status: 500 });
  }
}
