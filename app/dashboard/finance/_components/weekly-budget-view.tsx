'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CalendarDays,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { WeeklySummary } from '@/actions/finance'
import type { WeekBucket, WeeklyBillItem } from '@/lib/finance/weekly-budget'

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function formatDateShort(d: string): string {
  return format(parseISO(d), 'MMM d')
}

// ----------------------------------------------------------------
// Bill status badge
// ----------------------------------------------------------------

function BillStatusBadge({ bill }: { bill: WeeklyBillItem }) {
  if (bill.isPastDue) {
    return (
      <Badge variant="destructive" className="text-xs shrink-0">
        Past Due
      </Badge>
    )
  }
  if (bill.isUnplanned) {
    return (
      <Badge variant="outline" className="text-xs text-amber-600 border-amber-400 shrink-0">
        Unplanned
      </Badge>
    )
  }
  if (bill.status === 'partial') {
    return (
      <Badge variant="outline" className="text-xs text-blue-600 border-blue-400 shrink-0">
        Partial
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-xs shrink-0">
      Unpaid
    </Badge>
  )
}

// ----------------------------------------------------------------
// Move control — a Select to assign a bill to a week or mark unplanned
// ----------------------------------------------------------------

function BillMoveSelect({
  bill,
  weeks,
  onMove,
}: {
  bill: WeeklyBillItem
  weeks: WeekBucket[]
  onMove: (billId: string, planned_pay_date: string | null) => Promise<void>
}) {
  const [moving, setMoving] = useState(false)

  const currentValue = bill.planned_pay_date ?? 'unplanned'

  const handleChange = async (value: string) => {
    setMoving(true)
    try {
      await onMove(bill.id, value === 'unplanned' ? null : value)
    } finally {
      setMoving(false)
    }
  }

  return (
    <Select value={currentValue} onValueChange={handleChange} disabled={moving}>
      <SelectTrigger className="h-7 text-xs w-[130px] sm:w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unplanned">
          <span className="text-amber-600">Unplanned</span>
        </SelectItem>
        {weeks.map((w) => (
          <SelectItem key={w.weekStart} value={w.weekStart}>
            <span className="hidden sm:inline">
              Wk {w.weekNumber} &middot; {w.label}
              {w.weekNumber === 1 ? ' (This Week)' : ''}
            </span>
            <span className="sm:hidden">
              Wk {w.weekNumber}{w.weekNumber === 1 ? ' (Now)' : ''}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ----------------------------------------------------------------
// Bill row in the table
// ----------------------------------------------------------------

function BillRow({
  bill,
  weeks,
  onMove,
}: {
  bill: WeeklyBillItem
  weeks: WeekBucket[]
  onMove: (billId: string, planned_pay_date: string | null) => Promise<void>
}) {
  const isDueSoon = !bill.isPastDue && bill.due_date <= weeks[weeks.length - 1]?.weekEnd

  return (
    <TableRow>
      <TableCell className="py-2">
        <BillStatusBadge bill={bill} />
      </TableCell>
      <TableCell className="py-2">
        <div className="text-sm">{bill.name}</div>
        {/* Mobile sub-text: vendor + due date */}
        <div className="sm:hidden text-xs text-muted-foreground mt-0.5 space-x-1">
          {bill.vendor && <span>{bill.vendor}</span>}
          {bill.vendor && <span>&middot;</span>}
          <span
            className={
              bill.isPastDue
                ? 'text-red-600 font-medium'
                : isDueSoon
                ? 'text-amber-600'
                : ''
            }
          >
            Due {formatDateShort(bill.due_date)}
          </span>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell py-2 text-sm text-muted-foreground">
        {bill.vendor ?? '—'}
      </TableCell>
      <TableCell className="hidden sm:table-cell py-2 text-sm whitespace-nowrap">
        <span
          className={
            bill.isPastDue
              ? 'text-red-600 font-medium'
              : isDueSoon
              ? 'text-amber-600'
              : 'text-muted-foreground'
          }
        >
          {formatDateShort(bill.due_date)}
        </span>
      </TableCell>
      <TableCell className="py-2 text-right font-mono text-sm font-medium">
        {formatMoney(bill.remaining)}
      </TableCell>
      <TableCell className="py-2 text-right">
        <BillMoveSelect bill={bill} weeks={weeks} onMove={onMove} />
      </TableCell>
    </TableRow>
  )
}

// ----------------------------------------------------------------
// Bills table (shared by week cards and unplanned bucket)
// ----------------------------------------------------------------

function BillsTable({
  bills,
  weeks,
  onMove,
  emptyText = 'No bills planned — move a bill here.',
}: {
  bills: WeeklyBillItem[]
  weeks: WeekBucket[]
  onMove: (billId: string, planned_pay_date: string | null) => Promise<void>
  emptyText?: string
}) {
  if (bills.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        {emptyText}
      </div>
    )
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">Status</TableHead>
            <TableHead>Bill</TableHead>
            <TableHead className="hidden sm:table-cell">Vendor</TableHead>
            <TableHead className="hidden sm:table-cell w-[80px]">Due</TableHead>
            <TableHead className="text-right w-[100px]">Amount</TableHead>
            <TableHead className="text-right w-[140px] sm:w-[170px]">Move to</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bills.map((bill) => (
            <BillRow key={bill.id} bill={bill} weeks={weeks} onMove={onMove} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ----------------------------------------------------------------
// Balance bar
// ----------------------------------------------------------------

function BalanceBar({ endBalance }: { endBalance: number }) {
  const isPositive = endBalance >= 0
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
      <div
        className={`h-full rounded-full transition-all ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}
        style={{ width: isPositive ? '100%' : '0%' }}
      />
    </div>
  )
}

// ----------------------------------------------------------------
// Single week card (desktop version — fixed-width column)
// ----------------------------------------------------------------

function WeekCardDesktop({
  week,
  weeks,
  showPipeline,
  onMove,
}: {
  week: WeekBucket
  weeks: WeekBucket[]
  showPipeline: boolean
  onMove: (billId: string, planned_pay_date: string | null) => Promise<void>
}) {
  const endBalance = showPipeline ? week.optimisticEndBalance : week.conservativeEndBalance
  const isShortfall = showPipeline ? week.optimisticEndBalance < 0 : week.isShortfall
  const shortfallAmt = Math.abs(endBalance)

  return (
    <Card
      className={`min-w-[240px] flex-shrink-0 flex flex-col ${
        week.weekNumber === 1 ? 'ring-2 ring-primary' : ''
      } ${
        isShortfall
          ? 'border-red-300 dark:border-red-800'
          : week.isPipelineSavesIt && !showPipeline
          ? 'border-amber-300 dark:border-amber-800'
          : ''
      }`}
    >
      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex items-start justify-between gap-1">
          <div>
            <CardTitle className="text-sm font-semibold">
              Week {week.weekNumber}
              {week.weekNumber === 1 && (
                <span className="ml-1 text-xs font-normal text-primary">This Week</span>
              )}
            </CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {week.label}
            </div>
          </div>
          {week.hasPastDueBills && (
            <Badge variant="destructive" className="text-xs shrink-0">
              Past Due
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-3 pb-3 flex-1 flex flex-col gap-1.5">
        {/* Balance summary */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">Start</span>
          <span className="text-right font-mono">{formatMoney(week.startBalance)}</span>

          <span className="text-green-600 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> In
          </span>
          <span className="text-right font-mono text-green-600">
            +{formatMoney(week.realizedTotal)}
          </span>

          {showPipeline && week.pipelineTotal > 0 && (
            <>
              <span className="text-green-600/60 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span className="italic">Pipeline</span>
              </span>
              <span className="text-right font-mono text-green-600/60 italic">
                +{formatMoney(week.pipelineTotal)}
              </span>
            </>
          )}

          <span className="text-red-600 flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> Out
          </span>
          <span className="text-right font-mono text-red-600">
            -{formatMoney(week.billsTotal)}
          </span>
        </div>

        {/* End balance */}
        <div
          className={`flex items-center justify-between border-t pt-1.5 ${
            isShortfall ? 'border-red-200 dark:border-red-900' : ''
          }`}
        >
          <span className="text-xs font-medium">End</span>
          <span
            className={`font-mono text-sm font-bold ${
              isShortfall ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {formatMoney(endBalance)}
          </span>
        </div>

        {isShortfall && (
          <div className="flex items-center gap-1 text-xs text-red-600">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Shortfall: {formatMoney(shortfallAmt)}
          </div>
        )}

        {!isShortfall && week.isPipelineSavesIt && !showPipeline && (
          <div className="flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Pipeline needed
          </div>
        )}

        <BalanceBar endBalance={endBalance} />
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------------------------
// Week card (mobile — collapsible)
// ----------------------------------------------------------------

function WeekCardMobile({
  week,
  weeks,
  showPipeline,
  defaultOpen,
  onMove,
}: {
  week: WeekBucket
  weeks: WeekBucket[]
  showPipeline: boolean
  defaultOpen: boolean
  onMove: (billId: string, planned_pay_date: string | null) => Promise<void>
}) {
  const [open, setOpen] = useState(defaultOpen)
  const endBalance = showPipeline ? week.optimisticEndBalance : week.conservativeEndBalance
  const isShortfall = showPipeline ? week.optimisticEndBalance < 0 : week.isShortfall

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card
        className={`${
          week.weekNumber === 1 ? 'ring-2 ring-primary' : ''
        } ${
          isShortfall
            ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
            : week.isPipelineSavesIt && !showPipeline
            ? 'border-amber-300 dark:border-amber-800'
            : ''
        }`}
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full h-auto py-3 px-4 flex items-start justify-between hover:bg-transparent"
          >
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">
                  Week {week.weekNumber}
                  {week.weekNumber === 1 && (
                    <span className="ml-1 text-xs font-normal text-primary">This Week</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{week.label}</span>
                {week.bills.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {week.bills.length} bill{week.bills.length !== 1 ? 's' : ''}
                  </Badge>
                )}
                {isShortfall && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Shortfall
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs">
                <span className="text-muted-foreground">
                  Start: <span className="font-mono">{formatMoney(week.startBalance)}</span>
                </span>
                <span
                  className={`font-mono font-semibold ${
                    isShortfall ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  End: {formatMoney(endBalance)}
                </span>
              </div>
            </div>
            {open ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4">
            {/* Summary row */}
            <div className="flex items-center gap-4 text-xs pb-3 border-b flex-wrap">
              <span className="text-green-600">
                +{formatMoney(week.realizedTotal)} realized
              </span>
              {showPipeline && week.pipelineTotal > 0 && (
                <span className="text-green-600/60 italic">
                  +{formatMoney(week.pipelineTotal)} pipeline
                </span>
              )}
              <span className="text-red-600">
                -{formatMoney(week.billsTotal)} bills
              </span>
            </div>
            <BalanceBar endBalance={endBalance} />
            <div className="mt-3">
              <BillsTable bills={week.bills} weeks={weeks} onMove={onMove} />
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

// ----------------------------------------------------------------
// Unplanned bills bucket
// ----------------------------------------------------------------

function UnplannedBucket({
  bills,
  weeks,
  onMove,
}: {
  bills: WeeklyBillItem[]
  weeks: WeekBucket[]
  onMove: (billId: string, planned_pay_date: string | null) => Promise<void>
}) {
  const [open, setOpen] = useState(bills.length > 0)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-amber-300 dark:border-amber-800">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full h-auto py-3 px-4 flex items-center justify-between hover:bg-transparent"
          >
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-amber-600" />
              <span className="font-semibold text-sm text-amber-700 dark:text-amber-400">
                Unplanned Bills
              </span>
              {bills.length > 0 && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
                  {bills.length}
                </Badge>
              )}
            </div>
            {open ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4">
            <p className="text-xs text-muted-foreground mb-3">
              These bills have no planned pay date and are not included in the weekly cash math.
              Assign them to a week using the &quot;Move to&quot; selector.
            </p>
            <BillsTable
              bills={bills}
              weeks={weeks}
              onMove={onMove}
              emptyText="No unplanned bills."
            />
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

// ----------------------------------------------------------------
// Skeleton loading strip
// ----------------------------------------------------------------

export function WeeklyBudgetSkeleton() {
  return (
    <div className="space-y-4">
      <div className="hidden sm:flex gap-3 overflow-x-auto pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 min-w-[240px] rounded-lg" />
        ))}
      </div>
      <div className="sm:hidden space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------
// Main component
// ----------------------------------------------------------------

export interface WeeklyBudgetViewProps {
  data: WeeklySummary
  showPipeline: boolean
  onMoveBill: (billId: string, planned_pay_date: string | null) => Promise<void>
}

export function WeeklyBudgetView({
  data,
  showPipeline,
  onMoveBill,
}: WeeklyBudgetViewProps) {
  const { weeks, unbucketedBills } = data

  // Collect all unplanned bills across weeks + unbucketed
  const allUnplanned = [
    ...weeks.flatMap((w) => w.bills.filter((b) => b.isUnplanned && !b.isPastDue)),
    ...unbucketedBills,
  ]

  // For week move options: provide the weeks array so BillMoveSelect can show them
  const weekOptions = weeks

  return (
    <div className="space-y-4">
      {/* Unplanned bucket — shown above on mobile for prominence */}
      {allUnplanned.length > 0 && (
        <div className="sm:hidden">
          <UnplannedBucket bills={allUnplanned} weeks={weekOptions} onMove={onMoveBill} />
        </div>
      )}

      {/* Desktop: horizontal scroll strip */}
      <div className="hidden sm:block">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {weeks.map((week) => (
            <WeekCardDesktop
              key={week.weekNumber}
              week={week}
              weeks={weekOptions}
              showPipeline={showPipeline}
              onMove={onMoveBill}
            />
          ))}
        </div>
        {/* Desktop week detail — show bill tables below the strip */}
        <div className="mt-4 space-y-4">
          {weeks.map((week) => (
            <Collapsible key={week.weekNumber} defaultOpen={week.weekNumber === 1 || week.bills.length > 0}>
              <Card>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full h-auto py-3 px-4 flex items-center justify-between hover:bg-transparent"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        Week {week.weekNumber} — {week.label}
                      </span>
                      {week.bills.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {week.bills.length} bill{week.bills.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      {week.isShortfall && !showPipeline && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Shortfall
                        </Badge>
                      )}
                      {week.isPipelineSavesIt && !showPipeline && (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
                          Pipeline needed
                        </Badge>
                      )}
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pb-3">
                    <BillsTable bills={week.bills} weeks={weekOptions} onMove={onMoveBill} />
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}

          {/* Unplanned + unbucketed on desktop */}
          {allUnplanned.length > 0 && (
            <UnplannedBucket bills={allUnplanned} weeks={weekOptions} onMove={onMoveBill} />
          )}
        </div>
      </div>

      {/* Mobile: stacked collapsible cards */}
      <div className="sm:hidden space-y-3">
        {weeks.map((week, i) => (
          <WeekCardMobile
            key={week.weekNumber}
            week={week}
            weeks={weekOptions}
            showPipeline={showPipeline}
            defaultOpen={i === 0}
            onMove={onMoveBill}
          />
        ))}

        {/* Unplanned at bottom on mobile (already shown at top when count > 0) */}
        {allUnplanned.length === 0 && (
          <UnplannedBucket bills={allUnplanned} weeks={weekOptions} onMove={onMoveBill} />
        )}
      </div>

      {/* No-snapshot notice */}
      {!data.latestSnapshot && (
        <Card>
          <CardContent className="py-6 text-center">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm text-muted-foreground">
              Record a cash-on-hand snapshot to enable balance projections.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Trough summary */}
      {data.latestSnapshot && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <span className="font-medium text-muted-foreground">6-Week Outlook</span>
              <span>
                Conservative trough:{' '}
                <span
                  className={`font-mono font-semibold ${
                    data.conservativeTrough < 0 ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  {formatMoney(data.conservativeTrough)}
                </span>
              </span>
              {showPipeline && (
                <span>
                  Optimistic trough:{' '}
                  <span
                    className={`font-mono font-semibold ${
                      data.optimisticTrough < 0 ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {formatMoney(data.optimisticTrough)}
                  </span>
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
