'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Trash2, Loader2, Package, Edit2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  getMaterials,
  getSkuMaterials,
  assignMaterialToSku,
  updateSkuMaterial,
  removeSkuMaterial,
  type Material,
  type SkuMaterialWithDetails,
} from '@/actions/materials'

interface SkuMaterialsProps {
  skuId: string
  skuName: string
  readOnly?: boolean
}

export function SkuMaterials({ skuId, skuName, readOnly = false }: SkuMaterialsProps) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [skuMaterials, setSkuMaterials] = useState<SkuMaterialWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Add form state
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [quantityPerUnit, setQuantityPerUnit] = useState<number | ''>(1)
  const [showAddForm, setShowAddForm] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQuantity, setEditQuantity] = useState<number | ''>(1)

  // Delete confirmation
  const [deletingMaterial, setDeletingMaterial] = useState<SkuMaterialWithDetails | null>(null)

  useEffect(() => {
    fetchData()
  }, [skuId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [materialsResult, skuMaterialsResult] = await Promise.all([
        getMaterials(),
        getSkuMaterials(skuId),
      ])

      if (materialsResult.success && materialsResult.data) {
        setMaterials(materialsResult.data)
      }

      if (skuMaterialsResult.success && skuMaterialsResult.data) {
        setSkuMaterials(skuMaterialsResult.data)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to load materials')
    } finally {
      setLoading(false)
    }
  }

  // Filter out already assigned materials
  const availableMaterials = materials.filter(
    (m) => !skuMaterials.some((sm) => sm.material_id === m.id)
  )

  const handleAdd = async () => {
    if (!selectedMaterialId) {
      toast.error('Please select a material')
      return
    }

    if (!quantityPerUnit || quantityPerUnit <= 0) {
      toast.error('Quantity must be greater than 0')
      return
    }

    setSaving(true)
    try {
      const result = await assignMaterialToSku(skuId, selectedMaterialId, quantityPerUnit)
      if (result.success) {
        toast.success('Material assigned')
        setSelectedMaterialId('')
        setQuantityPerUnit(1)
        setShowAddForm(false)
        fetchData()
      } else {
        toast.error(result.error || 'Failed to assign material')
      }
    } catch (error) {
      toast.error('Failed to assign material')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (materialId: string) => {
    if (!editQuantity || editQuantity <= 0) {
      toast.error('Quantity must be greater than 0')
      return
    }

    setSaving(true)
    try {
      const result = await updateSkuMaterial(skuId, materialId, editQuantity)
      if (result.success) {
        toast.success('Material updated')
        setEditingId(null)
        fetchData()
      } else {
        toast.error(result.error || 'Failed to update material')
      }
    } catch (error) {
      toast.error('Failed to update material')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingMaterial) return

    setSaving(true)
    try {
      const result = await removeSkuMaterial(skuId, deletingMaterial.material_id)
      if (result.success) {
        toast.success('Material removed')
        setDeletingMaterial(null)
        fetchData()
      } else {
        toast.error(result.error || 'Failed to remove material')
      }
    } catch (error) {
      toast.error('Failed to remove material')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (sm: SkuMaterialWithDetails) => {
    setEditingId(sm.material_id)
    setEditQuantity(sm.quantity_per_unit)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditQuantity(1)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {skuMaterials.length > 0 && (
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-sm font-medium mb-1">Materials per unit:</p>
          <p className="text-sm text-muted-foreground">
            {skuMaterials.map((sm, i) => (
              <span key={sm.material_id}>
                {i > 0 && ', '}
                {sm.quantity_per_unit}x {sm.material.name}
              </span>
            ))}
          </p>
        </div>
      )}

      {/* Materials List */}
      {skuMaterials.length === 0 ? (
        <div className="text-center py-6 border rounded-lg">
          <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">
            No materials assigned to this SKU
          </p>
          {!readOnly && availableMaterials.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Material
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden sm:block border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right w-[120px]">Qty/Unit</TableHead>
                  {!readOnly && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {skuMaterials.map((sm) => (
                  <TableRow key={sm.material_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{sm.material.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {sm.material.material_type}
                        </Badge>
                      </div>
                      {sm.material.sku_code && (
                        <p className="text-xs text-muted-foreground">
                          {sm.material.sku_code}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === sm.material_id ? (
                        <Input
                          type="number"
                          min="1"
                          value={editQuantity}
                          onChange={(e) =>
                            setEditQuantity(e.target.value ? parseInt(e.target.value) : '')
                          }
                          className="w-20 h-8 text-right ml-auto"
                          autoFocus
                        />
                      ) : (
                        <span className="font-semibold">{sm.quantity_per_unit}</span>
                      )}
                    </TableCell>
                    {!readOnly && (
                      <TableCell>
                        {editingId === sm.material_id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleUpdate(sm.material_id)}
                              disabled={saving}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={cancelEdit}
                              disabled={saving}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEdit(sm)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700"
                              onClick={() => setDeletingMaterial(sm)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="sm:hidden space-y-2">
            {skuMaterials.map((sm) => (
              <div
                key={sm.material_id}
                className="p-3 border rounded-lg flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{sm.material.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {sm.material.material_type}
                    </Badge>
                  </div>
                  {sm.material.sku_code && (
                    <p className="text-xs text-muted-foreground">
                      {sm.material.sku_code}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editingId === sm.material_id ? (
                    <>
                      <Input
                        type="number"
                        min="1"
                        value={editQuantity}
                        onChange={(e) =>
                          setEditQuantity(e.target.value ? parseInt(e.target.value) : '')
                        }
                        className="w-16 h-8 text-right"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleUpdate(sm.material_id)}
                        disabled={saving}
                      >
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-lg">
                        {sm.quantity_per_unit}x
                      </span>
                      {!readOnly && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => startEdit(sm)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600"
                            onClick={() => setDeletingMaterial(sm)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add Button */}
      {!readOnly && !showAddForm && availableMaterials.length > 0 && skuMaterials.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Material
        </Button>
      )}

      {/* Add Form */}
      {!readOnly && showAddForm && (
        <div className="p-4 border rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Add Material</Label>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setShowAddForm(false)
                setSelectedMaterialId('')
                setQuantityPerUnit(1)
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {availableMaterials.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All available materials have been assigned to this SKU.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="material">Material</Label>
                <Select
                  value={selectedMaterialId}
                  onValueChange={setSelectedMaterialId}
                  disabled={saving}
                >
                  <SelectTrigger id="material" className="min-h-[44px]">
                    <SelectValue placeholder="Select a material" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMaterials.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="min-h-[44px]">
                        <div className="flex items-center gap-2">
                          <span>{m.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {m.material_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            ({m.current_stock} in stock)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity per Unit</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantityPerUnit}
                  onChange={(e) =>
                    setQuantityPerUnit(e.target.value ? parseInt(e.target.value) : '')
                  }
                  disabled={saving}
                  className="min-h-[44px]"
                />
                <p className="text-xs text-muted-foreground">
                  How many of this material are needed per unit of {skuName}
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false)
                    setSelectedMaterialId('')
                    setQuantityPerUnit(1)
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAdd}
                  disabled={saving || !selectedMaterialId || !quantityPerUnit}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* No materials in system warning */}
      {materials.length === 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            No materials have been added to the system yet. Go to the Materials page to add materials first.
          </p>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingMaterial}
        onOpenChange={(open) => !open && setDeletingMaterial(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Material</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove &quot;{deletingMaterial?.material.name}&quot; from
              this SKU? This will not delete the material from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700"
            >
              {saving ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
