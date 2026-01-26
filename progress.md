# Progress Log

## Session - 2026-01-26

### Completed - UX Improvements

77. **Searchable Customer Combobox** - Communications & Tasks forms:
    - Updated `app/dashboard/communications/new/page.tsx`
    - Updated `app/dashboard/tasks/new/page.tsx`
    - Replaced basic Select with Popover + Command pattern (matching Orders page)
    - Enables search/filter for 70+ customers
    - Commit: `465309d`
    - Deployed to production ✅

---

## Session - 2026-01-16

### Completed - Infrastructure
1. Project initialization (Next.js 14, TypeScript, Tailwind)
2. Google Sheets API integration with service account
3. Core allocation engine for task generation
4. API routes (dashboard, task start, task complete)
5. Initial UI components (InventoryStatusBar, TaskQueue, TaskRow)
6. SKU cards grouped into A's and B's
7. Removed customer names from task display
8. Fixed date serialization bug in TaskRow
9. Separated order tasks from backfill tasks (different task keys)
10. Major planning session - redesigned entire UI approach

### Completed - New Architecture Implementation
11. **types.ts** - Updated with:
    - TOMORROW priority tier added
    - Container type (SKU, size, dateAdded, status, rowNumber)
    - KanbanColumn type (TO_FILL, TO_CASE, DONE)
    - ContainerSize type (1, 2, 3, 4, 8)
    - ContainerStatus type (AVAILABLE, USED)
    - Task types changed from WEIGH_AND_FILL/SEAL_AND_CASE to FILL/CASE
    - Task now includes `column` property
    - CompletedTask type for localStorage
    - API request types (AddContainerRequest, EditContainerRequest, TaskAdvanceRequest)

12. **sheets.ts** - Added staging tab functions:
    - readStagingContainers()
    - addContainer()
    - editContainer()
    - removeContainer()
    - markContainerUsed()
    - markContainerAvailable()
    - getStagedTotals()
    - findAvailableContainer()

13. **allocation-engine.ts** - Updated with:
    - TOMORROW priority calculation (delivery = tomorrow)
    - Column assignment based on inventory state
    - New task types (FILL/CASE)
    - getTasksByColumn() helper function

14. **utils.ts** - Added:
    - isTomorrow() function
    - Updated getTaskTypeName() for new types
    - Updated getPriorityName() for TOMORROW

15. **dashboard/route.ts** - Updated to include containers in response

### Completed - Kanban UI Implementation
16. **Staging API Routes** - Created:
    - POST /api/staging/add - Add new staged container
    - POST /api/staging/edit - Edit existing container
    - POST /api/staging/remove - Remove container from staging

17. **Task Action API Routes** - Created:
    - POST /api/tasks/[taskId]/advance - Move card forward (TO_FILL → TO_CASE → DONE)
    - POST /api/tasks/[taskId]/revert - Move card backward (undo)

18. **Kanban Components** - Created:
    - TaskCard.tsx - Draggable task card with priority badge, SKU, quantity
    - KanbanColumn.tsx - Column wrapper with drop handling
    - KanbanBoard.tsx - 3-column Kanban layout (TO FILL, TO CASE, DONE)
    - AddContainerModal.tsx - Modal for adding/viewing/removing staged containers

19. **Updated Components**:
    - InventoryStatusBar.tsx - Added "+ Add Container" button
    - page.tsx - Replaced TaskQueue with KanbanBoard, integrated container modal

20. **DONE Column Features**:
    - Completed tasks stored in localStorage
    - Daily reset on new day (checks date on load)
    - Tasks display with proper styling

### Build Status
✅ Build passing

### Completed - Setup
21. **Google Sheet** - Created "Staging" tab with header row (SKU, Size, Date Added, Status)

### Completed - Bug Fixes
22. **sheets.ts** - Fixed `readSKUInventory()` bug:
    - Was reading wrong rows (only 2-3 instead of 2-4)
    - Staged and filled values were swapped
    - Now correctly reads CASED (row 2), FILLED (row 3), STAGED (row 4)

23. **sheets.ts** - Updated staging functions to sync with main sheet:
    - `addContainer()` now also increments Row 4 (STAGED) on main sheet
    - `removeContainer()` now also decrements Row 4 (STAGED) if container was AVAILABLE

### Completed - UI Enhancements
24. **InventoryStatusBar.tsx** - Collapsible inventory panel:
    - Added collapse/expand functionality with dedicated toggle bar
    - Toggle bar shows timestamp on left, "Hide/Show Inventory" in center
    - Removed refresh/add buttons from top row (cleaner panel)

