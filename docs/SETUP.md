# SOEN Compass — Week 0 Setup (Automated where possible)

> What **you** still need to do by hand, after I've audited your environment.
> Most things I can do for you via CLI/API. The list below is only what genuinely cannot be automated.

**Last updated:** 2026-05-27
**Estimated YOUR time:** ~30 minutes (down from 1.5–2h). Most clicks have been replaced with "paste this into chat" or "I'll handle it."

---

## What I already verified in your environment

I scanned your machine. Here's the state:

| Tool | Status | Note |
|---|---|---|
| Node.js | ⚠️ v25.9 installed, but PRD locks **Node 22 LTS** | I'll install 22 via nvm — it's already on your system |
| npm | ✅ 11.15 | |
| git | ✅ 2.54 | |
| gh (GitHub CLI) | ✅ 2.87, authenticated as **`Sraldon24`** | Already in orgs `kleffio`, `CourtierPro` |
| Docker | ✅ 29.4, passwordless access | |
| `docker compose` plugin | ❌ Missing (you have Docker but not the v2 compose subcommand) | I'll install it |
| `openssl` | ✅ 3.6 | |
| `nvm` | ✅ Installed | |
| `railway` CLI | ✅ Already installed at `~/.nvm/versions/node/v25.9.0/bin/railway` | |
| `gcloud` CLI | ❌ Not installed | I'll install it |
| `psql` client | ❌ Not installed (optional) | I'll install it |
| Passwordless `sudo` | ✅ Confirmed | This is how I'll do package installs |

