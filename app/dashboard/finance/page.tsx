'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  ArrowDownCircle,
  Banknote,
  Save,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { getMonthSummary, recordCashSnapshot } from '@/actions/finance'
import type { MonthSummary } from '@/actions/finance'
import type { CashFlowResult, CashFlowEvent } from '@/lib/finance/cash-flow'

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function getMonthLabel(month: string): string {
  // month is 'YYYY-MM-01'
  return format(parseISO(month), 'MMMM yyyy')
}

function prevMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(year, mon - 2, 1) // mon-2 because Date months are 0-indexed and we want previous
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function nextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(year, mon, 1) // mon is already the "next month" index since Date is 0-indexed
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function currentMonthStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
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
    // outflow bill
    amountClass = 'text-red-600 font-medium'
  }

  if (isTrough) {
    rowClass = 'bg-amber-50 dark:bg-amber-950/20'
  }

  return (
    <TableRow className={rowClass}>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
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
// Main page
// -----------------------------------------------------------------------

export default function FinanceOverviewPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()

  const [month, setMonth] = useState(currentMonthStr())
  const [summary, setSummary] = useState<MonthSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPipeline, setShowPipeline] = useState(false)

  // Cash snapshot input
  const [snapshotAmount, setSnapshotAmount] = useState('')
  const [snapshotSaving, setSavingSnapshot] = useState(false)

  const userRole = user?.role || 'standard'
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
  }, [canManage, month])

  const fetchSummary = async () => {
    setLoading(true)
    try {
      const result = await getMonthSummary(month)
      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to load finance data')
        return
      }
      setSummary(result.data)
      // Pre-fill snapshot amount if one exists
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
      const result = await recordCashSnapshot({
        snapshot_date: today,
        cash_on_hand: amount,
        recorded_by: user?.id,
      })
      if (!result.success) {
        toast.error(result.error || 'Failed to save snapshot')
        return
      }
      toast.success('Cash snapshot saved')
      fetchSummary()
    } catch (err) {
      console.error('Error saving snapshot:', err)
      toast.error('Failed to save snapshot')
    } finally {
      setSavingSnapshot(false)
    }
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

  // Pick the correct cash-flow view based on toggle
  const cashFlow: CashFlowResult | null = summary?.cashFlow
    ? (showPipeline ? summary.cashFlow.withPipeline : summary.cashFlow.realized)
    : null

  const troughId = cashFlow?.troughEvent?.id ?? null

  const totalBills = summary?.bills.reduce((s, b) => s + b.amount, 0) ?? 0
  const totalPaid = summary?.bills.reduce((s, b) => s + b.amount_paid, 0) ?? 0
  const unpaidBills = totalBills - totalPaid

  return (
    <div className="space-y-6">
      {/* Header with month picker */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Finance Overview</h1>
          <p className="text-muted-foreground mt-1">Cash position, revenue, and bills for {getMonthLabel(month)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setMonth(prevMonth(month))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">{getMonthLabel(month)}</span>
          <Button variant="outline" size="icon" onClick={() => setMonth(nextMonth(month))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {month !== currentMonthStr() && (
            <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonthStr())}>
              Today
            </Button>
          )}
        </div>
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <div className="text-2xl font-bold">{formatMoney(summary?.realizedRevenue ?? 0)}</div>
              <div className="text-xs text-muted-foreground">Delivered (realized)</div>
            </div>
            {(summary?.pipelineRevenue ?? 0) > 0 && (
              <div className="border-t pt-2">
                <div className="text-lg font-semibold text-muted-foreground">
                  + {formatMoney(summary?.pipelineRevenue ?? 0)}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Pipeline (confirmed/packed)
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
        <Card className={cashFlow && cashFlow.troughBalance < 0 ? 'border-red-300 dark:border-red-800' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4" />
              Cash Position (Trough)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!summary?.latestSnapshot ? (
              <div className="text-sm text-muted-foreground">Set cash on hand below to see projection</div>
            ) : !cashFlow ? (
              <div className="text-sm text-muted-foreground">No cash-flow data</div>
            ) : cashFlow.troughBalance < 0 ? (
              <>
                <div className="text-2xl font-bold text-red-600">{formatMoney(cashFlow.troughBalance)}</div>
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
                <div className="text-2xl font-bold text-green-600">{formatMoney(cashFlow.troughBalance)}</div>
                <div className="flex items-center gap-1 text-sm text-green-600 mt-1">
                  <CheckCircle className="h-4 w-4" />
                  Covered
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cash on hand snapshot input */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Cash on Hand
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary?.latestSnapshot ? (
            <div className="text-xs text-muted-foreground mb-3">
              Last recorded: {formatMoney(summary.latestSnapshot.cash_on_hand)} on{' '}
              {format(parseISO(summary.latestSnapshot.snapshot_date), 'MMM d, yyyy')}. Update below to refresh projections.
            </div>
          ) : (
            <div className="text-sm text-amber-600 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              No cash snapshot recorded yet. Set current cash on hand to enable cash-flow projections.
            </div>
          )}
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
            <Button onClick={handleSaveSnapshot} disabled={snapshotSaving || !snapshotAmount}>
              <Save className="h-4 w-4 mr-2" />
              {snapshotSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cash-flow timeline */}
      {cashFlow ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Cash-Flow Timeline
              </CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="pipeline-toggle" className="text-sm text-muted-foreground cursor-pointer select-none">
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
                      <TableHead className="w-[90px]">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right w-[130px]">Amount</TableHead>
                      <TableHead className="text-right w-[140px]">Running Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Opening balance row */}
                    <TableRow className="bg-muted/30">
                      <TableCell className="text-xs text-muted-foreground">
                        {format(parseISO(cashFlow.snapshotDate), 'MMM d')}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-muted-foreground">
                        Opening balance (snapshot)
                      </TableCell>
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
              <div className={`px-4 py-3 border-t text-sm flex items-center gap-2 ${
                cashFlow.troughBalance < 0
                  ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400'
                  : 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
              }`}>
                {cashFlow.troughBalance < 0 ? (
                  <>
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Cash will go negative by {formatMoney(cashFlow.cashGap)}
                    {cashFlow.troughDate && ` on ${format(parseISO(cashFlow.troughDate), 'MMM d')}`}
                    {showPipeline ? ' — even with pipeline revenue.' : '. Add pipeline revenue with the toggle above.'}
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Lowest point: {formatMoney(cashFlow.troughBalance)}
                    {cashFlow.troughDate && ` on ${format(parseISO(cashFlow.troughDate), 'MMM d')}`}
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
      ) : null}
    </div>
  )
}
