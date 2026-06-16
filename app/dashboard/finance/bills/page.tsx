'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { toast } from 'sonner'
import {
  Plus,
  Banknote,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  CheckCircle,
  Clock,
  AlertTriangle,
  Minus,
  MoreVertical,
  FileStack,
  Edit2,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { format, parseISO } from 'date-fns'
import {
  createBill,
  updateBill,
  markBillPaid,
  instantiateBillsFromTemplates,
} from '@/actions/finance'
import type { Bill, BillStatus, BillTemplate, Vendor } from '@/actions/finance'

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function currentMonthStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
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

function getMonthLabel(month: string): string {
  return format(parseISO(month), 'MMMM yyyy')
}

// -----------------------------------------------------------------------
// Status badge
// -----------------------------------------------------------------------

function BillStatusBadge({ status }: { status: BillStatus }) {
  switch (status) {
    case 'paid':
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircle className="h-3 w-3 mr-1" />
          Paid
        </Badge>
      )
    case 'partial':
      return (
        <Badge variant="default" className="bg-amber-500">
          <Minus className="h-3 w-3 mr-1" />
          Partial
        </Badge>
      )
    case 'unpaid':
      return (
        <Badge variant="destructive">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Unpaid
        </Badge>
      )
    case 'scheduled':
      return (
        <Badge variant="outline">
          <Clock className="h-3 w-3 mr-1" />
          Scheduled
        </Badge>
      )
    case 'void':
      return <Badge variant="outline" className="text-muted-foreground">Void</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

// -----------------------------------------------------------------------
// Types for local form state
// -----------------------------------------------------------------------

interface BillFormData {
  name: string
  vendor_id: string
  amount: string
  due_date: string
  status: BillStatus
  notes: string
}

interface MarkPaidFormData {
  amount_paid: string
  paid_date: string
  payment_method: string
  payment_ref: string
}

const PAYMENT_METHODS = [
  { value: 'check', label: 'Check' },
  { value: 'ach', label: 'ACH' },
  { value: 'wire', label: 'Wire' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
]

const BILL_STATUSES: { value: BillStatus; label: string }[] = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
]

type ViewMode = 'table' | 'card'

// -----------------------------------------------------------------------
// Main page
// -----------------------------------------------------------------------

export default function BillsPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const supabase = createClient()

  const [month, setMonth] = useState(currentMonthStr())
  const [bills, setBills] = useState<Bill[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [templates, setTemplates] = useState<BillTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  // Bill form sheet
  const [billSheetOpen, setBillSheetOpen] = useState(false)
  const [editingBill, setEditingBill] = useState<Bill | null>(null)
  const [billForm, setBillForm] = useState<BillFormData>({
    name: '',
    vendor_id: '',
    amount: '',
    due_date: '',
    status: 'unpaid',
    notes: '',
  })
  const [billSaving, setBillSaving] = useState(false)

  // Mark paid sheet
  const [paidSheetOpen, setPaidSheetOpen] = useState(false)
  const [payingBill, setPayingBill] = useState<Bill | null>(null)
  const [paidForm, setPaidForm] = useState<MarkPaidFormData>({
    amount_paid: '',
    paid_date: new Date().toISOString().substring(0, 10),
    payment_method: '',
    payment_ref: '',
  })
  const [paidSaving, setPaidSaving] = useState(false)

  // Instantiate dialog
  const [instantiateDialogOpen, setInstantiateDialogOpen] = useState(false)
  const [instantiating, setInstantiating] = useState(false)
  const [instantiatePreview, setInstantiatePreview] = useState<{
    toCreate: BillTemplate[]
    toSkip: BillTemplate[]
  } | null>(null)
  const [instantiatePreviewLoading, setInstantiatePreviewLoading] = useState(false)

  // Budget vs actual
  const [budgetOpen, setBudgetOpen] = useState(false)

  const userRole = user?.role || 'standard'
  const canManage = userRole === 'admin' || userRole === 'management'

  useEffect(() => {
    if (!authLoading && user && !canManage) {
      router.push('/dashboard')
    }
  }, [user, authLoading, canManage, router])

  useEffect(() => {
    if (canManage) {
      fetchData()
    }
  }, [canManage, month])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [billsRes, vendorsRes, templatesRes] = await Promise.all([
        supabase
          .from('finance_bills')
          .select(`
            *,
            template:finance_bill_templates(id, name, amount),
            vendor:finance_vendors(id, name)
          `)
          .eq('period_month', month)
          .order('due_date', { ascending: true }),
        supabase
          .from('finance_vendors')
          .select('*')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('finance_bill_templates')
          .select('*, vendor:finance_vendors(id, name)')
          .eq('is_active', true)
          .order('name'),
      ])

      if (billsRes.error) throw billsRes.error
      if (vendorsRes.error) throw vendorsRes.error
      if (templatesRes.error) throw templatesRes.error

      setBills((billsRes.data || []) as Bill[])
      setVendors((vendorsRes.data || []) as Vendor[])
      setTemplates((templatesRes.data || []) as BillTemplate[])
    } catch (err) {
      console.error('Error fetching bills data:', err)
      toast.error('Failed to load bills')
    } finally {
      setLoading(false)
    }
  }

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------

  const filteredBills = bills.filter((b) => {
    if (statusFilter === 'all') return true
    return b.status === statusFilter
  })

  // -----------------------------------------------------------------------
  // Bill form (create / edit)
  // -----------------------------------------------------------------------

  const openNewBillSheet = () => {
    setEditingBill(null)
    setBillForm({
      name: '',
      vendor_id: '',
      amount: '',
      due_date: '',
      status: 'unpaid',
      notes: '',
    })
    setBillSheetOpen(true)
  }

  const openEditBillSheet = (bill: Bill) => {
    setEditingBill(bill)
    setBillForm({
      name: bill.name,
      vendor_id: bill.vendor_id ?? '',
      amount: String(bill.amount),
      due_date: bill.due_date,
      status: bill.status,
      notes: bill.notes ?? '',
    })
    setBillSheetOpen(true)
  }

  const handleSaveBill = async () => {
    const amount = parseFloat(billForm.amount)
    if (!billForm.name.trim()) {
      toast.error('Bill name is required')
      return
    }
    if (isNaN(amount) || amount < 0) {
      toast.error('Please enter a valid amount')
      return
    }
    if (!billForm.due_date) {
      toast.error('Due date is required')
      return
    }

    setBillSaving(true)
    try {
      if (editingBill) {
        const result = await updateBill(editingBill.id, {
          name: billForm.name.trim(),
          vendor_id: billForm.vendor_id || null,
          amount,
          due_date: billForm.due_date,
          status: billForm.status,
          notes: billForm.notes.trim() || null,
        })
        if (!result.success) {
          toast.error(result.error || 'Failed to update bill')
          return
        }
        toast.success('Bill updated')
      } else {
        const result = await createBill({
          name: billForm.name.trim(),
          vendor_id: billForm.vendor_id || undefined,
          amount,
          period_month: month,
          due_date: billForm.due_date,
          status: billForm.status,
          notes: billForm.notes.trim() || undefined,
          created_by: user?.id,
        })
        if (!result.success) {
          toast.error(result.error || 'Failed to create bill')
          return
        }
        toast.success('Bill created')
      }
      setBillSheetOpen(false)
      fetchData()
    } catch (err) {
      console.error('Error saving bill:', err)
      toast.error('Failed to save bill')
    } finally {
      setBillSaving(false)
    }
  }

  // -----------------------------------------------------------------------
  // Mark paid
  // -----------------------------------------------------------------------

  const openMarkPaidSheet = (bill: Bill) => {
    setPayingBill(bill)
    setPaidForm({
      amount_paid: String(bill.amount - bill.amount_paid > 0 ? bill.amount - bill.amount_paid : bill.amount),
      paid_date: new Date().toISOString().substring(0, 10),
      payment_method: bill.payment_method ?? '',
      payment_ref: bill.payment_ref ?? '',
    })
    setPaidSheetOpen(true)
  }

  const handleMarkPaid = async () => {
    if (!payingBill) return
    const amount = parseFloat(paidForm.amount_paid)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }
    if (!paidForm.paid_date) {
      toast.error('Payment date is required')
      return
    }

    setPaidSaving(true)
    try {
      const result = await markBillPaid(payingBill.id, {
        amount_paid: amount,
        paid_date: paidForm.paid_date,
        payment_method: paidForm.payment_method || undefined,
        payment_ref: paidForm.payment_ref || undefined,
      })
      if (!result.success) {
        toast.error(result.error || 'Failed to record payment')
        return
      }
      toast.success(amount >= payingBill.amount ? 'Bill marked as paid' : 'Partial payment recorded')
      setPaidSheetOpen(false)
      fetchData()
    } catch (err) {
      console.error('Error marking bill paid:', err)
      toast.error('Failed to record payment')
    } finally {
      setPaidSaving(false)
    }
  }

  // -----------------------------------------------------------------------
  // Instantiate from templates
  // -----------------------------------------------------------------------

  const openInstantiateDialog = async () => {
    setInstantiateDialogOpen(true)
    setInstantiatePreviewLoading(true)
    setInstantiatePreview(null)
    try {
      // Compute which templates would be created vs skipped
      const existingTemplateIds = new Set(
        bills.filter((b) => b.template_id).map((b) => b.template_id as string)
      )
      const toCreate = templates.filter((t) => !existingTemplateIds.has(t.id))
      const toSkip = templates.filter((t) => existingTemplateIds.has(t.id))
      setInstantiatePreview({ toCreate, toSkip })
    } catch (err) {
      console.error('Error computing instantiate preview:', err)
    } finally {
      setInstantiatePreviewLoading(false)
    }
  }

  const handleInstantiate = async () => {
    setInstantiating(true)
    try {
      const result = await instantiateBillsFromTemplates(month)
      if (!result.success) {
        toast.error(result.error || 'Failed to instantiate bills')
        return
      }
      toast.success(
        `Created ${result.created} bill${result.created !== 1 ? 's' : ''}` +
          (result.skipped > 0 ? `, skipped ${result.skipped} already existing` : '')
      )
      setInstantiateDialogOpen(false)
      fetchData()
    } catch (err) {
      console.error('Error instantiating bills:', err)
      toast.error('Failed to instantiate bills')
    } finally {
      setInstantiating(false)
    }
  }

  // -----------------------------------------------------------------------
  // Budget vs. actual data
  // -----------------------------------------------------------------------

  interface BudgetRow {
    name: string
    budgeted: number | null
    actual: number
    variance: number | null
    isVariable: boolean
    isUnplanned: boolean
    templateId: string | null
  }

  const buildBudgetRows = (): BudgetRow[] => {
    const rows: BudgetRow[] = []

    for (const bill of bills) {
      if (bill.status === 'void') continue
      if (bill.template_id && bill.template) {
        const tpl = templates.find((t) => t.id === bill.template_id)
        const isVariable = tpl ? !tpl.is_amount_fixed : false
        const budgeted = tpl?.amount ?? bill.template.amount ?? null
        rows.push({
          name: bill.name,
          budgeted: isVariable ? null : budgeted,
          actual: bill.amount,
          variance: isVariable || budgeted === null ? null : bill.amount - budgeted,
          isVariable,
          isUnplanned: false,
          templateId: bill.template_id,
        })
      } else {
        rows.push({
          name: bill.name,
          budgeted: null,
          actual: bill.amount,
          variance: null,
          isVariable: false,
          isUnplanned: true,
          templateId: null,
        })
      }
    }

    return rows
  }

  const budgetRows = buildBudgetRows()
  const totalBudgeted = budgetRows.reduce((s, r) => s + (r.budgeted ?? 0), 0)
  const totalActual = budgetRows.reduce((s, r) => s + r.actual, 0)
  const totalVariance = totalActual - totalBudgeted

  // -----------------------------------------------------------------------
  // Summaries
  // -----------------------------------------------------------------------

  const totalBills = bills.reduce((s, b) => s + b.amount, 0)
  const unpaidBills = bills.filter((b) => b.status === 'unpaid' || b.status === 'partial')
  const unpaidAmount = unpaidBills.reduce((s, b) => s + (b.amount - b.amount_paid), 0)

  // -----------------------------------------------------------------------
  // Loading / auth guard
  // -----------------------------------------------------------------------

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading bills...</div>
      </div>
    )
  }

  if (!canManage) {
    return null
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Bills</h1>
          <p className="text-muted-foreground mt-1">Manage bills and payments for {getMonthLabel(month)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month picker */}
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
          <div className="flex items-center border rounded-lg p-1">
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className="px-2"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'card' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('card')}
              className="px-2"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" onClick={openInstantiateDialog}>
            <FileStack className="h-4 w-4 mr-2" />
            From Templates
          </Button>
          <Button onClick={openNewBillSheet}>
            <Plus className="h-4 w-4 mr-2" />
            Add Bill
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Banknote className="h-4 w-4" />
              Total Bills
            </div>
            <div className="text-2xl font-bold">{formatMoney(totalBills)}</div>
            <div className="text-xs text-muted-foreground">{bills.length} bills this month</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <AlertTriangle className="h-4 w-4" />
              Still Owed
            </div>
            <div className={`text-2xl font-bold ${unpaidAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatMoney(unpaidAmount)}
            </div>
            <div className="text-xs text-muted-foreground">{unpaidBills.length} unpaid / partial</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCircle className="h-4 w-4" />
              Paid
            </div>
            <div className="text-2xl font-bold text-green-600">
              {formatMoney(bills.filter((b) => b.status === 'paid').reduce((s, b) => s + b.amount, 0))}
            </div>
            <div className="text-xs text-muted-foreground">
              {bills.filter((b) => b.status === 'paid').length} bills paid
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {filteredBills.length} of {bills.length} bills
        </span>
      </div>

      {/* Bills list */}
      {filteredBills.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Banknote className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              {statusFilter !== 'all'
                ? 'No bills found with this status'
                : 'No bills for this month yet'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={openInstantiateDialog}>
                <FileStack className="h-4 w-4 mr-2" />
                From Templates
              </Button>
              <Button onClick={openNewBillSheet}>
                <Plus className="h-4 w-4 mr-2" />
                Add Bill
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        /* Table view — desktop */
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBills.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium">
                        {bill.name}
                        {bill.notes && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{bill.notes}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {bill.vendor?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(bill.amount)}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(parseISO(bill.due_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <BillStatusBadge status={bill.status} />
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {bill.amount_paid > 0 ? formatMoney(bill.amount_paid) : '—'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {bill.status !== 'paid' && bill.status !== 'void' && (
                              <DropdownMenuItem onClick={() => openMarkPaidSheet(bill)}>
                                <Banknote className="h-4 w-4 mr-2" />
                                Mark Paid
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => openEditBillSheet(bill)}>
                              <Edit2 className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Card view — mobile */
        <div className="space-y-3">
          {filteredBills.map((bill) => (
            <Card key={bill.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{bill.name}</p>
                      <BillStatusBadge status={bill.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                      {bill.vendor?.name && <span>{bill.vendor.name}</span>}
                      <span>Due {format(parseISO(bill.due_date), 'MMM d, yyyy')}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-sm">
                      <span className="font-semibold">{formatMoney(bill.amount)}</span>
                      {bill.amount_paid > 0 && (
                        <span className="text-green-600">{formatMoney(bill.amount_paid)} paid</span>
                      )}
                    </div>
                    {bill.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{bill.notes}</p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {bill.status !== 'paid' && bill.status !== 'void' && (
                        <DropdownMenuItem onClick={() => openMarkPaidSheet(bill)}>
                          <Banknote className="h-4 w-4 mr-2" />
                          Mark Paid
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => openEditBillSheet(bill)}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Budget vs. Actual */}
      <Collapsible open={budgetOpen} onOpenChange={setBudgetOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Budget vs. Actual
            </span>
            {budgetOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Budget vs. Actual — {getMonthLabel(month)}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Compares template (budgeted) amounts against actual bills.
                Variable-amount templates show &quot;Variable&quot;; one-off bills show &quot;Unplanned&quot;.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill</TableHead>
                      <TableHead className="text-right">Budgeted</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {budgetRows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-sm">
                          {row.name}
                          {row.isUnplanned && (
                            <Badge variant="outline" className="ml-2 text-xs">Unplanned</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {row.isVariable ? (
                            <span className="text-muted-foreground italic">Variable</span>
                          ) : row.budgeted !== null ? (
                            formatMoney(row.budgeted)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatMoney(row.actual)}</TableCell>
                        <TableCell className="text-right text-sm">
                          {row.variance === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : row.variance === 0 ? (
                            <span className="text-muted-foreground">On budget</span>
                          ) : row.variance > 0 ? (
                            <span className="text-red-600">+{formatMoney(row.variance)} over</span>
                          ) : (
                            <span className="text-green-600">{formatMoney(row.variance)} under</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {/* Totals row */}
                  <TableBody>
                    <TableRow className="border-t-2 bg-muted/30 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{formatMoney(totalBudgeted)}</TableCell>
                      <TableCell className="text-right">{formatMoney(totalActual)}</TableCell>
                      <TableCell className="text-right">
                        {totalVariance === 0 ? (
                          <span className="text-muted-foreground">On budget</span>
                        ) : totalVariance > 0 ? (
                          <span className="text-red-600">+{formatMoney(totalVariance)} over</span>
                        ) : (
                          <span className="text-green-600">{formatMoney(totalVariance)} under</span>
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Add / Edit Bill Sheet */}
      <Sheet open={billSheetOpen} onOpenChange={setBillSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingBill ? 'Edit Bill' : 'Add Bill'}</SheetTitle>
            <SheetDescription>
              {editingBill ? `Editing bill for ${getMonthLabel(month)}` : `New one-off bill for ${getMonthLabel(month)}`}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="bill-name">Bill Name</Label>
              <Input
                id="bill-name"
                placeholder="e.g. Rent, Internet, Payroll"
                value={billForm.name}
                onChange={(e) => setBillForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-vendor">Vendor (optional)</Label>
              <Select
                value={billForm.vendor_id || 'none'}
                onValueChange={(v) => setBillForm((p) => ({ ...p, vendor_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger id="bill-vendor">
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No vendor</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-amount">Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="bill-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={billForm.amount}
                  onChange={(e) => setBillForm((p) => ({ ...p, amount: e.target.value }))}
                  className="pl-7"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-due">Due Date</Label>
              <Input
                id="bill-due"
                type="date"
                value={billForm.due_date}
                onChange={(e) => setBillForm((p) => ({ ...p, due_date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-status">Status</Label>
              <Select
                value={billForm.status}
                onValueChange={(v) => setBillForm((p) => ({ ...p, status: v as BillStatus }))}
              >
                <SelectTrigger id="bill-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILL_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-notes">Notes (optional)</Label>
              <Textarea
                id="bill-notes"
                placeholder="Any details about this bill..."
                value={billForm.notes}
                onChange={(e) => setBillForm((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSaveBill} disabled={billSaving}>
                {billSaving ? 'Saving...' : editingBill ? 'Save Changes' : 'Create Bill'}
              </Button>
              <Button variant="outline" onClick={() => setBillSheetOpen(false)} disabled={billSaving}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Mark Paid Sheet */}
      <Sheet open={paidSheetOpen} onOpenChange={setPaidSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Record Payment</SheetTitle>
            <SheetDescription>
              {payingBill && (
                <>
                  {payingBill.name} — {formatMoney(payingBill.amount)} due{' '}
                  {format(parseISO(payingBill.due_date), 'MMM d, yyyy')}
                </>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="paid-amount">Amount Paid</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="paid-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={paidForm.amount_paid}
                  onChange={(e) => setPaidForm((p) => ({ ...p, amount_paid: e.target.value }))}
                  className="pl-7"
                />
              </div>
              {payingBill && (
                <p className="text-xs text-muted-foreground">
                  Full amount: {formatMoney(payingBill.amount)}.
                  {payingBill.amount_paid > 0 && ` Previously paid: ${formatMoney(payingBill.amount_paid)}.`}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paid-date">Payment Date</Label>
              <Input
                id="paid-date"
                type="date"
                value={paidForm.paid_date}
                onChange={(e) => setPaidForm((p) => ({ ...p, paid_date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-method">Payment Method (optional)</Label>
              <Select
                value={paidForm.payment_method || 'none'}
                onValueChange={(v) => setPaidForm((p) => ({ ...p, payment_method: v === 'none' ? '' : v }))}
              >
                <SelectTrigger id="payment-method">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-ref">Reference / Check # (optional)</Label>
              <Input
                id="payment-ref"
                placeholder="e.g. Check #1234, ACH ref..."
                value={paidForm.payment_ref}
                onChange={(e) => setPaidForm((p) => ({ ...p, payment_ref: e.target.value }))}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleMarkPaid} disabled={paidSaving}>
                {paidSaving ? 'Recording...' : 'Record Payment'}
              </Button>
              <Button variant="outline" onClick={() => setPaidSheetOpen(false)} disabled={paidSaving}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Instantiate from Templates Dialog */}
      <AlertDialog open={instantiateDialogOpen} onOpenChange={setInstantiateDialogOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Instantiate Bills from Templates</AlertDialogTitle>
            <AlertDialogDescription>
              Creates bills for {getMonthLabel(month)} from all active bill templates. Already-existing bills are skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {instantiatePreviewLoading ? (
            <div className="py-4 text-center text-muted-foreground text-sm">Loading preview...</div>
          ) : instantiatePreview ? (
            <div className="space-y-4 py-2">
              {instantiatePreview.toCreate.length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                    Will create ({instantiatePreview.toCreate.length}):
                  </p>
                  <ul className="text-sm space-y-1">
                    {instantiatePreview.toCreate.map((t) => (
                      <li key={t.id} className="flex justify-between">
                        <span>{t.name}</span>
                        <span className="text-muted-foreground">
                          {t.is_amount_fixed && t.amount != null
                            ? formatMoney(t.amount)
                            : 'Variable'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">All templates already have bills for this month.</p>
              )}

              {instantiatePreview.toSkip.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Already exists — will skip ({instantiatePreview.toSkip.length}):
                  </p>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    {instantiatePreview.toSkip.map((t) => (
                      <li key={t.id}>{t.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={instantiating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleInstantiate}
              disabled={instantiating || (instantiatePreview?.toCreate.length === 0)}
            >
              {instantiating
                ? 'Creating...'
                : `Create ${instantiatePreview?.toCreate.length ?? 0} Bill${(instantiatePreview?.toCreate.length ?? 0) !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
