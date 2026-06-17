'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { createSku, checkSkuNameExists } from '@/actions/products'

export default function NewProductPage() {
  const [strainName, setStrainName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Check for duplicate names
      const nameCheck = await checkSkuNameExists(strainName.trim())
      if (nameCheck.error) {
        throw new Error('Unable to validate strain name. Please try again.')
      }
      if (nameCheck.exists) {
        throw new Error('A product with this strain name already exists. Please choose a different name.')
      }

      const result = await createSku({
        code: strainName.trim().toUpperCase().replace(/\s+/g, '-'),
        name: strainName.trim(),
        strain_id: '',
        product_type_id: '',
        units_per_case: 0,
        grams_per_unit: 0,
        status: 'active',
        description: description.trim() || null,
      })

      if ('error' in result && result.error) {
        throw new Error(result.error)
      }

      router.push('/dashboard/products')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
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
            Enter the strain details
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}

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
