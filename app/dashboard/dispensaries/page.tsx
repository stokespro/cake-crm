'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Building2, Phone, Mail, MapPin, FileText } from 'lucide-react'
import type { DispensaryProfile } from '@/types/database'

export default function DispensariesPage() {
  const [dispensaries, setDispensaries] = useState<DispensaryProfile[]>([])
  const [filteredDispensaries, setFilteredDispensaries] = useState<DispensaryProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [userRole, setUserRole] = useState<string>('')
  const [roleLoading, setRoleLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      await fetchUserRole()
      await fetchDispensaries()
    }
    loadData()
  }, [])

  useEffect(() => {
    filterDispensaries()
  }, [dispensaries, searchTerm])

  const fetchUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setRoleLoading(false)
        return
      }

      // Try to use the new secure function first
      const { data: profileData, error: functionError } = await supabase
        .rpc('get_user_profile', { user_id: user.id })

      if (!functionError && profileData) {
        setUserRole(profileData.role || 'agent')
        setRoleLoading(false)
        return
      }

      // Fallback to direct query
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (data) {
        setUserRole(data.role)
      } else if (error) {
        console.error('Error fetching user role:', error)
        setUserRole('agent') // fallback
      }
    } catch (error) {
      console.error('Error fetching user role:', error)
      setUserRole('agent') // fallback
    } finally {
      setRoleLoading(false)
    }
  }

  const fetchDispensaries = async () => {
    try {
      const { data, error } = await supabase
        .from('dispensary_profiles')
        .select('*')
        .order('business_name')

      if (error) throw error
      setDispensaries(data || [])
    } catch (error) {
      console.error('Error fetching dispensaries:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterDispensaries = () => {
    if (!searchTerm) {
      setFilteredDispensaries(dispensaries)
      return
    }

    const filtered = dispensaries.filter(dispensary =>
      dispensary.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dispensary.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dispensary.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dispensary.omma_license?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dispensary.ob_license?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    setFilteredDispensaries(filtered)
  }

  const canManageDispensaries = userRole === 'management' || userRole === 'admin'

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">
          {roleLoading ? 'Loading permissions...' : 'Loading dispensaries...'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Dispensaries</h1>
          <p className="text-muted-foreground mt-1">Manage customer profiles and information</p>
        </div>
        {canManageDispensaries && (
          <Button asChild>
            <Link href="/dashboard/dispensaries/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Dispensary
            </Link>
          </Button>
        )}
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, address, email, or license..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Showing {filteredDispensaries.length} of {dispensaries.length} dispensaries
          </p>
        </CardContent>
      </Card>

      {/* Dispensaries Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDispensaries.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                {searchTerm ? 'No dispensaries found matching your search' : 'No dispensaries added yet'}
              </p>
              {canManageDispensaries && !searchTerm && (
                <Button asChild>
                  <Link href="/dashboard/dispensaries/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Add First Dispensary
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredDispensaries.map((dispensary) => (
            <Card key={dispensary.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      {dispensary.business_name}
                    </div>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {dispensary.address && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span className="text-muted-foreground">{dispensary.address}</span>
                  </div>
                )}
                
                {dispensary.phone_number && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a 
                      href={`tel:${dispensary.phone_number}`}
                      className="text-muted-foreground hover:text-primary"
                    >
                      {dispensary.phone_number}
                    </a>
                  </div>
                )}
                
                {dispensary.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a 
                      href={`mailto:${dispensary.email}`}
                      className="text-muted-foreground hover:text-primary truncate"
                    >
                      {dispensary.email}
                    </a>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  {dispensary.omma_license && (
                    <Badge variant="outline" className="text-xs">
                      <FileText className="h-3 w-3 mr-1" />
                      OMMA: {dispensary.omma_license}
                    </Badge>
                  )}
                  {dispensary.ob_license && (
                    <Badge variant="outline" className="text-xs">
                      <FileText className="h-3 w-3 mr-1" />
                      OB: {dispensary.ob_license}
                    </Badge>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1" asChild>
                    <Link href={`/dashboard/communications/new?dispensary=${dispensary.id}`}>
                      Log Communication
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" asChild>
                    <Link href={`/dashboard/tasks/new?dispensary=${dispensary.id}`}>
                      Create Task
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {!canManageDispensaries && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground text-center">
              Note: Only management and admin users can add or edit dispensaries.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}