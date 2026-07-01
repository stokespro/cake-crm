'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowDownCircle,
  Banknote,
  Save,
  RefreshCw,
  Building2,
  XCircle,
  Plus,
  CreditCard,
  Link as LinkIcon,
} from 'lucide-react'
import { format, parseISO, startOfWeek, addDays } from 'date-fns'
import { getMonthSummary, getWeeklyBudget, syncBankFromSource, updateBill } from '@/actions/finance'
import { upsertCashSnapshot } from './_actions/snapshot'
import {
  runDailyReconciliation,
  getReconciliationLog,
  confirmReconciliationMatch,
  dismissReconciliationMatch,
  getUntrackedBankTransactions,
  getProposedTransactions,
} from './_actions/bank'
import type { MonthSummary, WeeklySummary } from '@/actions/finance'
import type { ReconciliationLogRow, BankTransaction, ProposedTransaction } from './_actions/bank'
import type { CashFlowResult, CashFlowEvent } from '@/lib/finance/cash-flow'
import {
  WeeklyBudgetView,
  WeeklyBudgetSkeleton,
} from './_components/weekly-budget-view'

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function getMonthLabel(month: string): string {
  return format(parseISO(month), 'MMMM yyyy')
}

function prevMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(year, mon - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function nextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(year, mon, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function currentMonthStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function last4(accountNumber: string): string {
  return accountNumber.slice(-4)
}

/**
 * Returns today's date as 'YYYY-MM-DD' in America/Chicago timezone.
 * Used for the staleness banner comparison so the cutoff is always midnight
 * Central regardless of where the browser is running.
 */
function getCentralToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// -----------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------

function CashFlowEventRow({
  event,
  isTrough,
}: {
  event: CashFlowEvent
  isTrough: boolean
}) {
  const isExcluded = event.runningBalance === undefined
  const isInflow = event.amount > 0
  const isPipeline = event.isPipeline

  let amountClass = ''
  let rowClass = ''

  if (isExcluded) {
    amountClass = 'text-muted-foreground line-through'
    rowClass = 'opacity-40'
  } else if (isPipeline) {
    amountClass = 'text-green-600/60'
  } else if (isInflow) {
    amountClass = 'text-green-600 font-medium'
  } else {
    amountClass = 'text-red-600 font-medium'
  }

  if (isTrough) {
    rowClass = 'bg-amber-50 dark:bg-amber-950/20'
  }

  return (
    <TableRow className={rowClass}>
      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
        {format(parseISO(event.date), 'MMM d')}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {isPipeline && <Clock className="h-3 w-3 text-muted-foreground shrink-0" />}
          <span className={`text-sm ${isPipeline ? 'text-muted-foreground italic' : ''}`}>
            {event.label}
          </span>
          {isTrough && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-400 ml-1">
              Low point
            </Badge>
          )}
        </div>
        {/* Mobile: show date and vendor as sub-text */}
        <div className="sm:hidden text-xs text-muted-foreground mt-0.5">
          {format(parseISO(event.date), 'MMM d')}
          {event.vendor && (
            <span className="ml-1">&middot; {event.vendor}</span>
          )}
        </div>
      </TableCell>
      {/* Vendor — hidden on mobile (surfaced as sub-text above), visible sm+ */}
      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
        {event.vendor ?? '—'}
      </TableCell>
      <TableCell className={`text-right text-sm ${amountClass}`}>
        {isExcluded ? '—' : `${isInflow ? '+' : ''}${formatMoney(event.amount)}`}
      </TableCell>
      <TableCell className="text-right text-sm font-mono">
        {event.runningBalance !== undefined ? (
          <span className={event.runningBalance < 0 ? 'text-red-600 font-semibold' : 'text-foreground'}>
            {formatMoney(event.runningBalance)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  )
}

// -----------------------------------------------------------------------
// ReconMatchBadge
// -----------------------------------------------------------------------

function ReconMatchBadge({ matchType }: { matchType: ReconciliationLogRow['match_type'] }) {
  switch (matchType) {
    case 'check_exact':
      return (
        <Badge variant="default" className="bg-green-600 text-xs">
          <CheckCircle className="h-3 w-3 mr-1" />
          Check match
        </Badge>
      )
    case 'check_amount_mismatch':
      return (
        <Badge variant="destructive" className="text-xs">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Amount mismatch
        </Badge>
      )
    case 'already_paid':
      return (
        <Badge variant="outline" className="text-xs">
          <CheckCircle className="h-3 w-3 mr-1" />
          Already paid
        </Badge>
      )
    case 'fuzzy_suggested':
      return (
        <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
          Fuzzy match
        </Badge>
      )
    case 'card_amount_vendor':
      return (
        <Badge variant="outline" className="text-xs text-blue-600 border-blue-400">
          <CreditCard className="h-3 w-3 mr-1" />
          Card/ACH match
        </Badge>
      )
    case 'amount_only':
      return (
        <Badge variant="outline" className="text-xs text-orange-600 border-orange-400">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Amount only — verify
        </Badge>
      )
    case 'already_paid_non_check':
      return (
        <Badge variant="outline" className="text-xs text-green-700 border-green-400">
          <CheckCircle className="h-3 w-3 mr-1" />
          Paid — link only
        </Badge>
      )
    default:
      return <Badge variant="outline" className="text-xs">{matchType}</Badge>
  }
}

// -----------------------------------------------------------------------
// BankBalancePanel
// -----------------------------------------------------------------------

function BankBalancePanel({
  summary,
  snapshotAmount,
  setSnapshotAmount,
  snapshotSaving,
  onSaveSnapshot,
  syncing,
  onSyncNow,
}: {
  summary: MonthSummary
  snapshotAmount: string
  setSnapshotAmount: (v: string) => void
  snapshotSaving: boolean
  onSaveSnapshot: () => void
  syncing: boolean
  onSyncNow: () => void
}) {
  const [manualOpen, setManualOpen] = useState(false)
  const snap = summary.latestSnapshot
  const bank = summary.bankBalance
  const isBankSource = snap?.source === 'bank'

  // Staleness: compare bank as_of_date to today in America/Chicago.
  // If the bank balance is older than today, show a prominent warning banner.
  const centralToday = getCentralToday()
  const bankAsOf = bank?.as_of_date ?? null
  const isBankStale = bankAsOf ? bankAsOf < centralToday : false
  const daysOld = isBankStale && bankAsOf
    ? Math.round((Date.parse(centralToday) - Date.parse(bankAsOf)) / 86_400_000)
    : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Cash on Hand
          </CardTitle>
          <div className="flex items-center gap-2">
            {snap && (
              <Badge
                variant="outline"
                className={
                  isBankSource
                    ? 'text-xs text-blue-600 border-blue-300'
                    : 'text-xs text-muted-foreground'
                }
              >
                {isBankSource ? 'Synced from bank' : 'Manual entry'}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onSyncNow}
              disabled={syncing}
              className="h-7 text-xs"
            >
              <RefreshCw className={`h-3 w-3 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync now'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Staleness banner — shown when bank as_of_date is before today (Central) */}
        {isBankStale && bankAsOf && (
          <div className="flex items-start gap-2.5 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Bank balance is from {format(parseISO(bankAsOf), 'MMM d')}
                {' '}&mdash;{' '}
                {daysOld} day{daysOld !== 1 ? 's' : ''} old
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                The scheduled BankSync pull may have failed. Use Sync now to pull fresh data.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onSyncNow}
              disabled={syncing}
              className="h-7 text-xs border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30 shrink-0"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync now'}
            </Button>
          </div>
        )}
        {/* Primary display */}
        {snap ? (
          <div>
            <div className="text-3xl font-bold">{formatMoney(snap.cash_on_hand)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {isBankSource ? (
                <>
                  Current balance (cash-flow anchor) &mdash; Regent Bank ****
                  {bank ? last4(bank.account_number) : '—'} as of{' '}
                  {bank ? format(parseISO(bank.as_of_date), 'MMM d, yyyy') : format(parseISO(snap.snapshot_date), 'MMM d, yyyy')}
                </>
              ) : (
                <>
                  Last recorded {format(parseISO(snap.snapshot_date), 'MMM d, yyyy')} &mdash;
                  update below to refresh projections
                </>
              )}
            </div>

            {/* Available + pending context — only shown when bank is source */}
            {isBankSource && bank && (
              <div className="flex items-center gap-4 mt-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Available</span>{' '}
                  <span className="font-medium">{formatMoney(bank.available)}</span>
                </div>
                {bank.pending !== 0 && (
                  <div>
                    <span className="text-muted-foreground">Pending</span>{' '}
                    <span className="font-medium text-amber-600">{formatMoney(bank.pending)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-amber-600 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            No cash snapshot yet. Set cash on hand below to enable projections.
          </div>
        )}

        {/* Manual override — collapsible when bank is source, always open otherwise */}
        {isBankSource ? (
          <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground px-0 h-auto">
                {manualOpen ? (
                  <ChevronUp className="h-3 w-3 mr-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 mr-1" />
                )}
                Manual override
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pt-3 text-xs text-muted-foreground mb-2">
                Manually entering a value sets source to &quot;manual&quot; and prevents the nightly bank sync from overwriting it for today.
              </div>
              <ManualSnapshotInput
                snapshotAmount={snapshotAmount}
                setSnapshotAmount={setSnapshotAmount}
                snapshotSaving={snapshotSaving}
                onSave={onSaveSnapshot}
              />
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <div className="space-y-2">
            {snap && (
              <p className="text-xs text-muted-foreground">
                Bank sync available — balance will auto-update at 7–8am Central when connected.
              </p>
            )}
            <ManualSnapshotInput
              snapshotAmount={snapshotAmount}
              setSnapshotAmount={setSnapshotAmount}
              snapshotSaving={snapshotSaving}
              onSave={onSaveSnapshot}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ManualSnapshotInput({
  snapshotAmount,
  setSnapshotAmount,
  snapshotSaving,
  onSave,
}: {
  snapshotAmount: string
  setSnapshotAmount: (v: string) => void
  snapshotSaving: boolean
  onSave: () => void
}) {
  return (
    <div className="flex items-center gap-3 max-w-sm">
      <div className="relative flex-1">
        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={snapshotAmount}
          onChange={(e) => setSnapshotAmount(e.target.value)}
          className="pl-8"
        />
      </div>
      <Button onClick={onSave} disabled={snapshotSaving || !snapshotAmount}>
        <Save className="h-4 w-4 mr-2" />
        {snapshotSaving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  )
}

// -----------------------------------------------------------------------
// ReconciliationPanel
// -----------------------------------------------------------------------

function ReconciliationPanel() {
  const [reconciling, setReconciling] = useState(false)
  const [pendingRows, setPendingRows] = useState<ReconciliationLogRow[]>([])
  const [clearedRows, setClearedRows] = useState<ReconciliationLogRow[]>([])
  const [logLoading, setLogLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [dismissingId, setDismissingId] = useState<string | null>(null)

  const fetchLog = useCallback(async () => {
    setLogLoading(true)
    try {
      const [pendingRes, clearedRes] = await Promise.all([
        getReconciliationLog('pending'),
        getReconciliationLog('cleared'),
      ])
      if (pendingRes.success) setPendingRows(pendingRes.data ?? [])
      if (clearedRes.success) setClearedRows(clearedRes.data ?? [])
    } catch (err) {
      console.error('Error fetching reconciliation log:', err)
    } finally {
      setLogLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLog()
  }, [fetchLog])

  const handleReconcile = async () => {
    setReconciling(true)
    try {
      const result = await runDailyReconciliation()
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Reconciliation failed')
        return
      }
      const { check_auto_applied, check_mismatch, noncheck_proposed } = result.data
      const parts: string[] = []
      if (check_auto_applied > 0)
        parts.push(`${check_auto_applied} check${check_auto_applied !== 1 ? 's' : ''} auto-paid`)
      if (check_mismatch > 0)
        parts.push(`${check_mismatch} check${check_mismatch !== 1 ? 's' : ''} need review`)
      if (noncheck_proposed > 0)
        parts.push(`${noncheck_proposed} non-check${noncheck_proposed !== 1 ? 's' : ''} proposed`)
      toast.success(parts.length > 0 ? parts.join(', ') : 'No new items to reconcile')
      await fetchLog()
    } catch (err) {
      console.error('Reconciliation error:', err)
      toast.error('Reconciliation failed')
    } finally {
      setReconciling(false)
    }
  }

  const handleConfirm = async (logId: string) => {
    setConfirmingId(logId)
    try {
      const result = await confirmReconciliationMatch(logId)
      if (!result.success) {
        toast.error(result.error ?? 'Failed to confirm')
        return
      }
      toast.success('Match confirmed')
      await fetchLog()
    } catch (err) {
      console.error('Confirm error:', err)
      toast.error('Failed to confirm')
    } finally {
      setConfirmingId(null)
    }
  }

  const handleDismiss = async (logId: string) => {
    setDismissingId(logId)
    try {
      const result = await dismissReconciliationMatch(logId)
      if (!result.success) {
        toast.error(result.error ?? 'Failed to dismiss')
        return
      }
      toast.success('Match dismissed')
      await fetchLog()
    } catch (err) {
      console.error('Dismiss error:', err)
      toast.error('Failed to dismiss')
    } finally {
      setDismissingId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Check Reconciliation
            {pendingRows.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {pendingRows.length} pending
              </Badge>
            )}
          </CardTitle>
          <Button
            size="sm"
            onClick={handleReconcile}
            disabled={reconciling}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${reconciling ? 'animate-spin' : ''}`} />
            {reconciling ? 'Running...' : 'Reconcile Now'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Matches cleared checks automatically by check number; proposes card/ACH/wire matches for human review.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="px-4 pb-2">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="pending" className="flex-1 sm:flex-none">
                Pending Review
                {pendingRows.length > 0 && (
                  <span className="ml-1.5 text-xs bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 leading-none">
                    {pendingRows.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="cleared" className="flex-1 sm:flex-none">
                Recently Cleared
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pending" className="mt-0">
            {logLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
            ) : pendingRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No items pending review
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px] hidden sm:table-cell">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="hidden md:table-cell">Matched Bill</TableHead>
                      <TableHead className="text-right">Bank Amt</TableHead>
                      <TableHead className="hidden md:table-cell text-right">Bill Amt</TableHead>
                      <TableHead className="hidden sm:table-cell">Type</TableHead>
                      <TableHead className="hidden lg:table-cell">Method</TableHead>
                      <TableHead className="text-right w-[140px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRows.map((row) => {
                      const isLinkOnly = row.match_type === 'already_paid_non_check'
                      const canConfirm =
                        row.match_type === 'check_amount_mismatch' ||
                        row.match_type === 'already_paid' ||
                        row.match_type === 'card_amount_vendor' ||
                        row.match_type === 'amount_only' ||
                        row.match_type === 'already_paid_non_check'
                      return (
                      <TableRow key={row.id}>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                          {row.bank_date ? format(parseISO(row.bank_date), 'MMM d, yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-sm max-w-[180px]">
                          <span className="truncate block">{row.bank_description ?? '—'}</span>
                          {/* Mobile: show date, matched bill, and type as sub-text */}
                          <div className="sm:hidden text-xs text-muted-foreground mt-0.5 space-y-0.5">
                            {row.bank_date && (
                              <span className="block">{format(parseISO(row.bank_date), 'MMM d, yyyy')}</span>
                            )}
                            {row.bill_name && <span className="block">{row.bill_name}</span>}
                          </div>
                          <div className="md:hidden mt-1">
                            <ReconMatchBadge matchType={row.match_type} />
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {row.bill_name ?? <span className="text-muted-foreground italic">No bill</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono">
                          {row.bank_amount !== null ? formatMoney(Math.abs(row.bank_amount)) : '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right text-sm font-mono">
                          {row.bill_amount !== null ? formatMoney(row.bill_amount) : '—'}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <ReconMatchBadge matchType={row.match_type} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground capitalize">
                          {row.suggested_payment_method ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canConfirm && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={confirmingId === row.id}
                                onClick={() => handleConfirm(row.id)}
                              >
                                {isLinkOnly ? (
                                  <>
                                    <LinkIcon className="h-3 w-3 mr-1" />
                                    {confirmingId === row.id ? '...' : 'Link'}
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    {confirmingId === row.id ? '...' : 'Confirm'}
                                  </>
                                )}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-muted-foreground"
                              disabled={dismissingId === row.id}
                              onClick={() => handleDismiss(row.id)}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              {dismissingId === row.id ? '...' : 'Dismiss'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="cleared" className="mt-0">
            {logLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
            ) : clearedRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No cleared checks in the last 30 days
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="hidden sm:table-cell w-[90px]">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="hidden sm:table-cell">Bill</TableHead>
                      <TableHead className="text-right">Bank Amt</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clearedRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                          {row.bank_date ? format(parseISO(row.bank_date), 'MMM d, yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-sm max-w-[180px]">
                          <span className="truncate block">{row.bank_description ?? '—'}</span>
                          {/* Mobile: show date and bill as sub-text */}
                          <div className="sm:hidden text-xs text-muted-foreground mt-0.5 space-y-0.5">
                            {row.bank_date && (
                              <span className="block">{format(parseISO(row.bank_date), 'MMM d, yyyy')}</span>
                            )}
                            {row.bill_name && <span className="block">{row.bill_name}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm">
                          {row.bill_name ?? <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono">
                          {row.bank_amount !== null ? formatMoney(Math.abs(row.bank_amount)) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={row.status === 'auto_applied' ? 'default' : 'outline'}
                            className={`text-xs ${row.status === 'auto_applied' ? 'bg-green-600' : ''}`}
                          >
                            {row.status === 'auto_applied' ? 'Auto-paid' : 'Confirmed'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

// -----------------------------------------------------------------------
// UntrackedExpensesPanel
// -----------------------------------------------------------------------

function UntrackedExpensesPanel({
  month,
  onCreateBill,
}: {
  month: string
  onCreateBill: (prefill: { name: string; amount: string; due_date: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [proposed, setProposed] = useState<ProposedTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  const fetchUntracked = useCallback(async () => {
    setLoading(true)
    try {
      const [untrackedRes, proposedRes] = await Promise.all([
        getUntrackedBankTransactions(month),
        getProposedTransactions(month),
      ])
      if (untrackedRes.success) setTransactions(untrackedRes.data ?? [])
      if (proposedRes.success) setProposed(proposedRes.data ?? [])
    } catch (err) {
      console.error('Error fetching untracked transactions:', err)
    } finally {
      setLoading(false)
      setFetched(true)
    }
  }, [month])

  // Re-fetch when month changes (reset fetched so the panel reloads on next open,
  // or immediately if already open)
  useEffect(() => {
    setFetched(false)
    setTransactions([])
    setProposed([])
    if (open) {
      fetchUntracked()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  // Fetch once when opened
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next && !fetched) {
      fetchUntracked()
    }
  }

  // Build a set of bs_ids that have a pending_review proposal — these render muted
  const proposedBsIds = new Set(proposed.map((p) => p.bank_bs_id))
  const totalCount = transactions.length + proposed.filter((p) => !transactions.some((t) => t.bs_id === p.bank_bs_id)).length

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="flex items-center gap-2">
            <ArrowDownCircle className="h-4 w-4" />
            Untracked Bank Expenses
            {totalCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {totalCount}
              </Badge>
            )}
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Untracked Expenses</CardTitle>
            <p className="text-xs text-muted-foreground">
              Outflows from Regent Bank not yet matched to a bill. Use &quot;Create Bill&quot; to record them.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
            ) : transactions.length === 0 && proposed.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                All bank outflows are accounted for
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="hidden sm:table-cell w-[90px]">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[150px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((txn) => {
                      const hasProposal = proposedBsIds.has(txn.bs_id)
                      return (
                        <TableRow key={txn.bs_id} className={hasProposal ? 'opacity-60' : undefined}>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                            {format(parseISO(txn.txn_date), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="text-sm max-w-[220px]">
                            <span className="truncate block">{txn.description}</span>
                            {txn.merchant_name && txn.merchant_name !== txn.description && (
                              <span className="text-xs text-muted-foreground">{txn.merchant_name}</span>
                            )}
                            {/* Mobile: show date as sub-text */}
                            <div className="sm:hidden text-xs text-muted-foreground mt-0.5">
                              {format(parseISO(txn.txn_date), 'MMM d, yyyy')}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono text-red-600 font-medium">
                            {formatMoney(Math.abs(txn.amount))}
                          </TableCell>
                          <TableCell className="text-right">
                            {hasProposal ? (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                Match proposed — see reconciliation
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() =>
                                  onCreateBill({
                                    name: txn.merchant_name ?? txn.description,
                                    amount: String(Math.abs(txn.amount)),
                                    due_date: txn.txn_date,
                                  })
                                }
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Create Bill
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  )
}

// -----------------------------------------------------------------------
// Main page
// -----------------------------------------------------------------------

export default function FinanceOverviewPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()

  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  const [month, setMonth] = useState(currentMonthStr())
  const [summary, setSummary] = useState<MonthSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPipeline, setShowPipeline] = useState(false)

  // Weekly budget state
  const [weeklyData, setWeeklyData] = useState<WeeklySummary | null>(null)
  const [weeklyLoading, setWeeklyLoading] = useState(false)
  const [showPipelineWeekly, setShowPipelineWeekly] = useState(false)

  // Cash snapshot input
  const [snapshotAmount, setSnapshotAmount] = useState('')
  const [snapshotSaving, setSavingSnapshot] = useState(false)

  // Manual bank sync
  const [syncing, setSyncing] = useState(false)

  // Create-bill prefill state (triggered from UntrackedExpensesPanel)
  const [billPrefill, setBillPrefill] = useState<{
    name: string
    amount: string
    due_date: string
  } | null>(null)

  const userRole = user?.role ?? 'standard'
  const canManage = userRole === 'admin' || userRole === 'management'

  useEffect(() => {
    if (!authLoading && user && !canManage) {
      router.push('/dashboard')
    }
  }, [user, authLoading, canManage, router])

  useEffect(() => {
    if (canManage) {
      fetchSummary()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, month])

  useEffect(() => {
    if (canManage && viewMode === 'week') {
      fetchWeekly()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, viewMode])

  const fetchWeekly = async () => {
    setWeeklyLoading(true)
    try {
      const result = await getWeeklyBudget({ weeks: 6 })
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Failed to load weekly budget data')
        return
      }
      setWeeklyData(result.data)
    } catch (err) {
      console.error('Error fetching weekly budget:', err)
      toast.error('Failed to load weekly budget data')
    } finally {
      setWeeklyLoading(false)
    }
  }

  const handleMoveBill = async (billId: string, planned_pay_date: string | null) => {
    const result = await updateBill(billId, { planned_pay_date })
    if (!result.success) {
      toast.error(result.error ?? 'Failed to move bill')
      return
    }
    await fetchWeekly()
  }

  const fetchSummary = async () => {
    setLoading(true)
    try {
      const result = await getMonthSummary(month)
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Failed to load finance data')
        return
      }
      setSummary(result.data)
      if (result.data.latestSnapshot) {
        setSnapshotAmount(String(result.data.latestSnapshot.cash_on_hand))
      } else {
        setSnapshotAmount('')
      }
    } catch (err) {
      console.error('Error fetching finance summary:', err)
      toast.error('Failed to load finance data')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSnapshot = async () => {
    const amount = parseFloat(snapshotAmount)
    if (isNaN(amount)) {
      toast.error('Please enter a valid amount')
      return
    }
    setSavingSnapshot(true)
    try {
      const today = new Date().toISOString().substring(0, 10)
      const result = await upsertCashSnapshot({
        snapshot_date: today,
        cash_on_hand: amount,
        recorded_by: user?.id,
      })
      if (!result.success) {
        toast.error(result.error ?? 'Failed to save snapshot')
        return
      }
      toast.success('Cash snapshot saved')
      await fetchSummary()
    } catch (err) {
      console.error('Error saving snapshot:', err)
      toast.error('Failed to save snapshot')
    } finally {
      setSavingSnapshot(false)
    }
  }

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      const result = await syncBankFromSource()
      if (!result.success) {
        const errMsg =
          result.errors.length > 0 ? result.errors.join('; ') : 'Sync failed'
        toast.error(errMsg)
        // Still refresh summary — partial success may have written a snapshot
        await fetchSummary()
        return
      }
      const cashStr =
        result.cashOnHand != null ? ` — balance: ${formatMoney(result.cashOnHand)}` : ''
      toast.success(`Bank synced${cashStr}`)
      await fetchSummary()
    } catch (err) {
      console.error('Error syncing bank:', err)
      toast.error('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  // Navigate to the bills page with a pre-filled one-off bill via URL params.
  // The bills page handles the actual create; we just route there.
  const handleCreateBillFromTransaction = (prefill: {
    name: string
    amount: string
    due_date: string
  }) => {
    setBillPrefill(prefill)
    const params = new URLSearchParams({
      prefill_name: prefill.name,
      prefill_amount: prefill.amount,
      prefill_due_date: prefill.due_date,
    })
    router.push(`/dashboard/finance/bills?${params.toString()}`)
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading finance data...</div>
      </div>
    )
  }

  if (!canManage) {
    return null
  }

  // Suppress unused-variable warning for billPrefill — used in the handler above
  void billPrefill

  const cashFlow: CashFlowResult | null = summary?.cashFlow
    ? showPipeline
      ? summary.cashFlow.withPipeline
      : summary.cashFlow.realized
    : null

  const troughId = cashFlow?.troughEvent?.id ?? null

  const nonVoidBills = summary?.bills.filter((b) => b.status !== 'void') ?? []
  const totalBills = nonVoidBills.reduce((s, b) => s + b.amount, 0)
  const totalPaid = nonVoidBills.reduce((s, b) => s + b.amount_paid, 0)
  const unpaidBills = totalBills - totalPaid

  // Compute week1Start label for week mode header
  const todayDate = new Date()
  const week1StartDate = startOfWeek(todayDate, { weekStartsOn: 1 })
  const week6EndDate = addDays(week1StartDate, 41) // 6 weeks - 1 day
  const weekRangeLabel = `${format(week1StartDate, 'MMM d')} – ${format(week6EndDate, 'MMM d, yyyy')}`

  return (
    <div className="space-y-6">
      {/* Header with month picker / week toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Finance Overview</h1>
          <p className="text-muted-foreground mt-1">
            {viewMode === 'week'
              ? `Rolling 6 weeks from ${weekRangeLabel}`
              : `Cash position, revenue, and bills for ${getMonthLabel(month)}`
            }
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Month | Week toggle */}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <Button
              variant={viewMode === 'month' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none border-0 h-8 px-3 text-xs"
              onClick={() => setViewMode('month')}
            >
              Month
            </Button>
            <Button
              variant={viewMode === 'week' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none border-0 border-l h-8 px-3 text-xs"
              onClick={() => setViewMode('week')}
            >
              Week
            </Button>
          </div>

          {/* Month nav — only shown in month mode */}
          {viewMode === 'month' && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setMonth(prevMonth(month))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[140px] text-center">
                {getMonthLabel(month)}
              </span>
              <Button variant="outline" size="icon" onClick={() => setMonth(nextMonth(month))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              {month !== currentMonthStr() && (
                <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonthStr())}>
                  Today
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Headline cards — month mode only */}
      {viewMode === 'month' && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Revenue */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Revenue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <div className="text-2xl font-bold">
                {formatMoney(summary?.realizedRevenue ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground">Delivered (realized)</div>
            </div>
            {(summary?.pipelineRevenue ?? 0) > 0 && (
              <div className="border-t pt-2">
                <div className="text-lg font-semibold text-muted-foreground">
                  + {formatMoney(summary?.pipelineRevenue ?? 0)}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Pipeline (expected)
                </div>
                <div className="mt-1 space-y-0.5 pl-4 text-xs text-muted-foreground">
                  <div>Non-terms {formatMoney(summary?.pipelineNonTerms ?? 0)}</div>
                  <div>Terms {formatMoney(summary?.pipelineTerms ?? 0)}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Total Bills */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Bills This Month
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-bold">{formatMoney(totalBills)}</div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="text-green-600">{formatMoney(totalPaid)} paid</span>
              {unpaidBills > 0 && (
                <span className="text-red-600">{formatMoney(unpaidBills)} remaining</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cash Needed / Trough */}
        <Card
          className={
            cashFlow && cashFlow.troughBalance < 0
              ? 'border-red-300 dark:border-red-800'
              : ''
          }
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4" />
              Cash Position (Trough)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!summary?.latestSnapshot ? (
              <div className="text-sm text-muted-foreground">
                Set cash on hand below to see projection
              </div>
            ) : !cashFlow ? (
              <div className="text-sm text-muted-foreground">No cash-flow data</div>
            ) : cashFlow.troughBalance < 0 ? (
              <>
                <div className="text-2xl font-bold text-red-600">
                  {formatMoney(cashFlow.troughBalance)}
                </div>
                <div className="flex items-center gap-1 text-sm text-red-600 mt-1">
                  <AlertTriangle className="h-4 w-4" />
                  Gap: {formatMoney(cashFlow.cashGap)}
                  {cashFlow.troughDate && (
                    <span className="text-muted-foreground ml-1">
                      by {format(parseISO(cashFlow.troughDate), 'MMM d')}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600">
                  {formatMoney(cashFlow.troughBalance)}
                </div>
                <div className="flex items-center gap-1 text-sm text-green-600 mt-1">
                  <CheckCircle className="h-4 w-4" />
                  Covered
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>}

      {/* Bank Balance / Cash on Hand panel — always visible */}
      {summary && (
        <BankBalancePanel
          summary={summary}
          snapshotAmount={snapshotAmount}
          setSnapshotAmount={setSnapshotAmount}
          snapshotSaving={snapshotSaving}
          onSaveSnapshot={handleSaveSnapshot}
          syncing={syncing}
          onSyncNow={handleSyncNow}
        />
      )}

      {/* Reconciliation panel */}
      {user && (
        <ReconciliationPanel />
      )}

      {/* Weekly budget view — week mode only */}
      {viewMode === 'week' && (
        <div className="space-y-4">
          {/* Weekly pipeline toggle */}
          <div className="flex items-center gap-2">
            <Label
              htmlFor="weekly-pipeline-toggle"
              className="text-sm text-muted-foreground cursor-pointer select-none"
            >
              Show pipeline orders
            </Label>
            <Switch
              id="weekly-pipeline-toggle"
              checked={showPipelineWeekly}
              onCheckedChange={setShowPipelineWeekly}
            />
          </div>

          {weeklyLoading ? (
            <WeeklyBudgetSkeleton />
          ) : weeklyData ? (
            <WeeklyBudgetView
              data={weeklyData}
              showPipeline={showPipelineWeekly}
              onMoveBill={handleMoveBill}
            />
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No weekly budget data available.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Cash-flow timeline — month mode only */}
      {viewMode === 'month' && (cashFlow ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Cash-Flow Timeline
              </CardTitle>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="pipeline-toggle"
                  className="text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Show pipeline orders
                </Label>
                <Switch
                  id="pipeline-toggle"
                  checked={showPipeline}
                  onCheckedChange={setShowPipeline}
                />
              </div>
            </div>
            {summary?.latestSnapshot && (
              <div className="text-xs text-muted-foreground">
                Opening balance: {formatMoney(cashFlow.openingBalance)} as of{' '}
                {format(parseISO(cashFlow.snapshotDate), 'MMM d, yyyy')}
                {showPipeline && (
                  <span className="ml-2 text-green-600/70">(including pipeline orders)</span>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {cashFlow.events.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                No cash-flow events for this period
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="hidden sm:table-cell w-[90px]">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="hidden sm:table-cell">Vendor</TableHead>
                      <TableHead className="text-right w-[130px]">Amount</TableHead>
                      <TableHead className="text-right w-[140px]">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Opening balance row */}
                    <TableRow className="bg-muted/30">
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {format(parseISO(cashFlow.snapshotDate), 'MMM d')}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-muted-foreground">
                        Opening balance (snapshot)
                        <div className="sm:hidden text-xs text-muted-foreground mt-0.5">
                          {format(parseISO(cashFlow.snapshotDate), 'MMM d')}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell" />
                      <TableCell />
                      <TableCell className="text-right text-sm font-mono font-semibold">
                        {formatMoney(cashFlow.openingBalance)}
                      </TableCell>
                    </TableRow>

                    {cashFlow.events.map((event) => (
                      <CashFlowEventRow
                        key={`${event.kind}-${event.id}`}
                        event={event}
                        isTrough={troughId === event.id}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Trough summary footer */}
            {cashFlow.troughBalance < cashFlow.openingBalance && (
              <div
                className={`px-4 py-3 border-t text-sm flex items-center gap-2 ${
                  cashFlow.troughBalance < 0
                    ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400'
                    : 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
                }`}
              >
                {cashFlow.troughBalance < 0 ? (
                  <>
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Cash will go negative by {formatMoney(cashFlow.cashGap)}
                    {cashFlow.troughDate &&
                      ` on ${format(parseISO(cashFlow.troughDate), 'MMM d')}`}
                    {showPipeline
                      ? ' — even with pipeline revenue.'
                      : '. Add pipeline revenue with the toggle above.'}
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Lowest point: {formatMoney(cashFlow.troughBalance)}
                    {cashFlow.troughDate &&
                      ` on ${format(parseISO(cashFlow.troughDate), 'MMM d')}`}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : summary && !summary.latestSnapshot ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Record a cash-on-hand snapshot above to enable cash-flow projections.</p>
          </CardContent>
        </Card>
      ) : null)}

      {/* Untracked expenses (collapsed by default) — always visible */}
      <UntrackedExpensesPanel
        month={month}
        onCreateBill={handleCreateBillFromTransaction}
      />
    </div>
  )
}
