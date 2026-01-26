# Technical Decisions Log

> **See also:** MASTER_CONSOLIDATION_PLAN.md for comprehensive platform consolidation context.

---

## Claude Code Capabilities

### Deployment Tools
- **Vercel CLI** (v50.1.6): Deploy via `vercel --prod` - no GitHub remote needed
- **Supabase MCP**: Direct database access to `vault` project (spkimmrtaxwnysjqkxix)

### Supabase MCP Functions Available
| Function | Purpose |
|----------|---------|
| `mcp__supabase__list_tables` | List all tables in schema |
| `mcp__supabase__execute_sql` | Run SELECT/INSERT/UPDATE/DELETE queries |
| `mcp__supabase__apply_migration` | Apply DDL migrations (CREATE TABLE, ALTER, etc.) |
| `mcp__supabase__list_migrations` | View applied migrations |
| `mcp__supabase__get_project_url` | Get Supabase project URL |
| `mcp__supabase__generate_typescript_types` | Generate TypeScript types from schema |
| `mcp__supabase__get_logs` | Get logs by service (api, postgres, auth, etc.) |
| `mcp__supabase__get_advisors` | Security/performance recommendations |

### Workflow
1. **Schema changes**: Use `apply_migration` with SQL
2. **Data queries**: Use `execute_sql`
3. **Deploy**: Run `vercel --prod` via Bash
4. **Types**: Regenerate with `generate_typescript_types` after schema changes

---

## 2026-01-24 - Phase 4: Platform Unification

### The Official Merge
**Decision:** Merge Vault, CRM, and Packaging (mobile) into single CAKE Platform app
**Rationale:**
- All three apps share same Supabase database (vault project)
- All use same PIN authentication from `users` table
- Reduces maintenance burden (one codebase vs three)
- CRM already has shadcn/ui - natural foundation
- Role-based access controls what each user sees

### Architecture
| Component | Location | Notes |
|-----------|----------|-------|
| CRM (base) | `cake-crm` repo → becomes `cake-platform` | Foundation with shadcn/ui |
| Vault views | `/dashboard/vault/*` | Migrate from vault-inventory |
| Packaging views | `/dashboard/packaging/*` | Mobile-responsive task/inventory views |
| Packaging TV | Separate `packaging` repo | Stays as-is (TV display) |

### Role-Based Navigation
| Role | Visible Sections |
|------|-----------------|
| `admin` | All sections |
| `management` | All sections |
| `vault` | Vault, Products, Packaging |
| `packaging` | Packaging, Products |
| `agent` | Orders, Customers, Communications, Tasks |

### Route Structure
```
/dashboard              # Overview (role-aware)
/dashboard/vault        # Bulk packages, weight tracking
/dashboard/packaging    # Tasks, inventory levels
/dashboard/orders       # Order management
/dashboard/customers    # Dispensary profiles
/dashboard/products     # SKUs (shared)
/dashboard/communications
/dashboard/tasks
/dashboard/users        # Admin only
```

### Migration Plan
1. Update CRM navigation to be role-aware ✅
2. Add vault routes and migrate components using shadcn ✅
3. Add packaging routes (same data as TV, different UI) ✅
4. Rename app from "CAKE CRM" to "CAKE" ✅
5. Add vault admin views (strains, batches, product types) 🔄
6. Deprecate standalone vault-inventory app

### Phase 4 Progress
| Route | Purpose | Status |
|-------|---------|--------|
| `/dashboard/vault` | Package management, weight tracking | ✅ Complete |
| `/dashboard/packaging` | Inventory levels, task management | ✅ Complete |
| `/dashboard/vault/admin` | Strain/Batch/Type management | ✅ Complete |

### Files Added
- `types/vault.ts` - Vault types (VaultPackage, Transaction, Batch with `is_active`, etc.)
- `types/packaging.ts` - Packaging types (InventoryLevel, PackagingTask, etc.)
- `actions/vault.ts` - Server actions for vault operations
- `actions/packaging.ts` - Server actions for packaging operations
- `app/dashboard/vault/page.tsx` - Vault main page
- `app/dashboard/vault/admin/page.tsx` - Admin for strains, batches, product types
- `app/dashboard/packaging/page.tsx` - Packaging main page

