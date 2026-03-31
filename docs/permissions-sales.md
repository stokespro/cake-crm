# Sales Role -- Permissions & Access

> CAKE CRM Internal Documentation | Last updated: 2026-03-31

---

## Overview

The **sales** and **agent** roles are functionally identical throughout the entire codebase. Every permission check, navigation filter, and data query treats them as interchangeable. There is no code path that distinguishes between the two. This document covers both roles under the label "sales."

Sales users are intended for field sales representatives who manage dispensary relationships, place orders on behalf of customers, log communications, and track their own commissions.

---

## Navigation Access

The dashboard sidebar filters navigation items based on user role. Sales users see a reduced set of sections focused on CRM and order operations.

| Section | Visible | Notes |
|---|---|---|
| Dashboard | Yes | Personal metrics only |
| Orders | Yes | Filtered to assigned customers |
| Dispensaries | Yes | Can view all, can add new |
| Communications | Yes | Own entries only |
| Tasks | Yes | Own entries only |
| My Commissions | Yes | Own earnings only |
| Vault | No | -- |
| Packaging | No | -- |
| Inventory | Yes | Read-only view of SKU inventory levels |
| Materials | No | -- |
| Products | No | -- |
| Commissions (admin reports) | No | Admin and management only |
| Commission Rates | No | Admin and management only |
| Users | No | Admin only |

**Source:** `app/dashboard/layout.tsx` (lines 131-138)

---

## Permission Helpers

The following helper functions in `lib/auth-context.tsx` control action-level permissions. All return boolean values based on the current user's role.

| Helper Function | Sales Return Value | Who Can |
|---|---|---|
| `canCreateOrder` | `true` | admin, management, sales, agent |
| `canApproveOrder` | `false` | admin, management only |
| `canEditOrder` | `true` | admin, management, sales, agent |
| `canDeleteOrder` | `false` | admin, management only |
| `canManageUsers` | `false` | admin only |
| `canAssignSales` | `true` | admin, management, sales, agent |

**Source:** `lib/auth-context.tsx`

---

## Data Isolation

Sales users see a filtered subset of data across the application. The filtering logic is implemented at the application query level, not uniformly via RLS.

| Data Type | Filter Logic | Filter Column |
|---|---|---|
| Orders | Only orders belonging to customers assigned to the sales user | `customers.assigned_sales_id` lookup |
| Communications | Only entries created by the user | `agent_id = user.id` |
| Tasks | Only entries owned by the user | `agent_id = user.id` |
| Dashboard metrics | Calculated from the user's own filtered data | Derived from orders/comms |
| Commissions | Personal earnings only | `salesperson_id = user.id` |
| Dispensaries | All dispensaries are visible (read access is not filtered) | No filter applied |

---

## Create / Edit Capabilities

### What sales users CAN do

| Action | Allowed | Notes |
|---|---|---|
| Create orders | Yes | For any customer (see Known Gaps) |
| Edit orders | Yes | Scoped to assigned customers only (data isolation enforced at query level) |
| Create dispensaries | Yes | New dispensary auto-assigned to creating user |
| Create communications | Yes | Logged with user attribution |
| Create tasks | Yes | Assigned to self |
| View all dispensaries | Yes | Full list, not filtered by assignment |
| Assign sales reps | Yes | Via `canAssignSales` permission |

### What sales users CANNOT do

| Action | Restricted To |
|---|---|
| ~~Edit existing orders~~ | Now permitted for sales (scoped to assigned customers) |
| Approve orders | Admin, management |
| Delete orders | Admin, management |
| Manage users | Admin |
| Manage commission rates | Admin, management |
| Access vault operations | Vault, packaging, standard, admin, management |
| Access packaging board | Vault, packaging, standard, admin, management |
| ~~Access inventory dashboard~~ | Now permitted for sales |
| Access materials tracking | Packaging, admin, management |
| Access products/SKU management | Vault, packaging, standard, admin, management |

---

## RLS Policies

Row Level Security in Supabase provides a secondary layer of access control. However, role enforcement in CAKE CRM is **primarily at the application level** (server actions and page-level checks), not via RLS.

| Table | RLS Policy | Sales Impact |
|---|---|---|
| Communications | All authenticated users can view, create, update | No DB-level restriction; app filters by `agent_id` |
| Contacts | All authenticated users can view and manage | Full access at DB level |
| Materials | Restricted to management, admin, packaging roles | Blocked at both DB and app level |
| Product pricing (`sku_pricing`, `customer_pricing`) | All authenticated users can view | Read-only at DB level; app hides UI |
| Orders | No role-based RLS documented | Filtering is app-level only |
| Customers | No role-based RLS documented | All dispensaries visible to sales |

**Key takeaway:** Because most role enforcement happens in application code rather than RLS policies, a direct Supabase API call bypassing the application could potentially access data outside the intended sales scope.

---

## Known Gaps

1. **Order creation is not restricted to assigned customers.** Sales users can create orders for ANY customer in the system, not just those where `assigned_sales_id` matches their user ID. The `canCreateOrder` permission check does not include an assignment filter. Order *viewing* is properly filtered, but order *creation* is not.

2. **Agent and sales roles have zero differentiation.** Both roles map to identical permission sets across every check in the codebase. If the intent is for these to differ (e.g., agents have fewer privileges), that logic does not exist today.

3. **RLS does not enforce role-based data isolation for orders.** The orders table relies entirely on application-level filtering. A sales user with direct API access could query orders outside their assigned accounts.

4. **Dispensary visibility is unfiltered.** Sales users can see all dispensaries, including those assigned to other sales reps. This may be intentional for collaboration but could be a concern for territory management.

---

## Implementation References

| Purpose | File | Notes |
|---|---|---|
| Permission helpers and role definitions | `lib/auth-context.tsx` | `canCreateOrder`, `canApproveOrder`, `canEditOrder`, `canDeleteOrder`, `canManageUsers`, `canAssignSales` |
| Navigation filtering | `app/dashboard/layout.tsx` | Lines 131-138, role-based sidebar |
| Order data filtering for sales | `app/dashboard/orders/page.tsx` | Filters by `assigned_sales_id` on customer lookup |
| Communication filtering | `app/dashboard/communications/page.tsx` | Filters by `agent_id = user.id` |
| Task filtering | `app/dashboard/tasks/page.tsx` | Filters by `agent_id = user.id` |
| Commission access | `app/dashboard/my-commissions/page.tsx` | Filters by `salesperson_id` |
| Dispensary auto-assignment | `actions/contacts.ts` / dispensary creation flow | New dispensaries assigned to creating sales user |
| Commission rate management | `app/dashboard/commissions/rates/page.tsx` | Admin/management only, not accessible to sales |
