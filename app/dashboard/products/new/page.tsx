'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function NewProductPage() {
  const [strainName, setStrainName] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('')
  const [description, setDescription] = useState('')
  const [thcPercentage, setThcPercentage] = useState('')
  const [cbdPercentage, setCbdPercentage] = useState('')
  const [category, setCategory] = useState('')
  const [inStock, setInStock] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('agent')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkUserPermissions()
  }, [])

  const checkUserPermissions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (data) {
        setUserRole(data.role)
        if (data.role !== 'management' && data.role !== 'admin') {
          router.push('/dashboard/products')
        }
      }
    } catch (error) {
      console.error('Error checking permissions:', error)
      router.push('/dashboard/products')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('products')
        .insert({
          strain_name: strainName,
          price_per_unit: parseFloat(pricePerUnit),
          description: description || null,
          thc_percentage: thcPercentage ? parseFloat(thcPercentage) : null,
          cbd_percentage: cbdPercentage ? parseFloat(cbdPercentage) : null,
          category: category || null,
          in_stock: inStock
        })

      if (error) throw error

      router.push('/dashboard/products')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (userRole !== 'management' && userRole !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Checking permissions...</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/products">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Add Product</h1>
          <p className="text-muted-foreground mt-1">Add a new cannabis strain to catalog</p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Product Information</CardTitle>
          <CardDescription>
            Enter the strain details and pricing information
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="strainName">Strain Name *</Label>
                <Input
                  id="strainName"
                  placeholder="Blue Dream"
                  value={strainName}
                  onChange={(e) => setStrainName(e.target.value)}
                  required
                  disabled={loading}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pricePerUnit">Price per Unit ($) *</Label>
                <Input
                  id="pricePerUnit"
                  type="number"
                  step="0.01"
                  placeholder="25.00"
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
                  required
                  disabled={loading}
                  className="h-12"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="thcPercentage">THC %</Label>
                <Input
                  id="thcPercentage"
                  type="number"
                  step="0.1"
                  placeholder="22.5"
                  value={thcPercentage}
                  onChange={(e) => setThcPercentage(e.target.value)}
                  disabled={loading}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cbdPercentage">CBD %</Label>
                <Input
                  id="cbdPercentage"
                  type="number"
                  step="0.1"
                  placeholder="0.5"
                  value={cbdPercentage}
                  onChange={(e) => setCbdPercentage(e.target.value)}
                  disabled={loading}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  placeholder="Hybrid, Indica, Sativa"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={loading}
                  className="h-12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the strain effects, flavor profile, etc..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={loading}
                className="resize-none"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="inStock"
                checked={inStock}
                onChange={(e) => setInStock(e.target.checked)}
                disabled={loading}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label 
                htmlFor="inStock" 
                className="text-sm font-normal cursor-pointer"
              >
                Product is currently in stock
              </Label>
            </div>
          </CardContent>

          <div className="flex gap-3 p-6 pt-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Product'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}