### Batch Active/Inactive Feature (2026-01-24)
**Decision:** Admin can mark batches as inactive to hide from dropdowns
**Rationale:**
- Old batches (tags no longer in use) clutter dropdown selections
- 100+ batches makes selection difficult
- Inactive batches hidden from:
  - Vault page filter dropdown
  - Edit Package batch selector
  - New Package batch selector
- Admin page shows all batches with Status column and toggle button
- Inactive batches shown with reduced opacity (0.60)

**Implementation:**
- Added `is_active` boolean column to `batches` table (default: true)
- `getBatches({ activeOnly: true })` filters to active only
- `toggleBatchActive(id, isActive)` server action for admin toggle
- `getUniqueBatches()` joins with batches table to exclude inactive

### Orders In-Sheet Editing (2026-01-24)
**Decision:** Edit orders within the slide-in Sheet instead of a separate card below table
**Rationale:**
- Clicking table row opens Sheet with order details
- "Edit Order" button now switches Sheet content to edit mode (in-place)
- Keeps user focused in one UI container instead of jumping between Sheet and table-view edit card
- Dropdown menu (three dots) in Actions column also opens Sheet in edit mode directly

**Implementation:**
- Added `sheetEditMode` state to track view vs edit mode
- Sheet conditionally renders read-only view or edit form based on `sheetEditMode`
- `startSheetEditing(order)` sets edit mode and populates form
- `cancelSheetEditing()` returns to view mode without saving
- `saveSheetOrder()` saves changes, refreshes order data, returns to view mode
- Removed separate table-view edit card that appeared below the table
- Dropdown Edit action now opens Sheet directly in edit mode

---

## 2026-01-24 - Phase 3 Completion & Auth Fixes

### CRM Auth Loading Bug Fix
**Decision:** Set `isLoading` to false in the login callback
**Rationale:**
- After PIN login, dashboard was stuck on "Loading..." spinner
- Required page refresh to work
- Root cause: `login()` in AuthContext set user but never cleared `isLoading`
- Fix: Added `setIsLoading(false)` to `login()` callback in auth-context.tsx

### Dual Auth Support
**Decision:** Add `supabase_auth_id` and `email` columns to `users` table
**Rationale:**
- Warehouse staff (Vault/Packaging) use PIN auth
- Sales agents (CRM) may use email/password auth via Supabase Auth
- Single `users` table supports both auth methods
- `supabase_auth_id` links to `auth.users` when using Supabase Auth
- `pin` used for warehouse floor auth

### Migration Applied:
```sql
ALTER TABLE users ADD COLUMN supabase_auth_id UUID UNIQUE;
ALTER TABLE users ADD COLUMN email TEXT UNIQUE;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'standard', 'packaging', 'management', 'agent', 'vault'));
```

### Phase 3 Status: CRM Integration
| Item | Status |
|------|--------|
| CRM → vault Supabase | ✅ Complete |
| Unified users table | ✅ Complete |
| Unified orders table | ✅ Complete |
| Unified customers table | ✅ Complete |
| Unified skus table | ✅ Complete |
| PIN auth working | ✅ Complete |
| Auth loading fix | ✅ Complete |

---

## 2026-01-23 - CRM Table View & Schema Fixes

### CRM Orders Table View
**Decision:** Add table view alongside existing card view with toggle
**Rationale:**
- Card view good for quick overview, table view better for bulk management
- Sortable columns: order #, customer, status, created, delivery, total
- View preference stored in localStorage
- Edit panel appears below table when editing (same form, different placement)

### Implementation:
```typescript
type ViewMode = 'card' | 'table'
type SortField = 'order_number' | 'customer' | 'status' | 'order_date' | 'delivery_date' | 'total'
```
- Toggle buttons with LayoutGrid/List icons in header
- Click column header to sort (asc/desc toggle)
- Sort icons show current sort state
- Status badges with color coding in table cells

### Date Model Simplification
**Decision:** Remove `confirmed_delivery_date`, auto-set `delivered_at` on status change
**Rationale:**
- `confirmed_delivery_date` was redundant with `delivery_date`
- `delivered_at` now auto-set when status changes to "delivered"
- Simpler mental model: one delivery date field

### inventory_log FK Constraint Fix
**Decision:** Change `inventory_log.order_id` FK from `NO ACTION` to `SET NULL`
**Rationale:**
- Order deletion was failing due to FK constraint blocking delete
- `inventory_log` records linked to order prevented cascade
- `SET NULL` preserves audit trail (logs kept with null order_id)
- Orders can now be deleted while maintaining inventory history