25. **InventoryStatusBar.tsx** - Floating Action Button (FAB) menu:
    - Fixed position in bottom-right corner
    - Expandable menu with refresh and add container buttons
    - Plus icon rotates to X when menu is open
    - Neutral zinc colors for all buttons

26. **TaskCard.tsx** - Fixed hover overflow issue:
    - Removed `hover:scale-[1.02]` that caused horizontal scrollbar
    - Replaced with `hover:brightness-110` for non-scaling hover effect

27. **KanbanColumn.tsx** - Hidden scrollbars:
    - Added `scrollbar-hidden` class to task list container
    - Scrolling still works via touch/mouse wheel

28. **globals.css** - Added scrollbar-hidden utility:
    - Hides scrollbars across all browsers (Chrome, Firefox, Safari, Edge)
    - Maintains scroll functionality

29. **utils.ts** - Business day logic for weekends:
    - Added `getNextBusinessDay()` function (skips Saturday/Sunday)
    - Updated `isTomorrow()` to use business days (Friday → Monday)
    - Updated `formatDate()` to show "Monday" instead of "Tomorrow" on weekends

30. **advance/route.ts** - Row 4 as source of truth:
    - Staging tab is now optional for advancing tasks
    - Row 4 (STAGED) is the authoritative source
    - If Staging tab has entry, marks as USED; if not, proceeds anyway

### Completed - TaskCard Redesign
31. **TaskCard.tsx** - Compact card layout:
    - Moved quantity (x2) to same line as SKU
    - Quantity styled as `text-base font-semibold text-zinc-300` (smaller than SKU but bold)
    - Added right arrow icon in top-right for advanceable cards
    - "Needs Staged" shown in red for blocked cards (replaces arrow)
    - Removed "Click to advance" text to reduce card height
    - Removed redundant blocked reason section at bottom

### Completed - Deployment
32. **Vercel Deployment** - Successfully deployed to production:
    - Domain: https://process.cakeoklahoma.com
    - Fixed environment variable issue: trailing newlines in `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SHEET_ID`
    - Root cause: `echo` adds newlines, fixed by using `printf '%s'`
    - Created debug endpoint to diagnose env var format issues
    - New service account key generated (old one may have been exposed)

33. **sheets.ts** - Improved private key handling:
    - Handles both escaped `\n` and real newlines
    - Strips surrounding quotes if present
    - Works with both local `.env.local` and Vercel production

## Session - 2026-01-20

### Completed - Bug Fixes
34. **page.tsx** - Fixed DONE column timezone issue:
    - `getTodayString()` was using `toISOString()` which returns UTC
    - Changed to use local time methods (`getFullYear()`, `getMonth()`, `getDate()`)
    - DONE column now resets at local midnight instead of 6 PM CST

35. **allocation-engine.ts** - Fixed backfill quantity logic:
    - Backfill was capping at target (8) minus current CASED
    - Changed to process ALL remaining staged/filled inventory
    - Creates tasks for all available inventory to keep stock moving

### Completed - UI Updates
36. **InventoryStatusBar.tsx** - Label changes:
    - Changed "Need:" to "Orders:"
    - Changed "Gap:" to "Stage:"

### Completed - Order Status Processing Feature
37. **types.ts** - Updated Order interface:
    - Added `lastDeliveryDate: string` (Column R)
    - Added `orderBackup: OrderBackup | null` (Column S)
    - Added `OrderBackup` interface for JSON storage

38. **sheets.ts** - Major updates for order processing:
    - Updated `readOrders()` to read columns A-S (was A-Q)
    - Added `parseOrderBackup()` function
    - Added `setColumnR()` function
    - Added `setOrderBackup()` function
    - Added `clearOrderQuantities()` function
    - Added `deductFromCased()` function
    - Added `restoreToCased()` function
    - Added `processOrderStatusChanges()` - main processing function

39. **dashboard/route.ts** - Integrated order processing:
    - Calls `processOrderStatusChanges()` on every request
    - Processes Packed/Delivered status changes before reading inventory

### Order Status Processing Logic
- **Packed**: Deduct from CASED, set Column R to "PACKED"
- **Delivered**: Deduct from CASED (if not already), backup to Column S, set Column R to date, clear quantities
- **Packed → Pending/Confirmed**: Restore CASED, clear Column R
- **No automatic reversal from Delivered**: Use Column S backup as manual reference

### What's Next
1. Clean up old components (TaskQueue.tsx, TaskRow.tsx, RefreshControls.tsx)
2. Test on actual TV
3. Monitor production for any issues

