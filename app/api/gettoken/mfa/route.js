import { NextResponse } from 'next/server';
import { isAuthorized } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  try {
    const { code, ticket } = await request.json();
    if (!code || !ticket) return NextResponse.json({ error: 'Code and ticket required.' }, { status: 400 });

    const r = await fetch('https://discord.com/api/v10/auth/mfa/totp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ code: code.replace(/\s/g, ''), ticket }),
    });

    const data = await r.json().catch(() => ({}));
    if (data.token) return NextResponse.json({ token: data.token });
    return NextResponse.json({ error: data.message || 'Invalid MFA code.' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Request failed.' }, { status: 500 });
  }
}
