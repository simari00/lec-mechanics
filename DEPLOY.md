# LEC Mechanics — Deploy to Vercel + Supabase, then get on Google

Follow these steps **in order**. Nothing is skipped and every click is named.
GitHub account used in this guide: **simari00**

---

## PART A — Create the Supabase database (~10 minutes)

### A1. Create the project
1. Go to **https://supabase.com** → **Sign in with GitHub** → authorise.
2. Click **New project**.
3. Fill in:
   - **Name:** `lec-mechanics`
   - **Database Password:** click **Generate**, then **copy it somewhere safe** (you'll never see it again)
   - **Region:** closest to your users — `eu-central-1 (Frankfurt)` or `eu-west-2 (London)` are good for Zimbabwe
4. Click **Create new project** and wait ~2 minutes while it provisions.

### A2. Create the tables
1. In the left sidebar click **SQL Editor**.
2. Click **New query**.
3. Open the file `backend/database.supabase.sql` from this project, **copy all of it**, paste into the editor.
4. Click **Run** (bottom right). You should see "Success. No rows returned".

### A3. Get the connection string
1. In the left sidebar click the **gear icon (Project Settings)** → **Database**.
2. Scroll to **Connection string** → choose the **Transaction pooler** tab (port 6543).
   - *Why: serverless functions open many short connections; the transaction pooler handles that.*
3. Copy the URI. It looks like:
   ```
   postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```
4. Replace `[YOUR-PASSWORD]` with the database password you saved in A1.
5. **Keep this string for Part B step B8.** Treat it like a password — never commit it.

---

## PART B — Deploy to Vercel (~15 minutes)

### B1. Push the code to GitHub
Ask me (the agent) to do this, or run yourself:

```bash
git init   # if not already a repo
git add -A
git commit -m "Prepare LEC Mechanics for Vercel + Supabase deployment"
git remote add origin https://github.com/simari00/lec-mechanics.git
git push -u origin main
```

(If GitHub asks for a password, use a **Personal Access Token**: github.com → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token with the `repo` scope.)

### B2. Import into Vercel
1. Go to **https://vercel.com** → **Continue with GitHub** → authorise.
2. On the dashboard click **Add New… → Project**.
3. Find `lec-mechanics` in the repository list → click **Import**.
4. Vercel auto-detects "Other" framework — leave **Framework Preset** as **Other**. Leave Build and Output settings empty. Click **Deploy**.
5. Wait ~1 minute. Your first deployment is live at `https://lec-mechanics.vercel.app` (the exact name is on the dashboard).

### B3. Add the environment variables
1. On your project page → **Settings** → **Environment Variables**.
2. Add these two (paste the values, click Save after each):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Supabase URI from step A3 |
   | `JWT_SECRET` | any long random text, e.g. run this locally and paste the output: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |

3. (Optional but recommended) Add `CRON_SECRET` — another random string. This stops strangers from hammering your cron endpoint.

### B4. Redeploy so the variables take effect
1. Top tab **Deployments** → click the newest deployment → **⋯ menu** → **Redeploy** → confirm.

### B5. Verify the deployment works
Open in your browser:

- `https://YOUR-SITE.vercel.app/` — the homepage renders
- `https://YOUR-SITE.vercel.app/api?resource=track&code=TEST` — should return JSON like `{"error":"No request found for that tracking code..."}` — **this proves the API + database are connected**
- `https://YOUR-SITE.vercel.app/admin/dashboard.html` — admin login shows; the **first time** you open it, click "First time here? Create the admin account" and set up your admin login.

### B6. The anti-sleep cron — what it does
Free Supabase projects pause after **7 days of inactivity**. This project already includes:

- **`api/cron.js`** — a serverless function that pings the database (updates a `keepalive` table).
- **`vercel.json`** — schedules it with Vercel Cron: `"0 */6 * * *"` = **every 6 hours**. Your database is never inactive for more than 6 hours, so it never sleeps.

Vercel's free Hobby plan includes cron jobs — nothing more to buy or configure. Verify it's registered: Vercel project → **Settings** → **Cron Jobs** → you should see `/api/cron` with schedule `0 */6 * * *`.

---

## PART C — Google Search Console, step by step (~30 min + waiting)

### Step 1 — Add your website
1. Go to **https://search.google.com/search-console** and sign in with any Google account.
2. Click **Add property** (top-left dropdown).
3. Choose the **URL prefix** option (right one — it allows the DNS method you asked for only with a domain property; with URL prefix we use the HTML file method, but **DNS is cleaner if you buy a domain later** — see note below).
4. Enter: `https://lec-mechanics.vercel.app` (your exact Vercel URL) → **Continue**.

> **Note:** For the true *DNS TXT record* verification you described in Step 2, Google requires a **Domain property** (e.g. `lecmechanics.co.zw`), which needs a custom domain. With only the free `vercel.app` URL, use the **HTML file** verification below. When you later buy a domain, add a Domain property and do the DNS TXT once — it covers every page and subdomain forever.

### Step 2 — Verify ownership (HTML file method — works with vercel.app)
1. Google offers several methods — pick **HTML file**.
2. Download the file it gives you (e.g. `google1234abcd.html`).
3. Put the file in the root of this project (next to `index.html`).
4. Push and deploy:
   ```bash
   git add google1234abcd.html
   git commit -m "Add Google Search Console verification"
   git push
   ```
   Vercel auto-deploys in ~1 minute. Confirm `https://YOUR-SITE.vercel.app/google1234abcd.html` opens.
5. Back in Search Console click **Verify**. ✅

*(If you buy a custom domain: add the Domain property instead, choose **DNS TXT record**, copy the TXT value, paste it in your registrar's DNS settings as a TXT record for `@`, wait 5–30 min, click Verify.)*

### Step 3 — Tell Google every page (Sitemap)
A sitemap already ships with this project at `/sitemap.xml`.
1. In Search Console, left menu → **Sitemaps**.
2. Type: `sitemap.xml` after your property URL.
3. Click **Submit**. Status should become "Success".
4. The sitemap lists all 5 public pages: home, services, about, contact, track.
5. If you change your final domain later, update the URLs inside `sitemap.xml` and `robots.txt` and resubmit.

### Step 4 — Instantly force-index your most important page (the homepage)
1. In Search Console, use the **URL Inspection** search bar at the very top.
2. Paste: `https://YOUR-SITE.vercel.app/` → press Enter.
3. Google checks the URL (a few seconds), then click **Request Indexing**.
4. Repeat for `https://YOUR-SITE.vercel.app/pages/contact.html` (where customers submit requests) and `https://YOUR-SITE.vercel.app/pages/track.html` (your unique tracking page — good for local searches).
5. Indexing usually starts within minutes-to-hours; full search appearance takes days to ~2 weeks.

> Tip: also paste your links on your WhatsApp Business profile / Facebook page — real clicks speed up discovery.

---

## PART D — What changed in the codebase for this deployment

| Change | Why |
|---|---|
| `backend/database.supabase.sql` | Postgres schema — run once in Supabase (A2) |
| `api/index.js` | The whole PHP API ported to a Node serverless function (same client contract — the front end didn't change except the URL) |
| `api/cron.js` + `vercel.json` | Keep-alive ping every 6h so Supabase never sleeps |
| `vercel.json` | Rewrites `/api` → serverless handler; cron schedule |
| `package.json` | `pg`, `bcryptjs`, `jsonwebtoken` for the serverless API |
| `js/script.js`, `js/admin.js` | API base changed from `backend/api/index.php` to `/api`; gallery uploads are stored in Postgres and streamed back via `/api?resource=gallery_image&id=N` |
| `pages/track.html` + CSS | Customer tracking page (enter code → approval status timeline) |
| `sitemap.xml`, `robots.txt` | For Google indexing |
| `router.php` | Local dev server maps `/api` exactly like production |

Local development still works exactly as before: `start-dev.bat` (PHP + SQLite).

## Security checklist before going live
- [ ] `JWT_SECRET` and `DATABASE_URL` are set in Vercel env vars (never in code)
- [ ] Admin account created via the setup screen with a strong password
- [ ] Gallery uploads capped (already: 5 MB per image, JPEG/PNG/WebP/GIF only)
- [ ] `CRON_SECRET` set so the cron endpoint can't be abused
