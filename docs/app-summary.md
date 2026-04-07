# CAKE Platform -- Application Summary

**Document type:** Business overview (non-technical)
**Last updated:** March 31, 2026
**Prepared for:** Joshua Stokes, COO

---

## What It Is

The CAKE Platform is a unified web application built to manage CAKE's wholesale cannabis operations in Oklahoma. It consolidates customer relationship management, order fulfillment, vault inventory, packaging task management, materials tracking, commission calculations, and compliance communications into a single system.

The platform replaces three previously separate tools (vault inventory, packaging dashboard, and CRM) under one application backed by a single database. It is used daily by sales staff, warehouse personnel, and management across CAKE's operations.

---

## Who Uses It

| Role | Who | What They Do |
|------|-----|--------------|
| Admin | Operations leadership | Full platform access including user management |
| Management | Department leads | Full access except user administration |
| Sales / Agent | Field sales reps | Manage orders, dispensary relationships, communications, and personal commissions |
| Vault | Warehouse staff (vault) | Manage bulk cannabis packages, batches, strains, and inventory |
| Packaging | Warehouse staff (packaging) | Run packaging task boards, track materials and inventory |
| Standard | General warehouse | Access vault, packaging, and product catalogs |

**Authentication:** Warehouse staff log in with a 4-digit PIN for speed. Sales and CRM users log in with email and password. Both methods are supported simultaneously.

**Device usage:** The app is mobile-responsive and installable as a PWA on phones, which is how most sales and warehouse staff access it day-to-day.

---

## Platform Modules

### Dashboard
Role-aware home screen showing personal metrics: recent orders, revenue, open tasks, and communication activity.

### Vault
Bulk cannabis package management. Track weights, manage batches, strains, and product types. Full transaction history for audit and compliance purposes. Admin panel for batch and strain configuration.

### Packaging
Kanban-style task board managing the packaging workflow: TO FILL, TO CASE, DONE. Real-time inventory levels across containers. Priority-based task allocation (urgent, tomorrow, upcoming, backfill). Task notes sync across devices. Undo support for task state changes.

### Inventory
Real-time SKU-level inventory dashboard. Aggregates data from vault packages and packaging activity to show current stock levels.

### Materials
Tracks packaging materials: jars, lids, mylar bags, labels. Provides visibility into supply levels for packaging operations.

### Orders
Full order lifecycle management from pending through confirmed, packed, and delivered. Supports both table and card views. Features include in-sheet editing with case-based quantities, customer-specific pricing, delivery date tracking, and summary statistics showing revenue and commission totals. Editing permissions are role-restricted.

### Dispensaries
Customer profiles for wholesale dispensary accounts. Tracks DBA names, license names (for OMMA compliance), multiple contacts per dispensary, sales rep assignments, and customer-specific pricing. Each dispensary profile includes an orders tab for direct order management.

### Communications
Log calls, emails, meetings, and notes against each dispensary. Tracks date, time, and which team member made the entry. Provides a communication history for each account.

### Commissions
Rate management by salesperson, SKU, and product type with price tier support. Commissions are auto-calculated when orders are marked as delivered (via database trigger). Includes an approval workflow: pending, approved, paid. Per-line-item breakdown for transparency. Separate views for admin reporting and individual sales performance.

### Products
SKU catalog management. Maintains the product catalog used across orders, inventory, and commission calculations.

### Tasks
General task management for operational to-dos outside of packaging workflows.

### Users
Admin-only user management. Create and manage user accounts, assign roles, and link authentication credentials.

---

## Current State

### Working and in Production

- Full authentication system (PIN-based and email/password)
- Vault inventory management with transaction history
- Packaging Kanban board with real-time cross-device sync
- Inventory dashboards with live SKU levels
- Order management with role-based permissions and quick status changes
- Dispensary and contact management with sales rep assignment
- Communications logging
- Commission system with auto-calculation on delivery, per-line breakdowns, and admin approval workflow
- Role-based access control across all modules
- Mobile-responsive design with PWA support (installable on phones)

### Known Gaps and Incomplete Items

| Item | Status | Impact |
|------|--------|--------|
| Test coverage | Zero tests written (framework configured) | Higher risk of regressions when making changes |
| Materials-to-packaging integration | Materials tracking is built but not wired into packaging task completion | Packaging staff must track material usage manually |
| Legacy code cleanup | Old packaging components remain in the codebase | No user impact; developer housekeeping |
| Build error checking | TypeScript and linting errors are ignored during builds | Possible runtime errors reaching production |
| Old database project | Previous Supabase project still active | Should be archived to avoid confusion and unnecessary cost |
| Production URL documentation | Deployed URL not recorded in the repository | Onboarding friction for new team members |

---

## Technology Overview

This section is included for stakeholder context, not as a technical reference.

| Layer | Technology |
|-------|-----------|
| Application | Next.js 16 + React 19 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui component library |
| Database | Supabase (managed PostgreSQL) |
| Hosting | Vercel |
| Mobile | Progressive Web App (installable, no app store required) |

The platform is deployed via Vercel's CLI. Database schema changes are managed through Supabase migrations. There is no CI/CD pipeline -- deployments are manual via command line.

---

## Deployment and Access

- **Deployment:** Manual via `vercel --prod` CLI command
- **Database:** Supabase vault project (`spkimmrtaxwnysjqkxix`)
- **Packaging TV display** (separate application): https://process.cakeoklahoma.com

---

## Related Systems

| System | Description |
|--------|------------|
| cake-site | CAKE company website |
| cake-menu | Product menu / catalog |
| cake-vault | Original standalone vault app (consolidated into this platform) |
| TJD Supplements | Related dispensary entity with shared cost structures |

---

*This document reflects the platform state as of March 31, 2026. For technical details, see `docs/KB.md` and `CLAUDE.md` in the repository.*
