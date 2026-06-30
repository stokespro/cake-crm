'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import {
  createBillTemplate,
  updateBillTemplate,
  deactivateBillTemplate,
  getTemplatesWithVendors,
  getVendors,
} from '@/actions/finance'
import type { BillTemplate, Vendor } from '@/actions/finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { FileText, MoreVertical, Plus, Edit2, Loader2, PowerOff } from 'lucide-react'
import { VendorCombobox } from '@/components/finance/vendor-combobox'

const TEMPLATE_CATEGORIES = [
  'utilities',
  'rent',
  'payroll',
  'supplies',
  'equipment',
  'insurance',
  'other',
] as const

const RECURRENCE_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
  { value: 'weekly', label: 'Weekly' },
] as const

interface TemplateFormState {
  name: string
  vendor_id: string
  amount: string
  is_amount_fixed: boolean
  due_day_of_month: string
  recurrence: string
  category: string
  notes: string
  is_active: boolean
}

const blankForm: TemplateFormState = {
  name: '',
  vendor_id: '',
  amount: '',
  is_amount_fixed: true,
  due_day_of_month: '',
  recurrence: 'monthly',
  category: '',
  notes: '',
  is_active: true,
}

function formatAmount(template: BillTemplate): string {
  if (!template.is_amount_fixed) return 'Variable'
  if (template.amount == null) return '—'
  return `$${Number(template.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function recurrenceLabel(recurrence: string): string {
  return RECURRENCE_OPTIONS.find((r) => r.value === recurrence)?.label ?? recurrence
}

export default function BillTemplatesPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()

  const [templates, setTemplates] = useState<BillTemplate[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<BillTemplate | null>(null)
  const [form, setForm] = useState<TemplateFormState>(blankForm)
  const [saving, setSaving] = useState(false)
  const [deactivating, setDeactivating] = useState<string | null>(null)

  const userRole = user?.role || 'standard'
  const canManage = userRole === 'admin' || userRole === 'management'

  // Redirect non-admin/management users
  useEffect(() => {
    if (!authLoading && user && !canManage) {
      router.push('/dashboard')
    }
  }, [user, authLoading, canManage, router])

  const fetchData = useCallback(async () => {
    try {
      const [templatesRes, vendorsRes] = await Promise.all([
        getTemplatesWithVendors(),
        getVendors(true),
      ])

      if (!templatesRes.success || !templatesRes.data) throw new Error(templatesRes.error ?? 'Failed to load templates')
      if (!vendorsRes.success || !vendorsRes.data) throw new Error(vendorsRes.error ?? 'Failed to load vendors')

      setTemplates(templatesRes.data)
      setVendors(vendorsRes.data)
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canManage) {
      fetchData()
    }
  }, [canManage, fetchData])

  const openAdd = () => {
    setEditingTemplate(null)
    setForm(blankForm)
    setSheetOpen(true)
  }

  const openEdit = (template: BillTemplate) => {
    setEditingTemplate(template)
    setForm({
      name: template.name,
      vendor_id: template.vendor_id || '',
      amount: template.amount != null ? String(template.amount) : '',
      is_amount_fixed: template.is_amount_fixed,
      due_day_of_month: template.due_day_of_month != null ? String(template.due_day_of_month) : '',
      recurrence: template.recurrence || 'monthly',
      category: template.category || '',
      notes: template.notes || '',
      is_active: template.is_active,
    })
    setSheetOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Template name is required')
      return
    }

    const amountValue =
      form.is_amount_fixed && form.amount.trim()
        ? parseFloat(form.amount)
        : undefined

    const dueDayValue =
      form.due_day_of_month.trim()
        ? parseInt(form.due_day_of_month, 10)
        : undefined

    // Validate due day range
    if (dueDayValue !== undefined && (dueDayValue < 1 || dueDayValue > 31)) {
      toast.error('Due day must be between 1 and 31')
      return
    }

    setSaving(true)
    try {
      let result
      if (editingTemplate) {
        result = await updateBillTemplate(editingTemplate.id, {
          name: form.name,
          vendor_id: form.vendor_id || null,
          amount: form.is_amount_fixed ? (amountValue ?? null) : null,
          is_amount_fixed: form.is_amount_fixed,
          due_day_of_month: dueDayValue ?? null,
          recurrence: form.recurrence,
          category: form.category || null,
          notes: form.notes || null,
          is_active: form.is_active,
        })
      } else {
        result = await createBillTemplate({
          name: form.name,
          vendor_id: form.vendor_id || undefined,
          amount: amountValue,
          is_amount_fixed: form.is_amount_fixed,
          due_day_of_month: dueDayValue,
          recurrence: form.recurrence,
          category: form.category || undefined,
          notes: form.notes || undefined,
        })
      }

      if (!result.success) throw new Error(result.error || 'Unknown error')

      toast.success(editingTemplate ? 'Template updated' : 'Template created')
      setSheetOpen(false)
      fetchData()
    } catch (error) {
      console.error('Error saving template:', error)
      toast.error(editingTemplate ? 'Failed to update template' : 'Failed to create template')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (template: BillTemplate) => {
    setDeactivating(template.id)
    try {
      const result = await deactivateBillTemplate(template.id)
      if (!result.success) throw new Error(result.error || 'Unknown error')
      toast.success('Template deactivated')
      fetchData()
    } catch (error) {
      console.error('Error deactivating template:', error)
      toast.error('Failed to deactivate template')
    } finally {
      setDeactivating(null)
    }
  }

  const handleToggleActive = async (template: BillTemplate) => {
    if (!template.is_active) {
      // Re-activate via updateBillTemplate
      setDeactivating(template.id)
      try {
        const result = await updateBillTemplate(template.id, { is_active: true })
        if (!result.success) throw new Error(result.error || 'Unknown error')
        toast.success('Template reactivated')
        fetchData()
      } catch (error) {
        console.error('Error reactivating template:', error)
        toast.error('Failed to reactivate template')
      } finally {
        setDeactivating(null)
      }
    } else {
      await handleDeactivate(template)
    }
  }

  const updateForm = (patch: Partial<TemplateFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!canManage) {
    return null
  }

  const activeTemplates = templates.filter((t) => t.is_active)
  const inactiveTemplates = templates.filter((t) => !t.is_active)

  // Build a vendor lookup for fast name resolution
  const vendorMap = new Map(vendors.map((v) => [v.id, v.name]))
  // Include vendors from templates that may now be inactive
  for (const t of templates) {
    if (t.vendor && !vendorMap.has(t.vendor.id)) {
      vendorMap.set(t.vendor.id, t.vendor.name)
    }
  }

  const getVendorName = (template: BillTemplate): string => {
    if (template.vendor?.name) return template.vendor.name
    if (template.vendor_id) return vendorMap.get(template.vendor_id) || '—'
    return '—'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Bill Templates</h1>
          <p className="text-muted-foreground mt-1">
            Recurring bill templates — {activeTemplates.length} active
            {inactiveTemplates.length > 0 && `, ${inactiveTemplates.length} inactive`}
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Template
        </Button>
      </div>

      {/* Templates table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Templates ({templates.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {templates.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">No templates created yet</p>
              <Button onClick={openAdd}>
                <Plus className="mr-2 h-4 w-4" />
                Add First Template
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Due Day</TableHead>
                      <TableHead>Recurrence</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[60px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => (
                      <TableRow key={template.id} className={!template.is_active ? 'opacity-60' : ''}>
                        <TableCell className="font-medium">{template.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {getVendorName(template)}
                        </TableCell>
                        <TableCell>
                          {template.category ? (
                            <Badge variant="outline" className="capitalize">
                              {template.category}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatAmount(template)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {template.due_day_of_month != null ? `Day ${template.due_day_of_month}` : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {recurrenceLabel(template.recurrence)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {template.is_active ? (
                            <Badge variant="default" className="bg-green-600">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={deactivating === template.id}
                              >
                                {deactivating === template.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreVertical className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(template)}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleToggleActive(template)}
                                className={template.is_active ? 'text-destructive focus:text-destructive' : ''}
                              >
                                <PowerOff className="h-4 w-4 mr-2" />
                                {template.is_active ? 'Deactivate' : 'Reactivate'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card stack */}
              <div className="sm:hidden space-y-3 p-4">
                {templates.map((template) => (
                  <Card key={template.id} className={!template.is_active ? 'opacity-60' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{template.name}</p>
                            {template.is_active ? (
                              <Badge variant="default" className="bg-green-600 text-xs">Active</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Inactive</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
                            <span>{getVendorName(template)}</span>
                            {template.category && (
                              <>
                                <span>·</span>
                                <span className="capitalize">{template.category}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-sm">
                            <span className="font-medium">{formatAmount(template)}</span>
                            <span className="text-muted-foreground">·</span>
                            <Badge variant="secondary" className="capitalize text-xs">
                              {recurrenceLabel(template.recurrence)}
                            </Badge>
                            {template.due_day_of_month != null && (
                              <>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-muted-foreground text-xs">Day {template.due_day_of_month}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              disabled={deactivating === template.id}
                            >
                              {deactivating === template.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreVertical className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(template)}>
                              <Edit2 className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleToggleActive(template)}
                              className={template.is_active ? 'text-destructive focus:text-destructive' : ''}
                            >
                              <PowerOff className="h-4 w-4 mr-2" />
                              {template.is_active ? 'Deactivate' : 'Reactivate'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingTemplate ? 'Edit Template' : 'Add Bill Template'}</SheetTitle>
            <SheetDescription>
              {editingTemplate
                ? 'Update this recurring bill template.'
                : 'Create a recurring bill template. Bills are instantiated from templates each month.'}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-5 pt-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="tmpl-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tmpl-name"
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder="e.g. Electric Bill, Rent, Payroll"
                disabled={saving}
              />
            </div>

            {/* Vendor */}
            <div className="space-y-2">
              <Label>Vendor</Label>
              <VendorCombobox
                vendors={vendors}
                value={form.vendor_id}
                onChange={(vendorId) => updateForm({ vendor_id: vendorId })}
                disabled={saving}
                placeholder="No vendor"
              />
            </div>

            {/* Fixed amount toggle */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="tmpl-fixed" className="text-base">Fixed Amount</Label>
                <p className="text-sm text-muted-foreground">
                  Toggle off for bills where the amount varies each period.
                </p>
              </div>
              <Switch
                id="tmpl-fixed"
                checked={form.is_amount_fixed}
                onCheckedChange={(checked) =>
                  updateForm({ is_amount_fixed: checked, amount: checked ? form.amount : '' })
                }
                disabled={saving}
              />
            </div>

            {/* Amount — only when fixed */}
            {form.is_amount_fixed && (
              <div className="space-y-2">
                <Label htmlFor="tmpl-amount">Amount ($)</Label>
                <Input
                  id="tmpl-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => updateForm({ amount: e.target.value })}
                  placeholder="0.00"
                  disabled={saving}
                />
              </div>
            )}

            {/* Recurrence */}
            <div className="space-y-2">
              <Label htmlFor="tmpl-recurrence">Recurrence</Label>
              <Select
                value={form.recurrence}
                onValueChange={(v) => updateForm({ recurrence: v })}
                disabled={saving}
              >
                <SelectTrigger id="tmpl-recurrence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Due day of month */}
            <div className="space-y-2">
              <Label htmlFor="tmpl-due-day">Due Day of Month (1–31)</Label>
              <Input
                id="tmpl-due-day"
                type="number"
                min="1"
                max="31"
                value={form.due_day_of_month}
                onChange={(e) => updateForm({ due_day_of_month: e.target.value })}
                placeholder="e.g. 15"
                disabled={saving}
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="tmpl-category">Category</Label>
              <Select
                value={form.category || '_none'}
                onValueChange={(v) => updateForm({ category: v === '_none' ? '' : v })}
                disabled={saving}
              >
                <SelectTrigger id="tmpl-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {TEMPLATE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="capitalize">
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="tmpl-notes">Notes</Label>
              <Textarea
                id="tmpl-notes"
                value={form.notes}
                onChange={(e) => updateForm({ notes: e.target.value })}
                placeholder="Any notes about this recurring bill..."
                rows={3}
                disabled={saving}
              />
            </div>

            {/* Active toggle — only on edit */}
            {editingTemplate && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="tmpl-active" className="text-base">Active</Label>
                  <p className="text-sm text-muted-foreground">
                    Inactive templates are skipped during bill instantiation.
                  </p>
                </div>
                <Switch
                  id="tmpl-active"
                  checked={form.is_active}
                  onCheckedChange={(checked) => updateForm({ is_active: checked })}
                  disabled={saving}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingTemplate ? 'Saving...' : 'Creating...'}
                  </>
                ) : (
                  editingTemplate ? 'Save Changes' : 'Create Template'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