### Migration Applied:
```sql
ALTER TABLE inventory_log DROP CONSTRAINT inventory_log_order_id_fkey;
ALTER TABLE inventory_log ADD CONSTRAINT inventory_log_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
```

---

## 2026-01-21 - Task State Persistence & Bug Fixes

### Cross-Device Task State Sync
**Decision:** Store task positions (TO FILL, TO CASE, DONE) in Supabase instead of localStorage
**Rationale:**
- Staff manage tasks from different devices (TV, tablet, phone)
- localStorage is browser-specific - changes on one device don't sync to others
- Database persistence ensures consistent view across all devices
- DONE column now survives page refreshes and works cross-device

### Implementation:
- Created `packaging_task_state` table with columns: task_key, sku, task_type, current_column, quantity, completed_at
- Added `saveTaskState()` on advance (TO_FILL→TO_CASE, TO_CASE→DONE)
- Added `saveTaskState()`/`deleteTaskState()` on revert
- Dashboard merges persisted state with generated tasks from allocation engine
- Old DONE tasks auto-cleaned up at start of each day

### Timezone Bug Fix
**Decision:** Parse delivery dates as local time, not UTC
**Rationale:**
- `new Date("2026-01-22")` parses as UTC midnight, shifts to previous day in local time
- Orders for "tomorrow" were showing wrong priority
- Fixed by appending `'T00:00:00'` to force local time: `new Date(date + 'T00:00:00')`

### Blocked Task Bug Fix
**Decision:** Use separate task keys for blocked vs ready tasks
**Rationale:**
- `addBlockedTask()` was using same key `FILL-{SKU}` as ready tasks
- Later blocked tasks were overwriting earlier READY tasks
- Fixed by using `BLOCKED-FILL-{SKU}` for blocked tasks
- Now Paseo CC (higher priority, fillable) shows correctly while Tulsa (lower priority, blocked) shows separately

---

## 2026-01-21 - CRM Improvements

### Order Number Race Condition Fix
**Decision:** Use PostgreSQL sequence for order number generation
**Rationale:**
- Original `generate_order_number()` used `COUNT(*) + 1` - race condition under concurrent inserts
- Created `order_number_seq` sequence
- Updated function to use `nextval('order_number_seq')`
- Guarantees unique order numbers even with simultaneous order creation

### Order Deletion
**Decision:** Trust CASCADE for order deletion
**Rationale:**
- Database has `ON DELETE CASCADE` on `order_items`, `packaging_task_sources`, `inventory_log`
- Cleaner code - just delete order, DB handles related records
- Added to Orders page with AlertDialog confirmation

### Customer Selection as Combobox
**Decision:** Replace Select with searchable Combobox for customer selection
**Rationale:**
- 72+ customers makes standard dropdown unusable
- Combobox allows typing to filter
- Uses shadcn Command + Popover components
- Proper scrolling for long lists

---

## 2026-01-21 - Supabase Integration Deployment

### Order Items line_total is Generated Column
**Decision:** Remove `line_total` from INSERT/UPDATE statements
**Rationale:**
- `line_total` is a PostgreSQL generated column (computed from quantity * unit_price)
- Cannot be written to directly - causes 400 error
- Database auto-calculates on insert/update

### Manual Inventory Adjustment via SKU Cards
**Decision:** Click SKU card in inventory panel to open edit modal
**Rationale:**
- Vault Manager needs to correct CASED/FILLED/STAGED to match physical counts
- Quick access from existing UI (no new page needed)
- All changes logged to inventory_log table for audit

### Order Status Processing Timestamps
**Decision:** Use `packed_at` and `delivered_at` to track processed state
**Rationale:**
- Similar to Google Sheets "PACKED" flag in Column R
- Null = not yet processed, timestamp = already processed
- Prevents double-deduction from CASED
- Enables reversal detection (packed_at set but status reverted)

### Vercel Environment Variables Required
**Decision:** Document required Vercel env vars for Supabase
**Required variables:**
- `DATA_SOURCE=supabase`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
**Rationale:**
- Local .env.local works for dev
- Vercel needs explicit configuration
- 500 error if missing (throws "Missing Supabase environment variables")

---

## 2026-01-20 - Platform Consolidation

### Single Supabase Project
**Decision:** Use existing `vault` Supabase project (spkimmrtaxwnysjqkxix) for all three apps
**Rationale:**
- Vault already has working schema and data
- Single source of truth for all shared entities
- Simpler deployment and management
- Real-time subscriptions available across apps

