'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Plus, Pencil, Trash2, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import {
  getStrains,
  createStrain,
  updateStrain,
  deleteStrain,
  getBatches,
  createBatch,
  updateBatch,
  deleteBatch,
  toggleBatchActive,
  getProductTypes,
  createProductType,
  updateProductType,
  deleteProductType,
} from '@/actions/vault'
import type { Strain, Batch, ProductType } from '@/types/vault'

export default function VaultAdminPage() {
  const [activeTab, setActiveTab] = useState('strains')

  // Strains state
  const [strains, setStrains] = useState<Strain[]>([])
  const [strainsLoading, setStrainsLoading] = useState(true)
  const [strainDialogOpen, setStrainDialogOpen] = useState(false)
  const [editingStrain, setEditingStrain] = useState<Strain | null>(null)
  const [strainName, setStrainName] = useState('')
  const [strainSaving, setStrainSaving] = useState(false)
  const [strainError, setStrainError] = useState('')
  const [deleteStrainId, setDeleteStrainId] = useState<string | null>(null)
  const [strainDeleting, setStrainDeleting] = useState(false)

  // Batches state
  const [batches, setBatches] = useState<Batch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(true)
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null)
  const [batchName, setBatchName] = useState('')
  const [batchStrainId, setBatchStrainId] = useState('')
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchError, setBatchError] = useState('')
  const [deleteBatchId, setDeleteBatchId] = useState<string | null>(null)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [togglingBatchId, setTogglingBatchId] = useState<string | null>(null)

  // Product Types state
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [typesLoading, setTypesLoading] = useState(true)
  const [typeDialogOpen, setTypeDialogOpen] = useState(false)
  const [editingType, setEditingType] = useState<ProductType | null>(null)
  const [typeName, setTypeName] = useState('')
  const [typeSaving, setTypeSaving] = useState(false)
  const [typeError, setTypeError] = useState('')
  const [deleteTypeId, setDeleteTypeId] = useState<string | null>(null)
  const [typeDeleting, setTypeDeleting] = useState(false)

  // Load data
  useEffect(() => {
    loadStrains()
    loadBatches()
    loadProductTypes()
  }, [])

  async function loadStrains() {
    setStrainsLoading(true)
    const result = await getStrains()
    if (result.success && result.strains) {
      setStrains(result.strains)
    }
    setStrainsLoading(false)
  }

  async function loadBatches() {
    setBatchesLoading(true)
    const result = await getBatches()
    if (result.success && result.batches) {
      setBatches(result.batches)
    }
    setBatchesLoading(false)
  }

  async function loadProductTypes() {
    setTypesLoading(true)
    const result = await getProductTypes()
    if (result.success && result.productTypes) {
      setProductTypes(result.productTypes)
    }
    setTypesLoading(false)
  }

  // Strain handlers
  function openStrainDialog(strain?: Strain) {
    if (strain) {
      setEditingStrain(strain)
      setStrainName(strain.name)
    } else {
      setEditingStrain(null)
      setStrainName('')
    }
    setStrainError('')
    setStrainDialogOpen(true)
  }

  async function handleSaveStrain() {
    setStrainSaving(true)
    setStrainError('')

    let result
    if (editingStrain) {
      result = await updateStrain(editingStrain.id, strainName)
    } else {
      result = await createStrain(strainName)
    }

    if (result.success) {
      setStrainDialogOpen(false)
      loadStrains()
    } else {
      setStrainError(result.error || 'Failed to save strain')
    }
    setStrainSaving(false)
  }

  async function handleDeleteStrain() {
    if (!deleteStrainId) return
    setStrainDeleting(true)
    const result = await deleteStrain(deleteStrainId)
    if (result.success) {
      loadStrains()
    } else {
      alert(result.error || 'Failed to delete strain')
    }
    setDeleteStrainId(null)
    setStrainDeleting(false)
  }

  // Batch handlers
  function openBatchDialog(batch?: Batch) {
    if (batch) {
      setEditingBatch(batch)
      setBatchName(batch.name)
      setBatchStrainId(batch.strain_id)
    } else {
      setEditingBatch(null)
      setBatchName('')
      setBatchStrainId('')
    }
    setBatchError('')
    setBatchDialogOpen(true)
  }

  async function handleSaveBatch() {
    setBatchSaving(true)
    setBatchError('')

    let result
    if (editingBatch) {
      result = await updateBatch(editingBatch.id, batchName, batchStrainId)
    } else {
      result = await createBatch(batchName, batchStrainId)
    }

    if (result.success) {
      setBatchDialogOpen(false)
      loadBatches()
    } else {
      setBatchError(result.error || 'Failed to save batch')
    }
    setBatchSaving(false)
  }

  async function handleDeleteBatch() {
    if (!deleteBatchId) return
    setBatchDeleting(true)
    const result = await deleteBatch(deleteBatchId)
    if (result.success) {
      loadBatches()
    } else {
      alert(result.error || 'Failed to delete batch')
    }
    setDeleteBatchId(null)
    setBatchDeleting(false)
  }

  async function handleToggleBatchActive(batch: Batch) {
    setTogglingBatchId(batch.id)
    const result = await toggleBatchActive(batch.id, !batch.is_active)
    if (result.success) {
      loadBatches()
    } else {
      alert(result.error || 'Failed to toggle batch status')
    }
    setTogglingBatchId(null)
  }

  // Product Type handlers
  function openTypeDialog(type?: ProductType) {
    if (type) {
      setEditingType(type)
      setTypeName(type.name)
    } else {
      setEditingType(null)
      setTypeName('')
    }
    setTypeError('')
    setTypeDialogOpen(true)
  }

  async function handleSaveType() {
    setTypeSaving(true)
    setTypeError('')

    let result
    if (editingType) {
      result = await updateProductType(editingType.id, typeName)
    } else {
      result = await createProductType(typeName)
    }

    if (result.success) {
      setTypeDialogOpen(false)
      loadProductTypes()
    } else {
      setTypeError(result.error || 'Failed to save product type')
    }
    setTypeSaving(false)
  }

  async function handleDeleteType() {
    if (!deleteTypeId) return
    setTypeDeleting(true)
    const result = await deleteProductType(deleteTypeId)
    if (result.success) {
      loadProductTypes()
    } else {
      alert(result.error || 'Failed to delete product type')
    }
    setDeleteTypeId(null)
    setTypeDeleting(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vault Administration</h1>
        <p className="text-muted-foreground">
          Manage strains, batches, and product types
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="strains">Strains</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="types">Product Types</TabsTrigger>
        </TabsList>

        {/* Strains Tab */}
        <TabsContent value="strains" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle>Strains</CardTitle>
                <CardDescription>Manage cannabis strains in the system</CardDescription>
              </div>
              <Button onClick={() => openStrainDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Add Strain
              </Button>
            </CardHeader>
            <CardContent>
              {strainsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {strains.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          No strains found
                        </TableCell>
                      </TableRow>
                    ) : (
                      strains.map((strain) => (
                        <TableRow key={strain.id}>
                          <TableCell className="font-medium">{strain.name}</TableCell>
                          <TableCell>
                            {new Date(strain.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openStrainDialog(strain)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteStrainId(strain.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Batches Tab */}
        <TabsContent value="batches" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle>Batches</CardTitle>
                <CardDescription>Manage product batches and their associated strains</CardDescription>
              </div>
              <Button onClick={() => openBatchDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Add Batch
              </Button>
            </CardHeader>
            <CardContent>
              {batchesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Strain</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No batches found
                        </TableCell>
                      </TableRow>
                    ) : (
                      batches.map((batch) => (
                        <TableRow key={batch.id} className={!batch.is_active ? 'opacity-60' : ''}>
                          <TableCell className="font-medium">{batch.name}</TableCell>
                          <TableCell>{batch.strain?.name || '-'}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              batch.is_active
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                            }`}>
                              {batch.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </TableCell>
                          <TableCell>
                            {new Date(batch.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleToggleBatchActive(batch)}
                                disabled={togglingBatchId === batch.id}
                                title={batch.is_active ? 'Deactivate batch' : 'Activate batch'}
                              >
                                {togglingBatchId === batch.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : batch.is_active ? (
                                  <ToggleRight className="h-4 w-4 text-green-600" />
                                ) : (
                                  <ToggleLeft className="h-4 w-4 text-gray-400" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openBatchDialog(batch)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteBatchId(batch.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Product Types Tab */}
        <TabsContent value="types" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle>Product Types</CardTitle>
                <CardDescription>Manage product types (e.g., Flower, Concentrate)</CardDescription>
              </div>
              <Button onClick={() => openTypeDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Add Type
              </Button>
            </CardHeader>
            <CardContent>
              {typesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productTypes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          No product types found
                        </TableCell>
                      </TableRow>
                    ) : (
                      productTypes.map((type) => (
                        <TableRow key={type.id}>
                          <TableCell className="font-medium">{type.name}</TableCell>
                          <TableCell>
                            {new Date(type.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openTypeDialog(type)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteTypeId(type.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Strain Dialog */}
      <Dialog open={strainDialogOpen} onOpenChange={setStrainDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStrain ? 'Edit Strain' : 'Add Strain'}</DialogTitle>
            <DialogDescription>
              {editingStrain ? 'Update the strain name.' : 'Enter a name for the new strain.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="strainName">Name</Label>
              <Input
                id="strainName"
                value={strainName}
                onChange={(e) => setStrainName(e.target.value)}
                placeholder="e.g., Blue Dream"
              />
            </div>
            {strainError && (
              <p className="text-sm text-destructive">{strainError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStrainDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveStrain} disabled={strainSaving || !strainName.trim()}>
              {strainSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingStrain ? 'Save Changes' : 'Add Strain'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Strain Alert */}
      <AlertDialog open={!!deleteStrainId} onOpenChange={() => setDeleteStrainId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Strain?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Strains that are in use by packages cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStrain}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {strainDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBatch ? 'Edit Batch' : 'Add Batch'}</DialogTitle>
            <DialogDescription>
              {editingBatch ? 'Update the batch details.' : 'Enter details for the new batch.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="batchName">Name</Label>
              <Input
                id="batchName"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g., BD-2024-01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batchStrain">Strain</Label>
              <Select value={batchStrainId} onValueChange={setBatchStrainId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a strain" />
                </SelectTrigger>
                <SelectContent>
                  {strains.map((strain) => (
                    <SelectItem key={strain.id} value={strain.id}>
                      {strain.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {batchError && (
              <p className="text-sm text-destructive">{batchError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveBatch}
              disabled={batchSaving || !batchName.trim() || !batchStrainId}
            >
              {batchSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingBatch ? 'Save Changes' : 'Add Batch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Batch Alert */}
      <AlertDialog open={!!deleteBatchId} onOpenChange={() => setDeleteBatchId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Batches that are in use by packages cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBatch}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {batchDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Product Type Dialog */}
      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingType ? 'Edit Product Type' : 'Add Product Type'}</DialogTitle>
            <DialogDescription>
              {editingType ? 'Update the product type name.' : 'Enter a name for the new product type.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="typeName">Name</Label>
              <Input
                id="typeName"
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                placeholder="e.g., Flower"
              />
            </div>
            {typeError && (
              <p className="text-sm text-destructive">{typeError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveType} disabled={typeSaving || !typeName.trim()}>
              {typeSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingType ? 'Save Changes' : 'Add Type'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Product Type Alert */}
      <AlertDialog open={!!deleteTypeId} onOpenChange={() => setDeleteTypeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product Type?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Product types that are in use by packages cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteType}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {typeDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
