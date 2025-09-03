'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Search, Building2, Phone, MoreHorizontal, Eye, MessageSquare, ShoppingCart, BarChart3 } from 'lucide-react'
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

      {/* Dispensaries Table */}
      <Card>
        <CardContent className="p-0">
          {filteredDispensaries.length === 0 ? (
            <div className="py-12 text-center">
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
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business Name</TableHead>
                    <TableHead className="hidden md:table-cell">Phone</TableHead>
                    <TableHead className="hidden lg:table-cell">OMMA License</TableHead>
                    <TableHead className="hidden xl:table-cell">Address</TableHead>
                    <TableHead className="w-[50px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDispensaries.map((dispensary) => (
                    <TableRow key={dispensary.id} className="hover:bg-muted/50">
                      <TableCell>
                        <Link
                          href={`/dashboard/dispensaries/${dispensary.id}`}
                          className="block hover:text-primary transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium">{dispensary.business_name}</div>
                              <div className="text-sm text-muted-foreground md:hidden">
                                {dispensary.phone_number && (
                                  <div className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {dispensary.phone_number}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {dispensary.phone_number && (
                          <a
                            href={`tel:${dispensary.phone_number}`}
                            className="text-muted-foreground hover:text-primary transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {dispensary.phone_number}
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {dispensary.omma_license && (
                          <Badge variant="outline" className="text-xs">
                            {dispensary.omma_license}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {dispensary.address && (
                          <div className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {dispensary.address}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/dashboard/dispensaries/${dispensary.id}`}
                                className="flex items-center gap-2"
                              >
                                <Eye className="h-4 w-4" />
                                View Dispensary
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/dashboard/communications/new?dispensary=${dispensary.id}`}
                                className="flex items-center gap-2"
                              >
                                <MessageSquare className="h-4 w-4" />
                                Log Communication
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/dashboard/orders/new?dispensary=${dispensary.id}`}
                                className="flex items-center gap-2"
                              >
                                <ShoppingCart className="h-4 w-4" />
                                Create Order
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/dashboard/dispensaries/${dispensary.id}#analytics`}
                                className="flex items-center gap-2"
                              >
                                <BarChart3 className="h-4 w-4" />
                                Analytics
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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