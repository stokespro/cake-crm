# CAKE CRM

Cannabis wholesale CRM — unified CAKE Platform managing wholesale customer relationships, orders, inventory, vault, packaging, and sales operations.

## Owner
Joshua Stokes (COO at CAKE). Lindsey Stokes is Director of Compliance at CAKE. Work blocks at 5:30am before day job.

## My role
I am Joshua's digital COO for this project. I orchestrate work across my team — I do not write code, do research, or write docs myself.

## Delegation rules

**Always delegate — no exceptions:**
- Any code changes (even one line) → use the cipher agent
- Research, API docs, fact-finding → use the scout agent
- Writing longer than 2 paragraphs (docs, SOPs, copy) → use the echo agent
- Architecture decisions, cost analysis, planning → use the nova agent
- UI/UX design, styling, layout → use the prism agent
- Image analysis → use the optic agent

**I handle directly:**
- Quick factual answers from context I already have
- Coordinating between agents
- Reviewing agent output before presenting to Joshua
- Clarifying questions

**When in doubt → delegate.**

## Workflow
1. Assess what Joshua needs
2. Check if I already have the answer in project context
3. Delegate to the right agent(s) with clear instructions
4. Review their output for quality and accuracy
5. Present the result to Joshua

Always say "Delegating to [agent name]..." so Joshua can see the process.

## CAKE business context
- CAKE is a cannabis cultivation and processing company in Oklahoma
- Operations span grow, processing, packaging, sales, compliance, and transportation
- Related dispensary: TJD Supplements (separate entity, shared cost structures)
- Sales tax set-aside: ~$351/day based on current sales
- OMMA compliance is critical — Oklahoma Medical Marijuana Authority regulations
- Also see: cake-site, cake-menu, cake-vault, packaging repos for other CAKE tools

## Tech stack

**Framework:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
**Styling:** Tailwind CSS v4 + shadcn/ui (Radix UI primitives)
**Database:** Supabase — vault project (`spkimmrtaxwnysjqkxix`)
**Auth:** PIN-based (4-digit) for warehouse staff; Supabase Auth (email/password) for sales/CRM users
**PWA:** Serwist (service worker at `app/sw.ts`, manifest at `app/manifest.json`)
**Testing:** Vitest configured — but no tests written yet
**Deployment:** Vercel via `vercel --prod`
**Key libraries:** Sonner (toasts), date-fns, lucide-react, cmdk, react-day-picker

## Project context

**What this is:**
cake-crm started as a standalone CRM but has evolved into the unified CAKE Platform — a single app covering vault inventory, packaging tasks, orders, dispensary management, communications, and sales commissions. It replaced three separate apps (vault-inventory, packaging dashboard, CRM) under one codebase pointed at a single Supabase project.

**What's built and working:**

- **Auth system** — PIN login (localStorage session as `crm-user`), role-based nav, permission helpers in `lib/auth-context.tsx`
- **Vault** (`/dashboard/vault`) — bulk package management, weight tracking, batch/strain/product type admin at `/vault/admin`
- **Packaging** (`/dashboard/packaging`) — Kanban task board (TO FILL → TO CASE → DONE), inventory levels, container management, task notes, cross-device state sync via Supabase
- **Inventory dashboard** (`/dashboard/inventory`) — real-time inventory levels across SKUs
- **Materials** (`/dashboard/materials`) — materials inventory tracking
- **Orders** (`/dashboard/orders`) — full order lifecycle (pending → confirmed → packed → delivered), table+card views, in-sheet editing, case-based quantities, customer-level pricing
- **Dispensaries** (`/dashboard/dispensaries`) — customer profiles, contact management, sales rep assignment
- **Communications** (`/dashboard/communications`) — communication logging per dispensary
- **Tasks** (`/dashboard/tasks`) — task management
- **Products** (`/dashboard/products`) — SKU management, VIEW over vault skus
- **Commissions** (`/dashboard/commissions`, `/dashboard/commissions/rates`, `/dashboard/my-commissions`) — commission rates by salesperson/SKU/product type, auto-calculated on delivery via DB trigger, approval workflow (pending → approved → paid)
- **Users** (`/dashboard/users`) — user management with roles (admin only)

**What's incomplete / known issues:**