### Known Issues
- Dev server occasionally hangs (Google Sheets API rate limit?)

### Environment
- Service account: packaging-dashboard@cake-inventory-484402.iam.gserviceaccount.com
- Sheet ID: 19vJf1ZUnawuc70YZ8s0w3tQAkFFNXhpRmPojHkjqheQ
- Local dev: http://localhost:3000
- Production: https://process.cakeoklahoma.com
- **Deployment**: Use `vercel --prod` (Vercel CLI, no GitHub remote)

### Session - 2026-01-20 (continued)

### Completed - Expandable Task Cards with Notes
40. **TaskCard.tsx** - Major redesign:
    - Click card to expand (shows orders list and notes section)
    - CircleArrowRight button in top-right to advance card (themed to priority color)
    - Truncated note preview shown on collapsed cards
    - Notes section with inline editing (save/cancel buttons)

41. **sheets.ts** - Task notes functions:
    - Added `TASK_NOTES_TAB` constant
    - Added `readTaskNotes()` - reads from TaskNotes tab (no header row)
    - Added `saveTaskNote()` - upserts notes to sheet
    - Added `deleteTaskNoteRow()` - removes empty notes
    - **Bug fix**: Changed row offset from A2:B500 to A1:B500 (data starts at row 1, no header)

42. **api/notes/route.ts** - New API route:
    - GET: Returns all task notes
    - POST: Saves/updates a task note

43. **types.ts** - Added `taskNotes: Record<string, string>` to DashboardData

44. **KanbanBoard.tsx, KanbanColumn.tsx** - Pass taskNotes and onNoteChange through component tree

45. **page.tsx** - Added:
    - `taskNotes` state
    - `handleNoteChange()` function with optimistic updates
    - Loads notes from dashboard API response

### Completed - iOS Safari Background Fix
46. **globals.css** - Fixed white background on iOS Safari:
    - Removed `prefers-color-scheme` media query (was relying on system preference)
    - Set `--background: #09090b` (zinc-950) as default, not white
    - Added `html { background-color: #09090b; min-height: 100%; }`
    - Added `min-height: 100%` to body

47. **layout.tsx** - Added dark background classes:
    - Added `bg-zinc-950` to `<html>` element
    - Added `min-h-screen` to `<body>` element
    - Ensures consistent dark background across all devices/browsers

---

## Platform Consolidation Project - 2026-01-20

### Context
User requested consolidation of THREE separate apps into ONE unified platform:
1. **Vault Inventory** (`/Users/joshuastokes/Documents/Projects/vault/vault-inventory`)
2. **Packaging Dashboard** (`/Users/joshuastokes/Documents/Projects/packaging`)
3. **CRM** (`/Users/joshuastokes/Documents/Projects/cake/cake-crm`)

### Completed - System Analysis
48. **Reviewed Vault Inventory:**
    - Supabase project: `vault` (spkimmrtaxwnysjqkxix)
    - Tables: users, product_types, strains, batches, packages, transactions
    - Auth: PIN-based (4-digit)
    - UI: Next.js 16 + Tailwind 4, custom components

49. **Reviewed CRM:**
    - Supabase project: `cake-crm` (jwsidjgsjohhrntxdljp) - will deprecate
    - Tables: profiles, dispensary_profiles, products, product_pricing, communications, tasks, orders, order_items
    - Auth: Supabase Auth (email/password)
    - UI: Next.js 15 + Tailwind 4 + **shadcn/ui**
    - Status: Incomplete, test data only

50. **Identified Overlapping Entities:**
    - Users: vault.users vs crm.profiles
    - Strains: vault.strains vs crm.products.strain_name
    - Products: vault.product_types vs packaging SKUs vs crm.products
    - Customers: packaging orders (implicit) vs crm.dispensary_profiles
    - Orders: packaging sheet rows vs crm.orders

### Completed - Consolidation Planning
51. **MASTER_CONSOLIDATION_PLAN.md** - Created comprehensive document:
    - Full schema analysis of all 3 systems
    - Unified schema design (see document for details)
    - 4-phase implementation plan
    - Rollback strategy
    - File change tracking

52. **Key Decisions:**
    - Single Supabase project: `vault`
    - PIN auth for warehouse (same as vault)
    - SKU creation in Vault (Strain + Type = SKU code)
    - Order flow: CRM creates → Packaging fulfills
    - Unified status: pending → confirmed → packed → delivered
    - Adopt shadcn/ui across all apps
    - DATA_SOURCE toggle for rollback

