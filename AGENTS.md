# Laundry Marketplace: Instructions for AI Coding Agents

This repository is intended to become a **real, secure, maintainable, production-quality full-stack laundry services marketplace**, not a static UI showcase. Read these instructions before making changes. They apply to all code and documents in the repository.

## Product and roles

Build coherent journeys for: (1) customers finding, comparing, booking and tracking nearby garment-care services; (2) verified laundry partners configuring prices, capacity, coverage, pickup availability and fulfilling orders; (3) pickup/delivery operators where needed; (4) administrators reviewing partners, disputes, refunds and marketplace health.

The business model is an independent-partner services marketplace. Do not assume a single centralized laundry shop or dark-store inventory. Do not claim availability, distances, pickup windows, reviews, payouts or GPS tracking are real unless backed by real records and integrations.

## Design and UX bar

- Aim for the clarity, task orientation and practical interaction quality of established service and commerce products, but do not clone their branding or proprietary assets.
- Create a consistent design system: typography scale, spacing, semantic colors, elevation, component states, accessible tap targets and responsive layouts.
- Do not generate generic AI-dashboard aesthetics: excessive gradients, glowing cards, random emoji icons, unnecessary animations, filler text, fabricated metrics, or dozens of disconnected screens.
- Every screen must handle loading, empty, failure, validation, offline and success states as appropriate.
- Consider accessibility, low bandwidth, permission denials, interrupted pickups and difficult address entry.
- Use honest text and locally appropriate currency (INR) and service categories; separate sample content from real data.

## Architecture and engineering

- Current Android-first development path: Expo/React Native + TypeScript on a physical Android device, with Supabase/PostgreSQL + PostGIS, and a future Next.js admin app. Use Expo Go for initial work and a custom development build when native integrations require it.
- Separate presentation, data fetching, domain/business logic and persistence. Keep domain types, input validation and shared contracts consistent.
- Prefer vertical slices delivering a complete use case (UI -> authentication -> authorization -> backend -> database -> tests) over making all screens before backend work.
- Make database schema changes as versioned, reversible migrations with appropriate constraints and indexes.
- Document key domain decisions, especially roles, service zones, price estimates, inspected quantities, quote revisions, pickup/return handoffs, and order status transitions.
- Use server-authoritative monetary calculations and order state transitions. Never trust client-supplied totals, prices, partner IDs or privileged role claims.
- Ensure idempotency for payment webhooks and other retried operations. Never mark a payment paid from client-side success UI alone.
- Model order states and transitions explicitly; persist an auditable status history and condition/inspection evidence.
- Use Supabase Auth and least-privilege access. Enable and test Row Level Security for all client-accessible tables; keep privileged/service-role keys server-side only. Do not log sensitive customer data, tokens or garment images.
- Secure uploads with ownership, type/size constraints and access policies; consider image retention and deletion.
- No hard-coded API keys, customer addresses, private photos, payment credentials or production data in Git.
- Follow applicable privacy, financial, and marketplace requirements before launch. Flag anything that needs legal or commercial verification.

## AI coding workflow

1. Inspect existing code before editing. Preserve working flows.
2. State the feature's acceptance criteria, data ownership, authorization and failure modes.
3. Implement incremental, reviewable changes rather than replacing the whole app.
4. Include or update tests, database constraints/policies and documentation for every meaningful feature.
5. Run available type checking, linting, unit/integration checks and describe what actually passed.
6. Explicitly disclose mocked APIs, sample records, untested assumptions and not-yet-connected services. Never claim "production-ready" without proof.
7. Avoid unsupported dependencies or unnecessary complexity. Don't install packages just for visual polish.
8. Never commit a feature that secretly depends on missing credentials, local-only paths or fake server responses without clear demo labeling.
9. Prefer readable code and named components; avoid enormous generated files.
10. Do not expose secrets. Use `.env.example` with placeholder values and document setup steps.

## First milestones

A. Confirm the Expo app runs on the physical Android device; keep existing local progress safe.
B. Establish shared types, database schema, versioned migrations, authorization design and setup docs.
C. Implement a true end-to-end customer service-discovery vertical slice backed by Supabase, then ordering and partner fulfillment.
D. Integrate real payments and live location only after secure operational foundations are tested.

Do not begin with real-payment collection or production customer data. Get approval before destructive migrations, deleting or rewriting user files, or enabling paid infrastructure.