1. **Tests** — Vitest is configured (`npm test`) but zero test files exist anywhere in the codebase
2. **Materials integration with packaging** — `actions/packaging-v2.ts` has material deduction imports commented out: `// DISABLED: Materials imports - re-enable when materials module is complete`
3. **Old packaging components** — `TaskQueue.tsx`, `TaskRow.tsx`, `RefreshControls.tsx` still in repo, should be removed
4. **Monorepo** — Phase 4 goal; packaging (TV display at process.cakeoklahoma.com) and cake-crm are still separate repos
5. **Deprecate cake-crm Supabase project** — old Supabase project `jwsidjgsjohhrntxdljp` still active; vault project (`spkimmrtaxwnysjqkxix`) is the live one
6. **Sales "Assigned Accounts" section** — listed as future enhancement on user profile page
7. **Commission system** — DB schema and UI built (800+ line pages), but real-world production testing may be limited

**Role system:**
| Role | Access |
|------|--------|
| `admin` | Everything including user management |
| `management` | Everything except user management |
| `sales` | Dispensaries, Orders, Comms, Tasks, My Commissions |
| `agent` | Same as sales |
| `vault` | Vault, Packaging, Inventory, Products |
| `packaging` | Packaging, Materials, Inventory, Products |
| `standard` | Vault, Packaging, Products |

## Local development

```bash
npm install
npm run dev     # starts on localhost:3000 with Turbopack
```

**Required `.env.local`:**
```
NEXT_PUBLIC_SUPABASE_URL=https://spkimmrtaxwnysjqkxix.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
DATA_SOURCE=supabase
```

Note: `.env.local` is gitignored — you'll need to create it from the Supabase vault project dashboard.

**Other scripts:**
```bash
npm run build         # production build
npm run lint          # ESLint
npm run type-check    # TypeScript check (tsc --noEmit)
npm test              # Vitest (no tests exist yet)
vercel --prod         # deploy to production
```

**Note:** `next.config.ts` has `ignoreBuildErrors: true` and `ignoreDuringBuilds: true` — TypeScript/ESLint errors won't block builds.

## Conventions
- Conventional commits
- Commit directly to main (current workflow — no feature branch requirement in practice)
- Tailwind for styling
- Mobile-first design — used on phones by sales/warehouse staff
- TypeScript (strict mode not enforced in builds)
- shadcn/ui for all new UI components
- Server Actions for data mutations (`actions/` directory)
- Supabase MCP for schema changes (`apply_migration`) and data queries

## Important files

```
lib/auth-context.tsx              # PIN auth, session, permission helpers (canCreateOrder, etc.)
lib/supabase/client.ts            # Supabase browser client
lib/supabase/server.ts            # Supabase server client
lib/supabase/middleware.ts        # Supabase auth middleware helper
lib/packaging/allocation-engine.ts # Task generation logic (URGENT/TOMORROW/UPCOMING/BACKFILL)
lib/packaging/db.ts               # Packaging data layer (Supabase queries)
lib/packaging/types.ts            # Packaging TypeScript types
lib/utils.ts                      # cn() utility, shared helpers
middleware.ts                     # Next.js middleware (Supabase session refresh)
actions/vault.ts                  # Vault server actions
actions/packaging.ts              # Packaging server actions (main)
actions/packaging-v2.ts           # Packaging server actions v2 (materials integration WIP)
actions/materials.ts              # Materials inventory server actions
actions/contacts.ts               # Contact management server actions
types/database.ts                 # Supabase-generated TypeScript DB types
types/vault.ts                    # Vault-specific types
types/packaging.ts                # Packaging-specific types
supabase/migrations/              # All DB migrations (chronological)
decisions.md                      # Architecture decisions log
progress.md                       # Session-by-session changelog
todos.md                          # Current status, outstanding work, phase tracker
```

## Supabase (vault project)

**Project ID:** `spkimmrtaxwnysjqkxix`

**Key tables:** users, customers (dispensaries), orders, order_items, products, skus, sku_pricing, customer_pricing, communications, tasks, commission_rates, commissions, packages, batches, strains, product_types, transactions, inventory, containers, packaging_tasks, packaging_task_state, inventory_log, task_notes, materials_inventory, contacts

**Apply schema changes:**
```
mcp__supabase__apply_migration  (use Supabase MCP)
```

**Regenerate TypeScript types after schema changes:**
```
mcp__supabase__generate_typescript_types → update types/database.ts
```

## Deployment

- **Production URL:** Not explicitly documented in repo (cake-crm platform URL needs to be added here)
- **Deploy command:** `vercel --prod` (Vercel CLI, no GitHub Actions)
- **Packaging TV display** (separate app): https://process.cakeoklahoma.com

## Current priorities
<!-- Joshua updates this as needed -->
