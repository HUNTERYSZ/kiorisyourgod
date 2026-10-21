# Kior Discord Message Scheduler

A Vercel-ready Next.js dashboard for scheduling repeated Discord messages across multiple user tokens. Settings and state are stored in Upstash Redis. The browser does **not** need to stay open — an external scheduler calls the send endpoint on a timer.

---

## How it works

1. You add one or more Discord user tokens in the dashboard, each with a message, a list of channel IDs, and a send interval.
2. You click **Start** to mark tokens as running.
3. An external scheduler (cron-job.org, GitHub Actions, or EasyCron) calls `GET /api/cron/send` on a fixed interval (e.g. every 2 minutes).
4. Each call checks Redis state, sends any messages whose `nextSendAt` time has passed, and updates state. Tokens that are stopped or not yet due are skipped.

Vercel Hobby cron is set to `0 0 * * *` (midnight UTC, once per day) as a fallback only. **The external scheduler is what drives continuous sending.**

---

## Deploy to Vercel

1. Push this folder to a GitHub repository and import it into Vercel.
2. Create an [Upstash Redis](https://upstash.com) database. Copy the REST URL and REST token.
3. In Vercel → Project Settings → Environment Variables, add every variable from `.env.example`:

   | Variable | Description |
   |---|---|
   | `ADMIN_PASSWORD` | Dashboard login password |
   | `SESSION_SECRET` | At least 32 random characters |
   | `UPSTASH_REDIS_REST_URL` | From Upstash console |
   | `UPSTASH_REDIS_REST_TOKEN` | From Upstash console |
   | `CRON_SECRET` | Long random string — used to authenticate the scheduler |

   **Never prefix secrets with `NEXT_PUBLIC_`.** That would expose them in the browser bundle.

4. Deploy. Open the deployment URL and log in with `ADMIN_PASSWORD`.

---

## Setting up the external scheduler

The send endpoint is:

```
GET https://your-deployment.vercel.app/api/cron/send
Authorization: Bearer <your CRON_SECRET value>
```

Set the scheduler to call it **every 1–2 minutes**. Three free options:

### Option A — cron-job.org (recommended, no account required beyond signup)

1. Sign up at [cron-job.org](https://cron-job.org) (free).
2. Create a new cron job:
   - **URL:** `https://your-deployment.vercel.app/api/cron/send`
   - **Schedule:** every 2 minutes
   - **Request method:** GET
   - **Headers:** add one header — `Authorization` : `Bearer YOUR_CRON_SECRET`
3. Save and enable the job.

### Option B — GitHub Actions

Add this file to your repository at `.github/workflows/cron.yml`:

```yaml
name: Cron Send
on:
  schedule:
    - cron: '*/2 * * * *'
  workflow_dispatch:

jobs:
  send:
    runs-on: ubuntu-latest
    steps:
      - name: Call send endpoint
        run: |
          curl -sf \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://your-deployment.vercel.app/api/cron/send
```

Then go to your GitHub repository → Settings → Secrets and variables → Actions, and add `CRON_SECRET` with your secret value.

> GitHub Actions free tier allows up to 2,000 minutes/month on public repos and 500 on private repos. At 2-minute intervals this workflow runs ~720 times/day (~21,600/month) — use a public repo or check your quota.

### Option C — EasyCron

1. Sign up at [easycron.com](https://www.easycron.com) (free tier available).
2. Add a new cron job:
   - **URL:** `https://your-deployment.vercel.app/api/cron/send`
   - **Cron expression:** `*/2 * * * *`
   - **HTTP Method:** GET
   - **HTTP Headers:** `Authorization: Bearer YOUR_CRON_SECRET`
3. Save and activate.

---

## Local development

```bash
cp .env.example .env.local
# Fill in all variables, then:
npm install
npm run dev
```

To test the cron route locally:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/send
```

---

## Security notes

- `CRON_SECRET` is checked server-side on every call to `/api/cron/send`. Requests without the correct `Authorization: Bearer` header are rejected with 401.
- Never put `CRON_SECRET` in frontend code or any `NEXT_PUBLIC_` variable.
- The session cookie for the dashboard is HTTP-only and Secure in production. Rotate `SESSION_SECRET` to invalidate all sessions.
- Never commit `.env.local` to Git.
