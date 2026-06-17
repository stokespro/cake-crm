'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { createVendor, updateVendor, getVendors } from '@/actions/finance'
import type { Vendor } from '@/actions/finance'
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
import { Building, MoreVertical, Plus, Edit2, Loader2 } from 'lucide-react'

const VENDOR_CATEGORIES = [
  'utilities',
  'rent',
  'payroll',
  'supplies',
  'equipment',
  'insurance',
  'other',
] as const

interface VendorFormState {
  name: string
  category: string
  contact_info: string
  notes: string
  is_active: boolean
}

const blankForm: VendorFormState = {
  name: '',
  category: '',
  contact_info: '',
  notes: '',
  is_active: true,
}

export default function VendorsPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()

  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [form, setForm] = useState<VendorFormState>(blankForm)
  const [saving, setSaving] = useState(false)

  const userRole = user?.role || 'standard'
  const canManage = userRole === 'admin' || userRole === 'management'

  // Redirect non-admin/management users
  useEffect(() => {
    if (!authLoading && user && !canManage) {
      router.push('/dashboard')
    }
  }, [user, authLoading, canManage, router])

  const fetchVendors = useCallback(async () => {
    try {
      const result = await getVendors()
      if (!result.success || !result.data) throw new Error(result.error ?? 'Failed to load vendors')
      setVendors(result.data)
    } catch (error) {
      console.error('Error fetching vendors:', error)
      toast.error('Failed to load vendors')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canManage) {
      fetchVendors()
    }
  }, [canManage, fetchVendors])

  const openAdd = () => {
    setEditingVendor(null)
    setForm(blankForm)
    setSheetOpen(true)
  }

  const openEdit = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setForm({
      name: vendor.name,
      category: vendor.category || '',
      contact_info: vendor.contact_info || '',
      notes: vendor.notes || '',
      is_active: vendor.is_active,
    })
    setSheetOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Vendor name is required')
      return
    }

    setSaving(true)
    try {
      let result
      if (editingVendor) {
        result = await updateVendor(editingVendor.id, {
          name: form.name,
          category: form.category || null,
          contact_info: form.contact_info || null,
          notes: form.notes || null,
          is_active: form.is_active,
        })
      } else {
        result = await createVendor({
          name: form.name,
          category: form.category || undefined,
          contact_info: form.contact_info || undefined,
          notes: form.notes || undefined,
        })
      }

      if (!result.success) throw new Error(result.error || 'Unknown error')

      toast.success(editingVendor ? 'Vendor updated' : 'Vendor created')
      setSheetOpen(false)
      fetchVendors()
    } catch (error) {
      console.error('Error saving vendor:', error)
      toast.error(editingVendor ? 'Failed to update vendor' : 'Failed to create vendor')
    } finally {
      setSaving(false)
    }
  }

  const updateForm = (patch: Partial<VendorFormState>) => {
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

  const activeVendors = vendors.filter((v) => v.is_active)
  const inactiveVendors = vendors.filter((v) => !v.is_active)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Vendors</h1>
          <p className="text-muted-foreground mt-1">
            Manage bill vendors — {activeVendors.length} active
            {inactiveVendors.length > 0 && `, ${inactiveVendors.length} inactive`}
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Vendor
        </Button>
      </div>

      {/* Vendors table — desktop */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building className="h-5 w-5" />
            Vendors ({vendors.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {vendors.length === 0 ? (
            <div className="text-center py-12">
              <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">No vendors added yet</p>
              <Button onClick={openAdd}>
                <Plus className="mr-2 h-4 w-4" />
                Add First Vendor
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
                      <TableHead>Category</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[60px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors.map((vendor) => (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">{vendor.name}</TableCell>
                        <TableCell>
                          {vendor.category ? (
                            <Badge variant="outline" className="capitalize">
                              {vendor.category}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {vendor.contact_info || '—'}
                        </TableCell>
                        <TableCell>
                          {vendor.is_active ? (
                            <Badge variant="default" className="bg-green-600">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(vendor)}>
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

              {/* Mobile card stack */}
              <div className="sm:hidden space-y-3 p-4">
                {vendors.map((vendor) => (
                  <Card key={vendor.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{vendor.name}</p>
                            {vendor.is_active ? (
                              <Badge variant="default" className="bg-green-600 text-xs">Active</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Inactive</Badge>
                            )}
                            {vendor.category && (
                              <Badge variant="outline" className="capitalize text-xs">
                                {vendor.category}
                              </Badge>
                            )}
                          </div>
                          {vendor.contact_info && (
                            <p className="text-sm text-muted-foreground mt-1 truncate">
                              {vendor.contact_info}
                            </p>
                          )}
                          {vendor.notes && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {vendor.notes}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => openEdit(vendor)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
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
            <SheetTitle>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</SheetTitle>
            <SheetDescription>
              {editingVendor
                ? 'Update vendor details below.'
                : 'Fill in the details to create a new vendor.'}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-5 pt-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="vendor-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vendor-name"
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder="e.g. OG&E, PSO, ABC Supplies"
                disabled={saving}
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="vendor-category">Category</Label>
              <Select
                value={form.category || '_none'}
                onValueChange={(v) => updateForm({ category: v === '_none' ? '' : v })}
                disabled={saving}
              >
                <SelectTrigger id="vendor-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {VENDOR_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="capitalize">
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Contact Info */}
            <div className="space-y-2">
              <Label htmlFor="vendor-contact">Contact Info</Label>
              <Input
                id="vendor-contact"
                value={form.contact_info}
                onChange={(e) => updateForm({ contact_info: e.target.value })}
                placeholder="Phone, email, or account number"
                disabled={saving}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="vendor-notes">Notes</Label>
              <Textarea
                id="vendor-notes"
                value={form.notes}
                onChange={(e) => updateForm({ notes: e.target.value })}
                placeholder="Any additional notes about this vendor..."
                rows={3}
                disabled={saving}
              />
            </div>

            {/* Active toggle — only show on edit */}
            {editingVendor && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="vendor-active" className="text-base">Active</Label>
                  <p className="text-sm text-muted-foreground">
                    Inactive vendors are hidden from bill template selection.
                  </p>
                </div>
                <Switch
                  id="vendor-active"
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
                    {editingVendor ? 'Saving...' : 'Creating...'}
                  </>
                ) : (
                  editingVendor ? 'Save Changes' : 'Create Vendor'
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
