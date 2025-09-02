'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function NewDispensaryPage() {
  const [businessName, setBusinessName] = useState('')
  const [address, setAddress] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [ommaLicense, setOmmaLicense] = useState('')
  const [obLicense, setObLicense] = useState('')
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
          router.push('/dashboard/dispensaries')
        }
      }
    } catch (error) {
      console.error('Error checking permissions:', error)
      router.push('/dashboard/dispensaries')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('dispensary_profiles')
        .insert({
          business_name: businessName,
          address: address || null,
          phone_number: phoneNumber || null,
          email: email || null,
          omma_license: ommaLicense || null,
          ob_license: obLicense || null
        })

      if (error) throw error

      router.push('/dashboard/dispensaries')
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
          <Link href="/dashboard/dispensaries">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Add Dispensary</h1>
          <p className="text-muted-foreground mt-1">Create a new dispensary profile</p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Dispensary Information</CardTitle>
          <CardDescription>
            Enter the dispensary details. Only the business name is required.
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
              <Label htmlFor="businessName">Business Name *</Label>
              <Input
                id="businessName"
                placeholder="Green Valley Dispensary"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                disabled={loading}
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                placeholder="123 Main St, City, State 12345"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={loading}
                className="h-12"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={loading}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="contact@dispensary.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="h-12"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ommaLicense">OMMA License</Label>
                <Input
                  id="ommaLicense"
                  placeholder="OMMA-XXXX-XXXX"
                  value={ommaLicense}
                  onChange={(e) => setOmmaLicense(e.target.value)}
                  disabled={loading}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="obLicense">OB License</Label>
                <Input
                  id="obLicense"
                  placeholder="OB-XXXX-XXXX"
                  value={obLicense}
                  onChange={(e) => setObLicense(e.target.value)}
                  disabled={loading}
                  className="h-12"
                />
              </div>
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
                  Creating...
                </>
              ) : (
                'Add Dispensary'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}