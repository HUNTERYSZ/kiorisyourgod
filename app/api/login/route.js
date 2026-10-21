import { NextResponse } from 'next/server';
import { createSessionCookie, verifyPassword } from '../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      return NextResponse.json({ error: 'Dashboard authentication is not configured. Set ADMIN_PASSWORD and a SESSION_SECRET of at least 32 characters.' }, { status: 503 });
    }
    const body = await request.json();
    if (!verifyPassword(body.password)) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true });
    response.headers.append('Set-Cookie', createSessionCookie());
    return response;
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Login failed.' }, { status: 500 });
  }
}
