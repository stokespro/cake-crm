'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  Package,
  Search,
  Plus,
  Minus,
  Scale,
  History,
  Loader2,
  Warehouse,
  ScanLine,
  Settings,
} from 'lucide-react'
import Link from 'next/link'
import {
  getAllPackages,
  getPackage,
  adjustWeight,
  createPackage,
  getRecentTransactions,
  getStrains,
  getProductTypes,
} from '@/actions/vault'
import type { VaultPackage, Transaction, Strain, ProductType } from '@/types/vault'

export default function VaultPage() {
  const { user } = useAuth()
  const [packages, setPackages] = useState<VaultPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Selected package state
  const [selectedPackage, setSelectedPackage] = useState<VaultPackage | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loadingPackage, setLoadingPackage] = useState(false)

  // Weight adjustment dialog
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [adjustType, setAdjustType] = useState<'add' | 'remove'>('remove')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  // New package dialog
  const [newPackageDialogOpen, setNewPackageDialogOpen] = useState(false)
  const [newTagId, setNewTagId] = useState('')
  const [newBatch, setNewBatch] = useState('')
  const [newStrainId, setNewStrainId] = useState('')
  const [newTypeId, setNewTypeId] = useState('')
  const [newWeight, setNewWeight] = useState('')
  const [creating, setCreating] = useState(false)
  const [strains, setStrains] = useState<Strain[]>([])
  const [productTypes, setProductTypes] = useState<ProductType[]>([])

  // Lookup by tag
  const [lookupTag, setLookupTag] = useState('')

  const canManagePackages = user?.role === 'admin' || user?.role === 'management' || user?.role === 'vault'
  const canAccessAdmin = user?.role === 'admin' || user?.role === 'management'

  useEffect(() => {
    fetchPackages()
    fetchFormData()
  }, [])

  const fetchPackages = async () => {
    setLoading(true)
    const result = await getAllPackages()
    if (result.success && result.packages) {
      setPackages(result.packages)
    } else {
      toast.error(result.error || 'Failed to load packages')
    }
    setLoading(false)
  }

  const fetchFormData = async () => {
    const [strainsResult, typesResult] = await Promise.all([
      getStrains(),
      getProductTypes(),
    ])

    if (strainsResult.success && strainsResult.strains) {
      setStrains(strainsResult.strains)
    }
    if (typesResult.success && typesResult.productTypes) {
      setProductTypes(typesResult.productTypes)
    }
  }

  const handleLookupTag = async () => {
    if (!lookupTag.trim()) return

    setLoadingPackage(true)
    const result = await getPackage(lookupTag.trim())

    if (result.success) {
      if (result.package) {
        setSelectedPackage(result.package)
        const txResult = await getRecentTransactions(result.package.tag_id)
        if (txResult.success && txResult.transactions) {
          setTransactions(txResult.transactions)
        }
      } else {
        toast.error('Package not found')
        if (canManagePackages) {
          setNewTagId(lookupTag.trim())
          setNewPackageDialogOpen(true)
        }
      }
    } else {
      toast.error(result.error || 'Failed to lookup package')
    }

    setLoadingPackage(false)
    setLookupTag('')
  }

  const handleSelectPackage = async (pkg: VaultPackage) => {
    setSelectedPackage(pkg)
    const result = await getRecentTransactions(pkg.tag_id)
    if (result.success && result.transactions) {
      setTransactions(result.transactions)
    }
  }

  const handleAdjustWeight = async () => {
    if (!selectedPackage || !user) return

    const amount = parseFloat(adjustAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    setAdjusting(true)
    const result = await adjustWeight(selectedPackage.tag_id, amount, adjustType, user.id)

    if (result.success && result.package) {
      setSelectedPackage(result.package)
      toast.success(`${adjustType === 'add' ? 'Added' : 'Removed'} ${amount}g`)
      setAdjustDialogOpen(false)
      setAdjustAmount('')

      // Refresh transactions
      const txResult = await getRecentTransactions(selectedPackage.tag_id)
      if (txResult.success && txResult.transactions) {
        setTransactions(txResult.transactions)
      }

      // Refresh packages list
      fetchPackages()
    } else {
      toast.error(result.error || 'Failed to adjust weight')
    }

    setAdjusting(false)
  }

  const handleCreatePackage = async () => {
    if (!user) return

    const weight = parseFloat(newWeight)
    if (isNaN(weight) || weight < 0) {
      toast.error('Please enter a valid weight')
      return
    }

    const strain = strains.find(s => s.id === newStrainId)
    if (!strain) {
      toast.error('Please select a strain')
      return
    }

    setCreating(true)
    const result = await createPackage(
      newTagId,
      newBatch,
      strain.name,
      newStrainId,
      newTypeId,
      weight,
      user.id
    )

    if (result.success && result.package) {
      toast.success('Package created successfully')
      setNewPackageDialogOpen(false)
      setSelectedPackage(result.package)
      resetNewPackageForm()
      fetchPackages()
    } else {
      toast.error(result.error || 'Failed to create package')
    }

    setCreating(false)
  }

  const resetNewPackageForm = () => {
    setNewTagId('')
    setNewBatch('')
    setNewStrainId('')
    setNewTypeId('')
    setNewWeight('')
  }

  // Filter packages by search
  const filteredPackages = packages.filter(pkg =>
    pkg.tag_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pkg.strain.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pkg.batch.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Group packages by strain for summary
  const strainSummary = packages.reduce((acc, pkg) => {
    const strain = pkg.strain
    if (!acc[strain]) {
      acc[strain] = { count: 0, weight: 0 }
    }
    acc[strain].count++
    acc[strain].weight += pkg.current_weight
    return acc
  }, {} as Record<string, { count: number; weight: number }>)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Vault Inventory</h1>
          <p className="text-muted-foreground mt-1">Manage bulk cannabis packages</p>
        </div>
        <div className="flex gap-2">
          {canAccessAdmin && (
            <Button variant="outline" asChild>
              <Link href="/dashboard/vault/admin">
                <Settings className="mr-2 h-4 w-4" />
                Admin
              </Link>
            </Button>
          )}
          {canManagePackages && (
            <Button onClick={() => setNewPackageDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Package
            </Button>
          )}
        </div>
      </div>

      {/* Tag Lookup */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ScanLine className="h-4 w-4" />
            Tag Lookup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter or scan tag ID..."
              value={lookupTag}
              onChange={(e) => setLookupTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookupTag()}
              className="flex-1"
            />
            <Button onClick={handleLookupTag} disabled={loadingPackage}>
              {loadingPackage ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Summary Cards */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Packages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{packages.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Weight</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {packages.reduce((sum, p) => sum + p.current_weight, 0).toFixed(2)}g
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Strains</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(strainSummary).length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Packages Table */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Warehouse className="h-5 w-5" />
              Packages
            </CardTitle>
            <CardDescription>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search packages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tag ID</TableHead>
                    <TableHead>Strain</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPackages.map((pkg) => (
                    <TableRow
                      key={pkg.tag_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSelectPackage(pkg)}
                    >
                      <TableCell className="font-mono text-xs">{pkg.tag_id}</TableCell>
                      <TableCell>{pkg.strain}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{pkg.type?.name || '-'}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {pkg.current_weight.toFixed(2)}g
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredPackages.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No packages found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Selected Package Details */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Package Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedPackage ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Tag ID</Label>
                    <p className="font-mono text-sm">{selectedPackage.tag_id}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Batch</Label>
                    <p className="font-medium">{selectedPackage.batch}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Strain</Label>
                    <p className="font-medium">{selectedPackage.strain}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Type</Label>
                    <p className="font-medium">{selectedPackage.type?.name || '-'}</p>
                  </div>
                </div>

                <Separator />

                <div className="text-center">
                  <Label className="text-muted-foreground">Current Weight</Label>
                  <p className="text-3xl font-bold">{selectedPackage.current_weight.toFixed(2)}g</p>
                </div>

                {canManagePackages && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setAdjustType('add')
                        setAdjustDialogOpen(true)
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setAdjustType('remove')
                        setAdjustDialogOpen(true)
                      }}
                    >
                      <Minus className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                )}

                <Separator />

                {/* Recent Transactions */}
                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <History className="h-4 w-4" />
                    Recent Transactions
                  </Label>
                  <div className="space-y-2 max-h-[200px] overflow-auto">
                    {transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between text-sm p-2 rounded bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          {tx.type === 'add' ? (
                            <Plus className="h-3 w-3 text-green-600" />
                          ) : (
                            <Minus className="h-3 w-3 text-red-600" />
                          )}
                          <span className={tx.type === 'add' ? 'text-green-600' : 'text-red-600'}>
                            {tx.type === 'add' ? '+' : '-'}{tx.amount}g
                          </span>
                          <span className="text-muted-foreground">by {tx.user?.name || 'Unknown'}</span>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                    {transactions.length === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-4">
                        No transactions yet
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a package or scan a tag to view details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Weight Adjustment Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustType === 'add' ? 'Add Weight' : 'Remove Weight'}
            </DialogTitle>
            <DialogDescription>
              {adjustType === 'add'
                ? 'Add weight to this package'
                : 'Remove weight from this package'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Amount (grams)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Enter amount..."
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
            </div>

            {selectedPackage && (
              <p className="text-sm text-muted-foreground">
                Current weight: {selectedPackage.current_weight.toFixed(2)}g
                {adjustAmount && !isNaN(parseFloat(adjustAmount)) && (
                  <>
                    {' → '}
                    <span className="font-medium">
                      {adjustType === 'add'
                        ? (selectedPackage.current_weight + parseFloat(adjustAmount)).toFixed(2)
                        : (selectedPackage.current_weight - parseFloat(adjustAmount)).toFixed(2)}g
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdjustWeight}
              disabled={adjusting || !adjustAmount}
              variant={adjustType === 'add' ? 'default' : 'destructive'}
            >
              {adjusting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {adjustType === 'add' ? 'Add' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Package Dialog */}
      <Dialog open={newPackageDialogOpen} onOpenChange={setNewPackageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Package</DialogTitle>
            <DialogDescription>
              Add a new package to the vault inventory
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Tag ID</Label>
              <Input
                placeholder="Enter tag ID..."
                value={newTagId}
                onChange={(e) => setNewTagId(e.target.value)}
              />
            </div>

            <div>
              <Label>Batch</Label>
              <Input
                placeholder="Enter batch name..."
                value={newBatch}
                onChange={(e) => setNewBatch(e.target.value)}
              />
            </div>

            <div>
              <Label>Strain</Label>
              <Select value={newStrainId} onValueChange={setNewStrainId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select strain..." />
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

            <div>
              <Label>Type</Label>
              <Select value={newTypeId} onValueChange={setNewTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {productTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Starting Weight (grams)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Enter weight..."
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPackageDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreatePackage}
              disabled={creating || !newTagId || !newBatch || !newStrainId || !newTypeId || !newWeight}
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
