# CEFR Boost — Deploy Guide (Vercel, free tier)

This folder has everything you need:
- `index.html` — the whole app (home page + Writing mock)
- `api/score.js` — a small server function that talks to OpenRouter securely
- `package.json` — tells Vercel this is a Node project

## Why you need this at all

The browser can never hold a real API key — anyone could open dev tools
and steal it. So `index.html` calls `/api/score` (your own server), and
`api/score.js` is the only place that actually holds the real key and
talks to OpenRouter. This is the standard way every production AI app does it.

## Steps

1. **Get a free OpenRouter API key (no credit card, no age verification)**
   Go to https://openrouter.ai/keys → sign up with email or GitHub →
   "Create Key". Copy it. Keep it secret — never put it in `index.html`
   or commit it to a public GitHub repo.

   Note: the free tier gives ~50 requests/day (20/minute) through the
   `openrouter/free` auto-router, which always points at whichever
   model is currently free. That's enough for testing and small-scale
   use. If you outgrow it, adding $10 in OpenRouter credits raises the
   daily cap to 1,000 — no code changes needed.

2. **Create a free Vercel account**
   https://vercel.com/signup — sign up with GitHub is easiest.

3. **Push this folder to a GitHub repo**
   ```
   git init
   git add .
   git commit -m "CEFR Boost app"
   ```
   Create a new empty repo on GitHub, then:
   ```
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

4. **Import the repo in Vercel**
   Vercel dashboard → "Add New Project" → pick your repo → Deploy.
   (Leave all build settings as default — Vercel detects this
   automatically.)

5. **Add your API key as an environment variable**
   In the Vercel project → Settings → Environment Variables:
   - Name: `OPENROUTER_API_KEY`
   - Value: your key from step 1
   - Save, then go to Deployments → click the latest one → "Redeploy"
   (env vars only apply to deployments made after you add them).

6. **Done**
   Vercel gives you a URL like `https://your-project.vercel.app`.
   Open it — the home page loads, and "Start" on Writing Mock 01 now
   calls your own `/api/score`, which calls OpenRouter with your key
   safely on the server, for free.

## Local testing (optional)

If you install the Vercel CLI (`npm i -g vercel`), you can run
`vercel dev` in this folder and it will serve `index.html` and
`api/score.js` together on `http://localhost:3000`, using a `.env.local`
file for `OPENROUTER_API_KEY` — useful for testing before you deploy.

## If you hit "rate limit" or "model unavailable" errors

The free OpenRouter tier allows ~50 requests/day and 20/minute, and
which specific model backs `openrouter/free` can rotate. If several
people submit tests at once, or the free model is briefly unavailable,
some may see a scoring error — have them wait a bit and retry. If this
becomes a regular problem, adding a small amount of OpenRouter credit
raises the limit a lot, still at a very low per-request cost.

## What's still a demo, not official

- The 17→75 score conversion table (`WRITING_CONVERSION` in
  `index.html`) is a placeholder — replace it once you have the
  official table.
- Reading, Listening, and Speaking sections aren't built yet.
- There's still no database or admin panel — results live in each
  visitor's own browser (localStorage), not on a server you can see.