53. **Bug Identified - Blocked Task Issue:**
    - Problem: Allocation engine creates single task per SKU
    - When demand increases, partially-filled inventory becomes blocked
    - Example: 5 FILLED + 3 need STAGED = entire FILL task blocked
    - Fix: Split into CASE task (5, ready) + FILL task (3, blocked)
    - Scheduled for Phase 2

### Phase 1 Plan (Current Priority)
**Goal:** Move packaging from Google Sheets to Supabase

**Tables to Create:**
- skus, inventory, containers
- packaging_tasks, packaging_task_sources
- inventory_log, task_notes
- customers, orders, order_items

**Files to Modify:**
- Add: src/lib/supabase.ts, src/lib/db.ts
- Update: All API routes
- Keep: sheets.ts (renamed to sheets.backup.ts for rollback)

**Rollback Strategy:**
- Environment variable: DATA_SOURCE=supabase|sheets
- Keep Google Sheet read-only
- Can flip toggle to revert

### Completed - Supabase Migration (Phase 1)
54. **SQL Migrations Created** (`supabase/migrations/`):
    - `001_packaging_tables.sql` - Full schema migration:
      - Tables: skus, sku_pricing, inventory, containers, customers, orders, order_items, packaging_tasks, packaging_task_sources, inventory_log, task_notes
      - Extended users role constraint to include 'packaging', 'management'
      - Triggers for updated_at, order number generation (ORD-XXXX), order total calculation
    - `002_seed_skus.sql` - Seeds all 14 SKUs (BG, BG-B, BB, BB-B, etc.)

55. **Supabase Data Layer** (`src/lib/`):
    - `supabase.ts` - Supabase client with TypeScript types
    - `database.types.ts` - Auto-generated TypeScript types from schema
    - `db.ts` - Supabase data layer with same interface as sheets.ts
    - `data-source.ts` - Toggle layer (DATA_SOURCE=sheets|supabase)

56. **API Routes Updated**:
    - All routes now import from `data-source.ts`
    - Seamless switching between Google Sheets and Supabase

57. **Data Migration**:
    - `scripts/migrate-to-supabase.ts` - Full migration script
    - `scripts/import-all-customers.ts` - Customer import script
    - Migrated: 14 SKUs, inventory, 12 containers, 6 orders, 67 customers, 2 task notes

58. **Environment Configuration**:
    - Added `DATA_SOURCE=supabase` to `.env.local`
    - Dashboard now runs on Supabase backend
    - Google Sheets preserved for rollback

---

## Session - 2026-01-21

### Completed - CRM Integration with Vault Supabase

59. **CRM PIN Auth Fix**:
    - Fixed orders page using wrong auth (Supabase Auth instead of PIN auth)
    - Updated to use `useAuth()` hook from auth context
    - Fixed new order page and dashboard page similarly

60. **Order Items Editing**:
    - Added ability to add/remove products when editing orders
    - Fixed 400 error: `line_total` is a **generated column** - cannot be written to
    - Removed `line_total` from INSERT/UPDATE statements

### Completed - Packaging Dashboard Supabase Connection

