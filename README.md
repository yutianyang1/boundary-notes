# Boundary Notes

*[中文文档](./README.zh-CN.md)*

A self-hosted, bilingual blogging platform. It runs [xiudou.site](https://xiudou.site).

---

## What this is for

I write long technical pieces on LLM inference optimisation — the kind with heavy code blocks, mathematical notation and architecture diagrams. Hosted platforms put the rendering pipeline out of reach; static site generators cannot carry accounts, comments or scheduled publishing. So I built this.

It solves three problems.

**Content.** Markdown renders server-side through a controlled unified pipeline: Shiki dual-theme highlighting, KaTeX for maths, Mermaid inlined as SVG, all of it passed through a `rehype-sanitize` allowlist and DOMPurify. The editor is CodeMirror 6, and the live preview calls the exact function production calls, so what you see is what ships. Every save writes a revision, and an optimistic lock stops two editors overwriting each other.

**Accounts.** Auth.js with email/password and GitHub OAuth, TOTP two-factor enforceable for staff. Sessions live in a database registry as well as the JWT, so the account area can list every signed-in device and revoke them individually; changing a password invalidates all of them at once. Sign-in, registration and password recovery are rate limited separately.

**Operations.** The whole topology is Docker Compose: Nginx, Next standalone, PostgreSQL with PGroonga for Chinese full-text search, Redis, and a scheduler container. Only Nginx's port 80 reaches the host; everything else stays on an internal network. Mail is never sent inline — it is encrypted into an outbox table and delivered by the scheduler each minute, over Tencent Cloud SES or SMTP.

---

## Interface

![Home page](./docs/screenshots/home.webp)

Article pages: server-side Shiki highlighting in both themes, KaTeX, tables, a table of contents that tracks scroll position, and copy buttons on every code block.

![Article page](./docs/screenshots/article-code.webp)

<table>
<tr>
<td width="62%"><img src="./docs/screenshots/posts.webp" alt="Post archive"><br><sub>Archive, paginated by year</sub></td>
<td width="38%"><img src="./docs/screenshots/mobile-home.webp" alt="Mobile home page"><br><sub>Mobile</sub></td>
</tr>
</table>

<details>
<summary>Dark mode</summary>

Light and dark throughout, with separate palettes for syntax highlighting and Mermaid diagrams. Follows the system setting or a manual toggle.

![Home page in dark mode](./docs/screenshots/home-dark.webp)

![Article page in dark mode](./docs/screenshots/article-diagram-dark.webp)

</details>

> Screenshots are captured from production by `npm run screenshots` — see [`scripts/capture-screenshots.ts`](./scripts/capture-screenshots.ts).

---

## Features

**Content**
- Server-rendered Markdown: GFM, footnotes, heading anchors, an allowlist of custom directives
- Shiki syntax highlighting, both themes generated in one pass
- KaTeX maths and Mermaid diagrams as inline SVG — no client-side runtime
- Post revisions, optimistic locking, soft deletes
- Scheduled publishing, triggered by the scheduler container under a transaction lock so nothing publishes twice
- Categories, tags and series as three organising axes, with 301s from retired URLs
- Media library: real format detected from file contents, HEIC converted to WebP, SVG sanitised before it touches disk
- Chinese full-text search via PGroonga
- RSS, sitemap and robots.txt generated automatically

**Bilingual interface**
- Chinese and English UI across the public site, 411 dictionary keys per locale
- Chinese URLs stay unprefixed (`/posts/…`); English lives under `/en`
- Language is decided by the URL and an explicit switch — never by `Accept-Language`, which would serve crawlers an unpredictable language and make one shared link render differently for different people
- Article prose stays Chinese and is marked `lang="zh-CN"` inside an English shell, so browsers offer to translate exactly the part that needs it
- Symmetric `hreflang` alternates with `x-default`, and a sitemap carrying both locales
- Taxonomy names take optional English values and fall back to Chinese rather than rendering blank

**Accounts and security**
- Email/password sign-in plus GitHub OAuth
- Two-step registration — the email is verified before any user row exists
- TOTP two-factor with QR enrolment and single-use recovery codes
- Session registry: every device visible, individually revocable
- Argon2id password hashing with configurable cost, transparently upgrading legacy bcrypt hashes
- Weak passwords and values resembling account details are rejected
- Redis rate limits on sign-in, registration and password reset, with a 60-second resend cooldown on verification mail
- Security-alert email on sign-in from a new device
- Audit log

**Roles**

`admin` / `editor` / `author` / `reader`, with row-level ownership checks on every dashboard operation.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2 — App Router, RSC, Cache Components |
| Language | TypeScript 5.9, strict |
| Styling | Tailwind CSS v4, OKLCH design tokens |
| Database | PostgreSQL 17 + PGroonga |
| ORM | Drizzle ORM, drizzle-kit migrations |
| Cache / limits | Redis with AOF persistence |
| Auth | Auth.js v5 |
| Passwords | @node-rs/argon2, bcryptjs for compatibility |
| i18n | next-intl 4 |
| Rendering | unified / remark / rehype, Shiki, KaTeX, Mermaid |
| Sanitisation | rehype-sanitize allowlist + DOMPurify |
| Images | sharp, heic-decode |
| Mail | Tencent Cloud SES API or Nodemailer SMTP |
| Runtime | Node 24, Docker Compose, Nginx |

---

## Getting started

You need Docker and Node 24.

```bash
git clone https://github.com/yutianyang1/boundary-notes.git
cd boundary-notes
cp .env.example .env
```

Edit `.env`. At minimum, replace these five — the rest can keep their defaults for now:

```bash
POSTGRES_PASSWORD=<a strong password>
DATABASE_URL=postgresql://blog:<the same>@postgres:5432/blog
AUTH_SECRET=$(openssl rand -base64 32)
JOB_SECRET=$(openssl rand -base64 32)
ADMIN_PASSWORD=<initial admin password>
```

Then:

```bash
npm install
docker compose up -d postgres redis    # infrastructure
npm run db:generate && npm run db:migrate
npm run db:seed                        # creates the admin account
npm run dev                            # http://localhost:3000
```

Full topology, including Nginx and the scheduler:

```bash
docker compose up --build              # http://localhost
```

If Docker Hub is unreachable, an offline profile brings up a development database without PGroonga. It is for feature work only — production must use the main Compose file:

```bash
docker compose -f docker-compose.yml -f docker-compose.offline.yml up -d postgres redis
```

---

## Configuration

Everything is injected through environment variables. `docker-compose.yml` contains only `${VAR}` references — no literal secrets.

### Infrastructure

| Variable | Required | Default | Notes |
|---|:--:|---|---|
| `DATABASE_URL` | ✅ | — | Postgres connection string; the in-container host is `postgres` |
| `POSTGRES_DB` | ✅ | `blog` | Database name |
| `POSTGRES_USER` | ✅ | `blog` | Database user |
| `POSTGRES_PASSWORD` | ✅ | — | Database password |
| `REDIS_URL` | ✅ | `redis://redis:6379` | Rate limiting and caching |
| `UPLOADS_DIR` | | `./uploads` | Where uploads are written |

### Authentication

| Variable | Required | Default | Notes |
|---|:--:|---|---|
| `AUTH_SECRET` | ✅ | — | Auth.js signing key: `openssl rand -base64 32` |
| `AUTH_URL` | ✅ | `http://localhost` | Public origin, scheme + host [+ port]. **Leave it unset and the origin is inferred from the request, which inside a container can degrade to `http://0.0.0.0:3000` and break every sign-in redirect** |
| `AUTH_TRUST_HOST` | | `true` | Must be `true` behind a reverse proxy |
| `AUTH_GITHUB_ID` | | empty | GitHub OAuth App ID. Empty hides the GitHub button |
| `AUTH_GITHUB_SECRET` | | empty | As above |
| `MFA_SECRET_KEY` | ✅ | — | Encrypts stored TOTP secrets, base64 32 bytes. **Generate it independently of `AUTH_SECRET`** |
| `ARGON2_MEMORY_COST` | | `19456` | Argon2id memory cost, KiB |
| `ARGON2_TIME_COST` | | `2` | Iterations |
| `ARGON2_PARALLELISM` | | `1` | Parallelism |

### Feature flags

| Variable | Default | Notes |
|---|---|---|
| `PUBLIC_REGISTRATION_ENABLED` | `false` | When off, `/register` and `/verify-email` return 404 |
| `COMMENTS_ENABLED` | `false` | Comment thread on article pages |
| `STAFF_MFA_ENFORCED` | `false` | When on, staff without two-factor cannot reach the dashboard |
| `SUBSCRIPTIONS_ENABLED` | `false` | Email subscriptions |

> Flags are compared against the string `"true"`. `1` and `TRUE` both read as off.

### Mail

Pick a transport first: `MAIL_PROVIDER=tencent_api` or `smtp`.

| Variable | Required | Notes |
|---|:--:|---|
| `MAIL_OUTBOX_KEY` | ✅ | Encrypts recipients and payloads in the outbox table, base64 32 bytes |
| `MAIL_FROM_ADDRESS` | ✅ | Sender address; must match a domain verified with the provider |
| `MAIL_FROM_NAME` | | Sender display name |
| `MAIL_REPLY_TO` | | Reply-to address |

**Tencent Cloud SES** (`MAIL_PROVIDER=tencent_api`)

| Variable | Notes |
|---|---|
| `TENCENT_SECRET_ID` | CAM credential ID. **Create a sub-account scoped to SES; do not use the root account key** |
| `TENCENT_SECRET_KEY` | CAM credential secret |
| `TENCENT_SES_REGION` | Only `ap-guangzhou` or `ap-hongkong` are supported |
| `SES_TEMPLATE_VERIFY_EMAIL` | Email verification template ID |
| `SES_TEMPLATE_PASSWORD_RESET` | Password reset template ID |
| `SES_TEMPLATE_SECURITY_ALERT` | Security alert template ID |
| `SES_TEMPLATE_SUBSCRIBE_CONFIRM` | Subscription confirmation template ID |
| `SES_TEMPLATE_POST_PUBLISHED` | New post notification template ID |

Template HTML lives in [`docs/mail-templates/`](./docs/mail-templates/). Submit them for approval, then paste the returned numeric IDs here.

**SMTP** (`MAIL_PROVIDER=smtp`)

`SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM`

### Site identity (inlined at build time)

`NEXT_PUBLIC_*` values are compiled into the client bundle. **Changing one requires a rebuild**, and none of them may hold a secret.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public address, used for RSS, the sitemap and absolute links in email |
| `NEXT_PUBLIC_SITE_NAME` | Site name |
| `NEXT_PUBLIC_COPYRIGHT_YEAR` | Footer copyright year |
| `NEXT_PUBLIC_ICP_BEIAN` | ICP filing number, required for mainland China deployments |
| `NEXT_PUBLIC_MPS_BEIAN` | Public security filing text, shown in full |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Footer contact address |
| `NEXT_PUBLIC_GITHUB_URL` | Footer GitHub link |

### Jobs and seeding

| Variable | Notes |
|---|---|
| `JOB_SECRET` | Bearer token for `/internal/jobs/*`, used by the scheduler. A missing or wrong token returns 404 |
| `ADMIN_EMAIL` | Admin address created by `npm run db:seed` |
| `ADMIN_PASSWORD` | Initial admin password — change it after the first sign-in |

---

## Deployment topology

```
                    ┌── edge network ──┐
   :80 ────────────▶│      nginx       │
                    └────────┬─────────┘
                    ┌── backend network (internal) ─────┐
                    │        ▼                          │
                    │    next (standalone)              │
                    │     ▲        ▲         ▲          │
                    │     │        │         │          │
                    │  postgres  redis   scheduler      │
                    │ +PGroonga   AOF   (cron, 1 min)   │
                    └───────────────────────────────────┘
```

One-shot containers: `migrate` runs migrations, `seed` creates the admin account, `uploads-init` fixes ownership on the uploads volume.

The scheduler hits two internal endpoints every minute:

- `POST /internal/jobs/publish-scheduled` — publishes posts whose time has come
- `POST /internal/jobs/send-mail` — delivers queued outbox mail

Both require `Authorization: Bearer $JOB_SECRET`.

> **Production builds are pinned to Webpack** (`next build --webpack`). Turbopack in Next.js 16.2 generates standalone external-module hash aliases on Windows that do not carry over to a Linux container. The Webpack output is verified Windows → Linux on real hardware.

---

## Development

```bash
npm run dev              # development server
npm run check            # typecheck + tests + lint — run this before opening a PR
npm run typecheck        # tsc --noEmit
npm run test             # node --test, 43 test files
npm run lint             # eslint
npm run db:generate      # generate a migration from schema changes
npm run db:migrate       # apply migrations
npm run db:studio        # Drizzle Studio
npm run screenshots      # re-capture the README screenshots
npm run content:rerender # re-render every post after a schema or pipeline change
```

Tests live in `lib/**/*.test.ts` and cover authentication, rate limiting, tokens, password policy, permission checks, the Markdown pipeline and the i18n dictionaries. They use Node's built-in test runner and need no database.

### Working on translations

`messages/zh.json` and `messages/en.json` must stay in step. Four tests enforce it: identical key sets, no empty strings, matching placeholders and rich-text tags, and no Chinese left in the English file. A missing key would otherwise surface as a runtime error on a page nobody visits often.

Server actions return dictionary keys rather than prose — an action has no locale of its own, so the form translates the key at render time.

---

## Layout

```
app/
  [locale]/
    (site)/          public site: home, posts, archive, taxonomy, account
    (auth)/          sign-in, registration, email verification, recovery, MFA
  (backend)/admin/   dashboard: posts, media, settings — not localised
  api/               REST endpoints
  internal/jobs/     scheduler only, requires JOB_SECRET
i18n/                routing, navigation, message loading, hreflang
messages/            zh.json, en.json
lib/
  auth/              authentication, MFA, rate limits, tokens, password policy
  db/                Drizzle schema and queries
  markdown/          rendering pipeline
  mail/              outbox encryption and delivery
  uploads/           image detection, transcoding, SVG sanitisation
components/          UI components
drizzle/             migrations and snapshots
infra/
  nginx/             Nginx config and HTTPS deployment scripts
  postgres/init/     extension setup
  scheduler/         cron container
docs/
  adr/               architecture decision records
  specs/             per-feature specifications
  mail-templates/    email template HTML
```

---

## Documentation

- [ADR-0001 — Platform architecture](./docs/adr/0001-blog-platform-architecture.md)
- [ADR-0002 — User and authentication system](./docs/adr/0002-user-and-auth-system.md)
- [`docs/specs/`](./docs/specs/) — per-feature specifications, 20+ documents

---

## Known limitations

- Production builds must use Webpack, for the reason given above
- Playwright is installed but there are no end-to-end specs yet; regression testing is manual
- Full-text search needs PGroonga, which the offline profile omits — search can only be exercised against the main Compose database
- Article prose, the admin dashboard and the mail templates are Chinese by design. Translating article bodies would turn every publish into a second writing job, and machine translation mangles the kind of detail these posts are made of — browser translation covers that case, which is why bodies carry their own `lang`

---

## Licence

MIT — see [LICENSE](./LICENSE).