### Unified Auth with PIN
**Decision:** Use PIN-based auth for warehouse/packaging staff (same as vault)
**Rationale:**
- Warehouse staff don't have email accounts
- PIN is fast for warehouse floor use
- Simple 4-digit entry on touch screens
- CRM can keep Supabase Auth for sales team (email/password)

### SKU Management in Vault
**Decision:** SKU creation/management happens in Vault app, not Packaging
**Rationale:**
- Vault already manages strains and product types
- SKU = Strain + Type (A/B Buds)
- Single place for product hierarchy management
- Packaging just consumes SKU data

### Order Flow: CRM → Packaging
**Decision:** Orders created in CRM, fulfilled in Packaging dashboard
**Rationale:**
- Sales agents create orders with delivery dates
- Management confirms orders
- Packaging sees confirmed orders and fulfills
- Status flows back to CRM (packed/delivered)
- Clear separation of concerns

### Unified Order Status
**Decision:** Single status flow: pending → confirmed → packed → delivered
**Rationale:**
- CRM had: pending → submitted → approved
- Packaging had: Pending → Confirmed → Packed → Delivered
- Unified flow covers both use cases
- "confirmed" replaces both "submitted" and "approved"

### UI Framework: shadcn/ui
**Decision:** Adopt shadcn/ui across all apps
**Rationale:**
- CRM already uses shadcn (most sophisticated UI)
- shadcn is copy-paste, not a dependency
- Same Tailwind foundation as vault/packaging
- Consistent look across all interfaces

### Monorepo Structure (Future)
**Decision:** Plan for monorepo with shared packages
**Rationale:**
- Shared components (buttons, cards, modals)
- Shared types from Supabase
- Single deployment pipeline
- Each app keeps own entry point

### Data Migration with Rollback
**Decision:** Keep Google Sheet as backup, add DATA_SOURCE toggle
**Rationale:**
- Can flip back to sheets if Supabase has issues
- One-time migration, but sheet stays read-only
- Low-risk transition
- Verify Supabase works before deprecating sheets

### Container ↔ Vault Linkage
**Decision:** Track which vault package was used to stage each container
**Rationale:**
- Traceability from finished goods to source material
- Supports compliance requirements
- Audit trail for weight usage

---

## 2026-01-16

### Kanban Board Layout
**Decision:** Replace task list with 3-column Kanban board (TO FILL | TO CASE | DONE)
**Rationale:**
- Status is instantly visible by column position
- More tasks visible at once (compact cards)
- Natural left-to-right flow matches physical workflow
- DONE column gives crew progress visibility / satisfaction

### Card Placement by Inventory State
**Decision:** Card column determined by inventory state, not manually assigned
**Rationale:**
- FILLED < demand → TO FILL column
- FILLED >= demand → TO CASE column
- Completed → DONE column
- Dashboard auto-reflects reality, no manual toggle needed