61. **Vercel Environment Variables**:
    - Added `DATA_SOURCE=supabase` (was already done)
    - Added `NEXT_PUBLIC_SUPABASE_URL`
    - Added `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - Dashboard now reads from Supabase correctly
    - Order totals accurate (VZ: 9 as expected)

62. **Fixed Missing Files**:
    - `supabase.ts` and `database.types.ts` weren't committed
    - Added to git and redeployed

### Completed - Order Status Processing (Supabase)

63. **db.ts - processOrderStatusChanges()**:
    - Implements same logic as sheets.ts but for Supabase
    - Deducts from CASED when order status = "packed" (if packed_at is null)
    - Deducts from CASED when order status = "delivered" (if not already packed)
    - Restores CASED when Packed order reverts to Pending/Confirmed
    - Uses `packed_at` and `delivered_at` timestamps to track processed state

64. **Helper Functions Added**:
    - `deductFromCased(orderId)` - deducts order item quantities from CASED
    - `restoreToCased(orderId)` - restores order item quantities to CASED

### Completed - Manual Inventory Adjustment

65. **API Endpoint** - `/api/inventory/update`:
    - POST endpoint for manual CASED/FILLED/STAGED adjustments
    - Validates SKU is in SKU_LIST
    - Validates values are non-negative integers
    - Logs changes to inventory_log table

66. **InventoryEditModal Component**:
    - Click any SKU card to open edit modal
    - Edit CASED, FILLED, STAGED values
    - Color-coded inputs (green/blue/purple)
    - Save/Cancel buttons

67. **InventoryStatusBar Updates**:
    - Added `onEditInventory` prop
    - SKU cards are now clickable (hover effect added)

68. **data-source.ts**:
    - Added `updateInventoryLevels()` function
    - Works for both Supabase and Google Sheets backends

### Deployment
- Production URL: https://process.cakeoklahoma.com
- Deployment method: `vercel --prod` (no git remote)

### What's Next
1. Test manual inventory adjustment feature
2. Test order status processing (mark order as Packed in CRM, verify CASED decreases)
3. Clean up old components (TaskQueue.tsx, TaskRow.tsx, RefreshControls.tsx)

---

## Session - 2026-01-24

### Workflow Note
- Claude commits edits directly to main branch
- User reviews changes on Vercel-hosted production site
- No local dev server review needed

### Completed - CRM: Case-based Ordering in OrderSheet

69. **OrderSheet Component** (`components/orders/order-sheet.tsx`):
    - Updated to match Orders page functionality with case-based ordering
    - Added `cases`, `units_per_case`, `line_total` fields to OrderItem interface
    - Created `SkuOption` interface for cleaner typing
    - SKU dropdown now shows "code - name" format (sorted by code)
    - Users enter number of cases, quantity auto-calculates (cases × units_per_case)
    - UI displays "X cases (Y units)" format
    - Existing orders convert quantities back to cases when editing
    - Removed unused `DollarSign` import
    - Commit: `9eef3af`

### Prior Session Work (from context recovery)
- **Batch Active/Inactive feature**: Bulk toggle products in/out of stock
- **Orders In-Sheet Editing**: Edit orders directly in table/card view with case-based ordering
- **Products page redesign**: Simplified form, converted products table to VIEW on SKUs
- **Customer-level pricing**: Set default prices per customer by item or category
  - Created `customer_pricing` table
  - Item pricing takes precedence over category pricing
  - No global default - manual entry if no pricing set
  - Integrated into OrderSheet for auto-populating prices
- **Auth fixes**: Standardized on `useAuth()` context across pages (Products, ProductSheet, Dispensary detail)

---

## Session - 2026-01-25

### Completed - Users & Permissions System

70. **Database Schema Updates**:
    - Applied migration `add_sales_role_and_assigned_sales`:
      - Updated `users_role_check` constraint to include 'sales' role
      - Added `assigned_sales_id` column to `customers` table (FK to users)
      - Created index on `assigned_sales_id` for performance

71. **Auth Context Permission Helpers** (`lib/auth-context.tsx`):
    - Added `UserRole` type
    - Added permission functions:
      - `canViewSection(role, section)` - check nav access by role
      - `canCreateOrder(role)` - sales, management, admin
      - `canApproveOrder(role)` - management, admin only
      - `canEditOrder(role)` - management, admin only
      - `canDeleteOrder(role)` - management, admin only
      - `canManageUsers(role)` - admin only
      - `canAssignSales(role)` - management, admin

72. **Dashboard Nav Filtering** (`app/dashboard/layout.tsx`):
    - Updated nav items with role-based access:
      - admin/management: all sections
      - sales: dispensaries, orders, communications, tasks
      - standard: vault, packaging, products

73. **Dispensary Detail Page** (`app/dashboard/dispensaries/[id]/page.tsx`):
    - Added sales assignment dropdown (mgmt/admin only)
    - Fetches `assigned_sales` with dispensary data
    - Sales users can only create orders for their assigned dispensaries
    - Hide "Add Order" buttons for unassigned sales users
    - Permission checks on order edit/delete dropdown

74. **Orders Page** (`app/dashboard/orders/page.tsx`):
    - Updated to use centralized permission helpers
    - Separate checks for `canEditOrders` and `canDeleteOrders`
    - Hide approve button for non-management/admin
    - Hide edit/delete actions based on role

75. **Dispensaries List & New Pages**:
    - Sales users can now add dispensaries (in addition to mgmt/admin)
    - Auto-assigns `assigned_sales_id` when sales user creates dispensary
    - Updated permission checks to use `useAuth()` context

76. **User Form Updates**:
    - New user form: 4 role options (standard, sales, management, admin)
    - Updated role descriptions to explain permissions
    - User detail page: added sales role badge variant

### Role Summary
| Role | Nav Access | Order Permissions |
|------|------------|-------------------|
| admin | All | Create/Approve/Edit/Delete all |
| management | All | Create/Approve/Edit/Delete all |
| sales | Dispensaries, Orders, Comms, Tasks | Create for assigned dispensaries only |
| standard | Vault, Packaging, Products | None |

### Commit
- `1b9e30a`: Add sales role and permission-based access control
