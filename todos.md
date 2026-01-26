# Todo List

> **IMPORTANT:** See MASTER_CONSOLIDATION_PLAN.md for full context on the platform consolidation project.

---

## CURRENT STATUS: Phase 3 Complete, Phase 4 Partially Complete

### Phase 1: Packaging → Supabase ✅ COMPLETE

### Phase 2: Container ↔ Order Management ✅ COMPLETE
- [x] Implement persistent task state in DB
- [x] Fix blocked task bug (split ready/blocked portions)
- [x] Add task_sources tracking

### Phase 3: CRM Integration ✅ COMPLETE
- [x] Point CRM to vault Supabase
- [x] Implement PIN auth for CRM
- [x] Fix orders page to use auth context
- [x] Add order items editing capability
- [x] Fix line_total generated column issue
- [x] Test full order flow (CRM create → Packaging fulfill)
- [ ] Deprecate cake-crm Supabase project (still active)

### Phase 4: UI Unification (Partially Complete)
- [ ] Set up monorepo (NOT done - packaging & cake-crm are separate projects)
- [x] Extract shared components
- [x] Upgrade all apps to shadcn (CRM has shadcn/ui components)

---

## Packaging Dashboard - Cleanup Needed

### Old Components (Still Exist - Can Be Removed)
- [ ] Remove TaskQueue.tsx
- [ ] Remove TaskRow.tsx
- [ ] Remove RefreshControls.tsx

### Testing (Not Done - Only Built, Not Tested)
- [ ] Test all card movements
- [ ] Test undo functionality
- [ ] Test container add/edit/remove
- [ ] Test with live sheet data
- [ ] Test blocked state transitions
- [ ] Test on actual TV

---

## Users & Permissions System ✅ COMPLETE (2026-01-25)

### Phase 1: Database Schema ✅
- [x] Update `users.role` enum to add 'sales' role
- [x] Add `assigned_sales_id` column to `customers` table (FK to users)

### Phase 2: Auth & Permissions Logic ✅
- [x] Update auth context with permission helpers
  - `canCreateOrder()` - sales/mgmt/admin
  - `canApproveOrder()` - management/admin only
  - `canEditOrder()` - management/admin only
  - `canDeleteOrder()` - management/admin only
- [x] Update dashboard layout nav filtering by role
  - admin/management: all sections
  - sales: dispensaries, orders, communications, tasks
  - standard: vault, packaging, products

### Phase 3: UI Permission Enforcement ✅
- [x] Dispensary page: hide "Add Order" for unassigned (sales role)
- [x] Orders page: hide approve/edit buttons based on role
- [x] Dispensary detail: add sales assignment dropdown (mgmt/admin only)
- [x] Auto-assign new dispensaries to creating sales user

### Phase 4: User Management UI ✅
- [x] Update user form with 4 role options (standard, sales, management, admin)
- [ ] Add "Assigned Accounts" section for sales users (future enhancement)
- [x] Ability to reassign accounts (mgmt/admin) via dispensary detail dropdown

### Role Summary
| Role | Nav Access | Order Permissions |
|------|------------|-------------------|
| admin | All | Create/Approve/Edit/Delete all |
| management | All | Create/Approve/Edit/Delete all |
| sales | Dispensaries, Orders, Comms, Tasks | Create for assigned only |
| standard | Vault, Packaging, Products | None |

---

## CRM Recent Completions (2026-01-24)
- [x] Case-based ordering in OrderSheet (match Orders page)
- [x] Customer-level pricing with order integration
- [x] Products page redesign (convert to view on SKUs)
- [x] Fix auth across pages (useAuth context)
- [x] Orders in-sheet editing with case support
- [x] Batch active/inactive for products

---
---

## Future Enhancements
- [ ] Add "Assigned Accounts" section to sales user profile
- [ ] Dashboard view of accounts by sales rep (mgmt/admin)

---
Last updated: 2026-01-25