### DONE Column Storage
**Decision:** ~~Use localStorage~~ → Now stored in Supabase `packaging_task_state` table
**Rationale:**
- Originally localStorage (browser-specific, doesn't sync)
- Updated 2026-01-21 to Supabase for cross-device sync
- Completed tasks stored with `completed_at` timestamp
- Auto-cleaned at start of each day (keeps only today's DONE tasks)

### Blocked Cards
**Decision:** Dimmed/greyed cards with "Needs Staged" label, click disabled
**Rationale:**
- "Needs Staged" is specific and actionable
- Dimmed visual clearly shows it can't be worked
- Stays in TO FILL column until inventory available

### Card Interaction
**Decision:** Click to advance, drag back to undo, no confirmation
**Rationale:**
- Single click is fast for crew workflow
- Drag back handles mistakes without confirmation dialogs
- Crew decides on container handling based on time/staffing

### Container Handling by Priority
**Decision:** URGENT/TOMORROW = crew decides; UPCOMING/BACKFILL = full container
**Rationale:**
- URGENT/TOMORROW are time-constrained - crew decides based on situation
- UPCOMING/BACKFILL have time - efficient to fill full container
- Flexibility for urgent situations, efficiency for non-urgent

### Staging Tab (New)
**Decision:** Separate "Staging" tab in Google Sheet for container tracking
**Rationale:**
- Keeps Orders tab focused on orders and quantities
- Container-level tracking (each row = one container)
- Vault Manager can add/edit/remove via dashboard
- Status column: AVAILABLE or USED

### Vault Manager Container Management
**Decision:** Dashboard handles all staging input (add, edit, remove)
**Rationale:**
- Single interface for all users
- Less room for data entry errors
- Dashboard controls all inventory flow
- Edit capability handles mistakes

### Priority Tier System
**Decision:** 4-tier system: URGENT → TOMORROW → UPCOMING → BACKFILL
**Rationale:**
- URGENT = same-day delivery, after-hours order (rare emergency)
- TOMORROW = delivery tomorrow, must be cased today
- UPCOMING = 2-3 days out, can be worked on when time permits
- BACKFILL = no order, building stock to target of 8
- Crew's daily responsibility: URGENT and TOMORROW must be done

### Sheet Update Strategy
**Decision:** Update inventory rows on card actions, staging tab for containers
**Rationale:**
- TO FILL → TO CASE: STAGED -, FILLED +, container marked USED
- TO CASE → DONE: FILLED -, CASED +
- Drag back: Reverse operations
- All changes atomic to prevent inconsistency

### Task Naming
**Decision:** Use "Fill" and "Case" instead of "Weigh & Fill" and "Seal & Case"
**Rationale:**
- Shorter, cleaner for TV display
- Crew knows what each step entails
- Column headers make action clear

### Order vs Backfill Task Separation
**Decision:** Separate task keys to keep order and backfill tasks distinct
**Rationale:**
- Prevents backfill quantities from inflating urgent task numbers
- Crew sees actual order demand in urgent/tomorrow
- Backfill clearly separate and optional

### Customer Names Removed
**Decision:** Don't show customer names on task cards
**Rationale:**
- Crew just needs: SKU, quantity, priority
- Customer info not relevant to packaging work
- Cleaner TV display

### SKU Card Grouping
**Decision:** Group inventory cards into A's and B's rows
**Rationale:**
- A's = standard products (no suffix)
- B's = B-variant products (-B suffix)
- Matches physical organization
- Easier visual scanning

### Keep Inventory Bar
**Decision:** Keep inventory status bar above Kanban board
**Rationale:**
- Useful for vault staging manager (sees what needs staging)
- Useful for packaging manager (sees overall inventory health)
- "+ Add Container" button located here

---

## 2026-01-25 - Users & Permissions System

### Role Structure
**Decision:** 4 roles: admin, management, sales, standard
| Role | Description |
|------|-------------|
| `admin` | Full system access, user management |
| `management` | View all, approve orders, manage all data |
| `sales` | CRM access, manage assigned accounts, create orders for assigned only |
| `standard` | Vault & Packaging access only |

### Role-Based Navigation
**Decision:** Different dashboard sections visible per role
| Role | Visible Sections |
|------|-----------------|
| `admin` | All sections |
| `management` | All sections |
| `sales` | Dispensaries, Orders |
| `standard` | Vault, Packaging |

### Sales Account Assignment
**Decision:** Add `assigned_sales_id` to customers table
**Rationale:**
- Sales users can VIEW all dispensaries
- Sales users can ADD dispensaries (auto-assigned to them)
- Sales users can LOG communications for any dispensary
- Sales users can only PLACE ORDERS for their assigned dispensaries
- Management/Admin can reassign accounts

### Order Permissions
**Decision:** Role-based order actions
| Action | Allowed Roles |
|--------|--------------|
| Create order | sales, management, admin |
| Approve/confirm order | management, admin |
| Edit any order | management, admin |
| Delete order | management, admin |

**Sales Restriction:** Can only create orders for dispensaries where `assigned_sales_id = current_user_id`

### Implementation Plan
1. **Database Changes:**
   - Update `users.role` enum to include 'sales'
   - Add `assigned_sales_id` column to `customers` table
   - Optional: `user_permissions` table for granular overrides

2. **Auth Context Updates:**
   - Add permission helper functions
   - `canCreateOrder(customerId)` - checks role + assignment
   - `canApproveOrder()` - management/admin only
   - `canEditOrder()` - management/admin only

3. **UI Updates:**
   - Update dashboard layout nav filtering
   - Hide "New Order" button for unassigned dispensaries (sales role)
   - Hide approve/edit buttons based on role
   - Add sales assignment UI in dispensary detail page

4. **User Management:**
   - Use existing CRM user management pages
   - Add role selection with 4 options
   - Add "Assigned Accounts" section for sales users
