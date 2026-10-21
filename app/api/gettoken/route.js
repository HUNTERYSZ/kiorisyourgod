// app/api/gettoken/route.js — Next.js 14 App Router, Node.js runtime
// Changes from original:
//   1. Fetches X-Fingerprint from /experiments before login (main fix)
//   2. Fuller X-Super-Properties blob matching Chrome 128
//   3. Captcha response detected and surfaced with a specific error code
//   4. Error message extraction covers data.errors.login path

import { NextResponse } from 'next/server';
import { isAuthorized } from '../../../lib/auth';

export const runtime = 'nodejs';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0.6613.120 Safari/537.36';

const SUPER_PROPS = Buffer.from(
  JSON.stringify({
    os: 'Windows',
    browser: 'Chrome',
    device: '',
    system_locale: 'en-US',
    browser_user_agent: BROWSER_UA,
    browser_version: '128.0.6613.120',
    os_version: '10',
    referrer: '',
    referring_domain: '',
    referrer_current: '',
    referring_domain_current: '',
    release_channel: 'stable',
    client_build_number: 335987,
    client_event_source: null,
  })
).toString('base64');

const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': BROWSER_UA,
  'X-Super-Properties': SUPER_PROPS,
  'X-Discord-Locale': 'en-US',
  'X-Discord-Timezone': 'America/New_York',
  Origin: 'https://discord.com',
  Referer: 'https://discord.com/login',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

async function getFingerprint() {
  try {
    const r = await fetch('https://discord.com/api/v10/experiments', {
      headers: { 'User-Agent': BROWSER_UA },
    });
    if (!r.ok) return null;
    const d = await r.json().catch(() => ({}));
    return d.fingerprint ?? null;
  } catch {
    return null;
  }
}

export async function POST(request) {
  if (!isAuthorized(request))
    return NextResponse.json({ error: 'Please log in.' }, { status: 401 });

  try {
    const { email, password } = await request.json();
    if (!email || !password)
      return NextResponse.json({ error: 'Email and password required.' }, { status: 400 });

    const fingerprint = await getFingerprint();
    const loginHeaders = { ...BASE_HEADERS };
    if (fingerprint) loginHeaders['X-Fingerprint'] = fingerprint;

    const r = await fetch('https://discord.com/api/v10/auth/login', {
      method: 'POST',
      headers: loginHeaders,
      body: JSON.stringify({
        login: email,
        password,
        undelete: false,
        login_source: null,
        gift_code_sku_id: null,
      }),
    });

    const data = await r.json().catch(() => ({}));

    if (data.token) return NextResponse.json({ token: data.token });
    if (data.mfa)   return NextResponse.json({ mfa: true, ticket: data.ticket });

    // Captcha — server-side can't solve it; tell the UI to offer popup path
    if (data.captcha_key)
      return NextResponse.json({ captcha: true }, { status: 429 });

    const msg =
      data.message ||
      data.errors?.login?._errors?.[0]?.message ||
      'Login failed. Check your credentials.';
    return NextResponse.json({ error: msg }, { status: 400 });

  } catch (e) {
    return NextResponse.json({ error: e.message || 'Request failed.' }, { status: 500 });
  }
}
