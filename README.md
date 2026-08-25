# Milestone

Achievement, badge, and cashback rewards system for an e-commerce store. Every purchase a
customer makes is checked against a set of purchase-count thresholds ("achievements"); unlocking
enough achievements earns a badge; unlocking a badge triggers an automatic ₦300 cashback transfer
via Paystack.

Built with NestJS, Prisma (PostgreSQL), Redis-backed BullMQ, and Paystack.

**Live deployment:** [https://api.engagr.online/](https://api.engagr.online/)
**Swagger docs:** [https://api.engagr.online/docs](https://api.engagr.online/docs)

## How it works

```
POST /users/:userId/purchases
        │
        ▼
  purchase.created event
        │
        ▼
  AchievementsService checks purchase count against thresholds
  (e.g. 1 purchase → "First Purchase", 5 → "5 Purchases", 10 → "10 Purchases")
        │
        ▼  (on unlock)
  achievement.unlocked event  { achievement_name, user }
        │
        ▼
  BadgesService checks total unlocked achievements against badge thresholds
  (e.g. 1 achievement → "Starter", 2 → "Achiever", 3 → "Champion")
        │
        ▼  (on unlock)
  badge.unlocked event  { badge_name, user, userBadgeId }
        │
        ▼
  Payout job queued (BullMQ) → Paystack transfer initiated → status PENDING
        │
        ▼
  Paystack webhook (transfer.success / transfer.failed / transfer.reversed)
  confirms the final payment status
```

All three domain events (`purchase.created`, `achievement.unlocked`, `badge.unlocked`) are handled
in one place: [`src/services/events/events.listeners.ts`](src/services/events/events.listeners.ts).

## Design choices

**Event-driven, not a call chain.** `PurchasesService`, `AchievementsService`, and `BadgesService`
don't call each other directly — each just does its own job and emits an event
(`@nestjs/event-emitter`). `EventListeners` is the only place that wires them together. This keeps
each module ignorant of what happens downstream (a purchase doesn't need to know achievements
exist; achievements don't need to know badges exist), and makes it easy to add a new
listener without touching existing modules.

**Payments run on a queue, not inline.** Calling out to Paystack from inside the HTTP/event
handling path would mean a slow or failing provider call blocks the request and has no retry
story. `badge.unlocked` instead enqueues a BullMQ job (Redis-backed); `PaymentProcessor` runs it
out-of-band with automatic retries (exponential backoff) if the Paystack API call itself fails.

**The webhook, not the API response, is the source of truth for payment status.** Paystack's
`/transfer` endpoint only confirms the transfer was *accepted* — not that it completed. A payment
stays `PENDING` after initiation and only moves to `SUCCESS`/`FAILED` when Paystack's webhook
(`transfer.success` / `transfer.failed` / `transfer.reversed`) confirms the outcome. Treating the
initial API response as final was tried and found to be wrong for exactly this reason.

**Two independent retry layers, on purpose.** BullMQ retries a job automatically if the Paystack
*call itself* throws (network blip, transient API error) — see `attempts`/`backoff` in
`app.module.ts`. Separately, `WebhookService` retries (re-enqueues) up to `MAX_PAYMENT_RETRIES`
(3) when Paystack *asynchronously reports* `transfer.failed`/`transfer.reversed` after having
already accepted the transfer — a different failure mode that the call-level retry can't see.
Each retry attempt gets a **fresh reference** sent to Paystack; reusing one is rejected outright
with `duplicate_transfer_reference`. Deduplication itself is keyed on `userBadgeId` (a badge can
only ever have one `Payment` row), not on the reference, so retries can never double-pay a user.

**Webhook authenticity is signature-based, not shape-based.** `PaystackWebhookEvent` is a plain
TypeScript `interface`, not a `class` — this is deliberate, so Nest's global `ValidationPipe`
(`forbidNonWhitelisted: true`) never touches it. Trusting a webhook payload's shape is the wrong
control anyway; `WebhookService` verifies the `x-paystack-signature` header
(`HMAC-SHA512` of the *raw* request body, keyed with `PAYSTACK_SECRET_KEY`) using
`crypto.timingSafeEqual` before processing anything.

**A single error helper (`src/utils/error.utils.ts`) instead of scattered `throw new XException`.**
`bad(message, statusCode)` maps a small set of HTTP status codes to the right Nest exception class
in one place.

**Prisma driver adapters (`@prisma/adapter-pg`), not the default query engine.** Avoids native
binary/OpenSSL requirements in the Docker image, and keeps SSL behavior explicit and conditional
(see `PrismaService` — `sslmode=disable` in `DATABASE_URL` skips certificate verification, for the
local/dockerized Postgres; anything else enforces it).

## Getting started

### Option A — Docker (recommended, matches the "easy execution" requirement)

```bash
cp .env.example .env
# fill in your own Paystack test keys in .env

docker compose up --build
```

This starts Postgres, Redis, and the API together. The API applies the Prisma schema on boot
(`prisma db push`) and starts on **http://localhost:4000**. Swagger docs at
**http://localhost:4000/docs**.

### Option B — Local Node, external Postgres/Redis

```bash
pnpm install
cp .env.example .env   # point DATABASE_URL / REDIS_URL at your own instances
npx prisma generate
npx prisma db push
npx prisma db seed     # seeds achievement definitions + badge definitions
pnpm run start:dev
```

## Environment variables

| Variable | Description |
|---|---|
| `PORT` | Port the API listens on (default `4000`) |
| `DATABASE_URL` | PostgreSQL connection string. Include `sslmode=disable` for a non-SSL Postgres (local/Docker); omit it for a managed DB that requires SSL |
| `REDIS_URL` | Redis connection string, used by BullMQ for the payment queue |
| `PAYSTACK_SECRET_KEY` | Paystack secret key (test or live) — also used to verify webhook signatures |
| `PAYSTACK_BASE_URL` | Paystack API base URL (`https://api.paystack.co`) |
| `PAYSTACK_TEST_RECIPIENT_CODE` | Transfer recipient code cashback payouts are sent to |
| `CASHBACK_AMOUNT_KOBO` | Cashback amount per badge unlock, in kobo (`30000` = ₦300) |

See [`.env.example`](.env.example) for a ready-to-copy template.

## API

Full interactive reference at `/docs` (Swagger) once running. All routes are prefixed with `/api`.

| Method | Route | Description |
|---|---|---|
| `POST` | `/users` | Create a user |
| `GET` | `/users/:id` | Get a user, with their unlocked achievements, badges, and payment history |
| `POST` | `/users/:userId/purchases` | Record a purchase — triggers the achievement/badge/payment chain |
| `GET` | `/users/:userId/achievements` | Achievement + badge progress summary (`unlocked_achievements`, `next_available_achievements`, `current_badge`, `next_badge`, `remaining_to_unlock_next_badge`) |
| `POST` | `/webhook/paystack` | Paystack transfer webhook — requires a valid `x-paystack-signature` header |

### Testing the webhook locally

Paystack signs every webhook with `HMAC-SHA512(raw_body, PAYSTACK_SECRET_KEY)` sent as the
`x-paystack-signature` header — there's nothing to "look up," it's computed fresh per request.
Locally, there's no real Paystack server to produce that signature, so you have to compute one
yourself against the *exact* raw bytes you send:

```bash
node -r dotenv/config -e "
const crypto = require('crypto');
const body = Buffer.from(JSON.stringify({
  event: 'transfer.success',
  data: {
    reference: 'badge-payout-<userBadgeId>-abcd1234',
    status: 'success',
    transfer_code: 'TRF_test123',
    amount: 30000,
  },
}));
console.log(crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex'));
"
```

Send that exact body with the resulting signature in the `x-paystack-signature` header via `curl`
— **not** Swagger UI's "Try it out," which can silently reformat the JSON before sending it,
producing bytes that no longer match the signature (and a confusing 401). `curl --data-binary
@payload.json` sends the file's exact bytes with no risk of that.

> Signature verification is a real, load-bearing security control — it must stay enabled. Don't
> comment it out to make local testing easier; compute a real signature instead (as above).

## Testing

**Unit tests** — mocked dependencies, no external services needed:

```bash
pnpm test          # run once
pnpm test:watch     # re-run on file changes
pnpm test:cov       # with a coverage report
```

Covers the business logic in every service: achievement/badge threshold unlocking, purchase
recording, the `error.utils.ts` status-code mapping, payment retry/reference-regeneration
behavior, and the webhook's HMAC signature verification (valid/missing/tampered) plus its
retry-then-give-up logic.

**Integration/e2e tests** — real Postgres, real Redis/BullMQ, real HTTP requests through the full
app; the only thing mocked is the outbound Paystack call itself (no real transfers, no network
dependency):

```bash
docker compose up -d postgres redis   # if not already running
npx prisma db push
npx prisma db seed                    # achievement/badge definitions must exist for the flow below

pnpm test:e2e
```

`test/purchases-flow.e2e-spec.ts` drives the whole advertised flow end-to-end: create a user →
make a purchase → poll until the `First Purchase` achievement and `Starter` badge actually unlock
(achievement checks run via a fire-and-forget event listener, so the test waits for real async
completion rather than asserting immediately) → confirm the real BullMQ worker picks up the payout
job and creates a `Payment` row → send it a correctly-signed webhook and confirm the status flips
to `SUCCESS`. Also covers 404/409/400 error paths and rejecting an unsigned or tampered webhook.

`pnpm test:e2e` runs test files serially (`--runInBand`) since they share one real Postgres/Redis
instance — running them in parallel workers (Jest's default) causes the BullMQ workers from
different test files to race each other for jobs on the same queue.

## Deployment

The app is containerized with a multi-stage [`Dockerfile`](Dockerfile) (build stage compiles +
generates the Prisma client; runtime stage only ships the built output).

Two Compose files, for two different jobs:

- **[`docker-compose.yml`](docker-compose.yml)** — builds the image from source (`build: .`).
  This is the one to run locally; no registry access needed.
- **[`docker-compose.prod.yml`](docker-compose.prod.yml)** — pulls the prebuilt image from GHCR
  instead of building. Used only by the deploy pipeline against the production host; Postgres and
  Redis aren't port-published here (unlike the local file), since there's no reason to expose them
  on a public server.

### CI/CD

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and pushes a Docker image to
GitHub Container Registry on every push to `main`, then SSHes into the production host and runs
`docker compose -f docker-compose.prod.yml up -d`, redeploying only the `api` service (Postgres/
Redis keep running undisturbed unless they're not already up).

Required GitHub Actions secrets: `DROPLET_SSH_KEY`, `DROPLET_USER`, `DROPLET_IP`, `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_DB`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_TEST_RECIPIENT_CODE`.
Required repo variables: `PAYSTACK_BASE_URL`, `CASHBACK_AMOUNT_KOBO`.