**Bottom line:** the only things you have to do yourself are (a) things that fundamentally cannot be automated (browser-OAuth flows, account creation on services that don't expose creation APIs), and (b) one-time human-in-the-loop confirmations (Railway plan + payment, picking your GitHub org name).

---

## What I will do automatically (no action needed from you)

When you say "go":

1. **Install Node 22 LTS** via `nvm install 22 --lts && nvm alias default 22`
2. **Install `docker compose` plugin** via `sudo dnf install -y docker-compose-plugin`
3. **Install `psql` client** via `sudo dnf install -y postgresql`
4. **Install `gcloud` CLI** via Google's official tarball install (Fedora repos don't always carry it)
5. **Generate `BETTER_AUTH_SECRET`** via `openssl rand -base64 32` and stash it directly into `.env.local`
6. **Create the GitHub repo** under your org via `gh repo create <org>/compass-soen --public --license MIT`
7. **Initialize git** in this directory, set the remote, make the first commit with current `docs/` + `README.md`
8. **Create Google Cloud project + OAuth client** via `gcloud` (everything except the consent screen — see Section A below)
9. **Create Railway project + Postgres service + set env vars** via `railway` CLI (after you've done Section B once)
10. **Write `.env.local`** with every secret in its right place
11. **Apply pre-Prompt-1 doc fixes** (palette conflict, src/ layout note, ADR-011, LICENSE, PRD §10 timeline)
12. **Run PRD Prompt 1** (Next.js + Tailwind + Biome scaffold)
13. **Run PRD Prompt 2** (shadcn/ui + dark mode)
14. **Spin up local Postgres+pgvector via Docker Compose** and run the first migration

I'll pause for you at any step where I genuinely can't proceed without a manual confirmation (Section A consent screen, Section B Railway plan, AI keys when we hit Phase 3).

---

## What you must do manually (the irreducible list)

### Section A — Google OAuth consent screen [BLOCKING for Phase 1, ~5 min]

I can create the GCP project, enable APIs, and create the OAuth client via `gcloud`. But the OAuth consent screen still requires the web UI (Google has never exposed it via API).

**Steps:**

1. Run this once so my `gcloud` commands work as you:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```
   *(I'll have installed `gcloud` by this point. The above opens browser, you sign in with sraldon24@gmail.com, done.)*

2. After I've created the project (I'll tell you the project ID), open:
   `https://console.cloud.google.com/apis/credentials/consent?project=<the-project-id-I-give-you>`

3. Fill in:
   - User Type: **External** → Create
   - App name: `SOEN Compass`
   - User support email: sraldon24@gmail.com
   - Developer contact: sraldon24@gmail.com
   - Skip Scopes → Save and continue
   - **Test users → ADD USER → sraldon24@gmail.com** (this is the one that bites people — without it, you can't sign in)
   - Status stays "Testing" — fine for v1

4. Tell me "consent screen done" and I'll create the OAuth client + write its ID/secret into `.env.local`.

- [ ] `gcloud auth login` done
- [ ] Consent screen completed, test user added

---

### Section B — Railway plan + payment + login [BLOCKING for Phase 1, ~5 min]

I can create projects, add Postgres, set env vars, and deploy via the `railway` CLI. But picking a plan and adding a payment method requires a browser.

**Steps:**

1. Open https://railway.app and sign up (use GitHub OAuth — easier).
2. Add a payment method. Hobby plan = $5/mo credit which covers everything we need; without a card on file Railway throttles you aggressively.
3. Confirm you're on **Hobby** (not the free trial — different limits).
4. Run this once locally:
   ```bash
   railway login
   ```
   This authenticates the CLI to your account. I'll handle everything else.

- [ ] Railway account on Hobby plan with payment method
- [ ] `railway login` succeeded locally

---

### Section C — GitHub organization [BLOCKING for Phase 1, ~2 min]

`gh` CLI cannot create organizations (GitHub's API doesn't expose it). One unavoidable browser visit.

**Steps:**

1. Open https://github.com/account/organizations/new
2. Plan: **Free**
3. Organization name: **`compass`** (preferred). If taken, try `compass-soen`, `soencompass`, or anything you like.
4. Contact email: sraldon24@gmail.com
5. Owned by: "My personal account"
6. Skip "Add members" and the survey

7. Tell me the org name you used (just paste it in chat). I'll verify with `gh api /user/orgs`.

- [ ] Org created (write the name here): __________________

---

### Section D — Paste these into chat when prompted [BLOCKING per phase]

These three services don't expose key creation via API. You create the key in the browser once, paste it into chat, I write it into `.env.local` and never ask again.

#### D1 — Phase 3 (AI features, ~3 min)

When we get to Phase 3, I'll ping you to do these:

- **Groq:** https://console.groq.com → API Keys → Create. Paste key starting `gsk_...` in chat.
- **Gemini:** https://aistudio.google.com/app/apikey → Create API key. Paste in chat.

#### D2 — Phase 4 (launch prep, ~10 min)

When we get to Phase 4:

- **Sentry:** sign up at https://sentry.io → User Settings → Auth Tokens → create token with `project:read`, `project:write`, `org:read` scopes. Paste in chat. I'll create the Next.js project + retrieve the DSN automatically via `sentry-cli`.
- **PostHog:** sign up at https://posthog.com → Personal API Keys → create with `project:read`, `project:write`. Paste in chat. I'll create the project + retrieve the public key via the PostHog API.
- **Reddit:** https://www.reddit.com/prefs/apps → Create another app → script type → redirect `http://localhost:8080` → paste both the client ID (under app name) and client secret in chat.

---

## How secrets get into the project

I'll create `.env.local.example` (committed to git, contains every key the project will ever need, all blank, grouped by phase). I'll create `.env.local` (gitignored) with the real values as you provide them.

You'll never need to manually edit `.env.local` — every time you give me a new secret in chat, I'll append/update it in `.env.local` and confirm.

---

## Section 10 — Final pre-Prompt-1 checklist

Before pinging me with "go", verify:

- [ ] **Section A:** `gcloud auth login` done, consent screen done (test user added)
- [ ] **Section B:** Railway Hobby with payment, `railway login` succeeded
- [ ] **Section C:** GitHub org name written above

That's it. Everything else, I do.

---

## What happens when you ping me back

Once Sections A, B, C are checked, I'll execute (autonomously, with progress updates):

1. Install missing tools: Node 22 LTS via nvm, docker compose plugin, psql, gcloud
2. Generate `BETTER_AUTH_SECRET`
3. `gh repo create <org>/compass-soen --public --license MIT`
4. `git init`, add remote, first commit of existing `docs/` + `README.md`
5. `gcloud projects create soen-compass-<id>`, enable OAuth APIs, create OAuth client at localhost:3000
6. *(pause for you to do consent screen if not already done)*
7. `railway init`, `railway add` Postgres, `railway variables set` for DATABASE_URL
8. Write `.env.local.example` (committed) + `.env.local` (gitignored) with everything I have so far
9. Pre-Prompt-1 doc fixes (palette conflict, src/ layout, ADR-011, LICENSE, PRD timeline)
10. **PRD Prompt 1** (Next.js + Tailwind v4 + Biome + Geist + base deps)
11. **PRD Prompt 2** (shadcn/ui new-york + slate + next-themes)
12. Docker Compose up for local Postgres+pgvector, run first migration
13. Report back, ready for Prompt 3

I'll stop and ask only if (a) something fails in a way I can't recover from, (b) we hit Phase 3 and need Section D1, or (c) we hit Phase 4 and need Section D2.

---

## Things I'm tracking for you (so you don't have to)

- **Node 22 vs 25:** You have Node 25 installed (current, not LTS). PRD locks Node 22 LTS for native dep compatibility (esp. `@xenova/transformers`). I'll set Node 22 as the default via nvm — your other projects on Node 25 won't break (nvm is per-shell).
- **GitHub handle:** Your actual username is `Sraldon24` (not `sraldon`). User name is **Amir Ghadimi** everywhere (user-facing + legal + LICENSE).
- Design bundle at `docs/design/` — Graphite Greens palette supersedes PRD §8 (flagged in `docs/CLAUDE.md`)
- D3 prereq map → `d3-hierarchy` tree layout (deterministic), not `d3-force`
- `lru-cache` rate limiting is fine for v1; Redis when multi-replica (post-launch)
- Better Auth pinned exactly in `package.json` (no `^` or `~`)
- `@vercel/og` will be verified on Railway when we hit Prompt 15; fallback is `satori + @resvg/resvg-js`

---

**Status:** Awaiting Sections A, B, C.
**Ping me with:** "Sections A B C done, go." (and the org name from Section C)
