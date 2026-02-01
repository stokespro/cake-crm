'use client'

import { useEffect, useState, useCallback, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
import {
  Plus,
  Search,
  Building2,
  Phone,
  MoreHorizontal,
  Eye,
  MessageSquare,
  ShoppingCart,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  X,
  CalendarIcon,
  Check,
} from 'lucide-react'
import type { Customer, Profile } from '@/types/database'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50

interface FilterState {
  search: string
  city: string
  salesPersonId: string
  hasOrders: boolean
  startDate: string
  endDate: string
  page: number
}

function parseSearchParams(searchParams: URLSearchParams): FilterState {
  return {
    search: searchParams.get('search') || '',
    city: searchParams.get('city') || '',
    salesPersonId: searchParams.get('sales') || '',
    hasOrders: searchParams.get('hasOrders') === 'true',
    startDate: searchParams.get('startDate') || '',
    endDate: searchParams.get('endDate') || '',
    page: parseInt(searchParams.get('page') || '1', 10),
  }
}

function buildSearchParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.city) params.set('city', filters.city)
  if (filters.salesPersonId) params.set('sales', filters.salesPersonId)
  if (filters.hasOrders) params.set('hasOrders', 'true')
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)
  if (filters.page > 1) params.set('page', filters.page.toString())
  return params
}

function countActiveFilters(filters: FilterState): number {
  let count = 0
  if (filters.search) count++
  if (filters.city) count++
  if (filters.salesPersonId) count++
  if (filters.hasOrders) count++
  if (filters.startDate || filters.endDate) count++
  return count
}

export default function DispensariesPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const supabase = createClient()
  const { user, isLoading: authLoading } = useAuth()

  // Parse filter state from URL
  const filters = useMemo(() => parseSearchParams(searchParams), [searchParams])

  // Local state for debounced search input
  const [searchInput, setSearchInput] = useState(filters.search)

  // Data state
  const [dispensaries, setDispensaries] = useState<Customer[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filter options data
  const [cities, setCities] = useState<string[]>([])
  const [salesPeople, setSalesPeople] = useState<Profile[]>([])
  const [citiesLoading, setCitiesLoading] = useState(true)
  const [salesPeopleLoading, setSalesPeopleLoading] = useState(true)

  // UI state
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [cityComboboxOpen, setCityComboboxOpen] = useState(false)

  const userRole = user?.role || 'standard'
  const canManageDispensaries = ['management', 'admin'].includes(userRole)
  const canAddDispensary = ['sales', 'agent', 'management', 'admin'].includes(userRole)

  // Update URL with new filters
  const updateFilters = useCallback((newFilters: Partial<FilterState>) => {
    const updated = { ...filters, ...newFilters }
    // Reset to page 1 when filters change (except for page changes)
    if (!('page' in newFilters)) {
      updated.page = 1
    }
    const params = buildSearchParams(updated)
    const query = params.toString()
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname)
    })
  }, [filters, pathname, router])

  // Debounced search update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        updateFilters({ search: searchInput })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, filters.search, updateFilters])

  // Sync search input with URL params
  useEffect(() => {
    setSearchInput(filters.search)
  }, [filters.search])

  // Fetch filter options on mount
  useEffect(() => {
    const fetchCities = async () => {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('city')
          .not('city', 'is', null)
          .order('city')

        if (error) throw error
        const uniqueCities = [...new Set(data?.map(d => d.city).filter(Boolean) as string[])]
        setCities(uniqueCities)
      } catch (error) {
        console.error('Error fetching cities:', error)
      } finally {
        setCitiesLoading(false)
      }
    }

    const fetchSalesPeople = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .in('role', ['sales', 'agent'])
          .order('name')

        if (error) throw error
        setSalesPeople(data || [])
      } catch (error) {
        console.error('Error fetching sales people:', error)
      } finally {
        setSalesPeopleLoading(false)
      }
    }

    fetchCities()
    fetchSalesPeople()
  }, [supabase])

  // Fetch dispensaries with filters
  useEffect(() => {
    const fetchDispensaries = async () => {
      setLoading(true)
      try {
        let query = supabase
          .from('customers')
          .select('*, assigned_sales:profiles!customers_assigned_sales_id_fkey(id, name)', { count: 'exact' })

        // Apply search filter
        if (filters.search) {
          const searchTerm = `%${filters.search}%`
          query = query.or(
            `business_name.ilike.${searchTerm},license_name.ilike.${searchTerm},address.ilike.${searchTerm},email.ilike.${searchTerm},omma_license.ilike.${searchTerm}`
          )
        }

        // Apply city filter
        if (filters.city) {
          query = query.eq('city', filters.city)
        }

        // Apply sales person filter
        if (filters.salesPersonId) {
          if (filters.salesPersonId === 'unassigned') {
            query = query.is('assigned_sales_id', null)
          } else {
            query = query.eq('assigned_sales_id', filters.salesPersonId)
          }
        }

        // Apply has orders filter
        if (filters.hasOrders) {
          query = query.eq('has_orders', true)
        }

        // Apply date range filter
        if (filters.startDate) {
          query = query.gte('last_order_date', filters.startDate)
        }
        if (filters.endDate) {
          query = query.lte('first_order_date', filters.endDate)
        }

        // Apply ordering
        query = query.order('business_name')

        // Apply pagination
        const from = (filters.page - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        query = query.range(from, to)

        const { data, error, count } = await query

        if (error) throw error
        setDispensaries(data || [])
        setTotalCount(count || 0)
      } catch (error) {
        console.error('Error fetching customers:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDispensaries()
  }, [supabase, filters])

  const clearAllFilters = () => {
    setSearchInput('')
    startTransition(() => {
      router.push(pathname)
    })
  }

  const activeFilterCount = countActiveFilters(filters)
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const showingFrom = totalCount === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1
  const showingTo = Math.min(filters.page * PAGE_SIZE, totalCount)

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
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
        {canAddDispensary && (
          <Button asChild>
            <Link href="/dashboard/dispensaries/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Dispensary
            </Link>
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 p-0 h-auto hover:bg-transparent">
                  <Filter className="h-4 w-4" />
                  <CardTitle className="text-base">Filters</CardTitle>
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {activeFilterCount}
                    </Badge>
                  )}
                  <ChevronDown className={cn(
                    "h-4 w-4 transition-transform",
                    filtersOpen && "rotate-180"
                  )} />
                </Button>
              </CollapsibleTrigger>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear all
                </Button>
              )}
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="space-y-2">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by name, address, email, or license..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Filter Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* City Combobox */}
                <div className="space-y-2">
                  <Label>City</Label>
                  <Popover open={cityComboboxOpen} onOpenChange={setCityComboboxOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={cityComboboxOpen}
                        className="w-full justify-between"
                        disabled={citiesLoading}
                      >
                        {filters.city || "All cities"}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput placeholder="Search city..." />
                        <CommandList>
                          <CommandEmpty>No city found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value=""
                              onSelect={() => {
                                updateFilters({ city: '' })
                                setCityComboboxOpen(false)
                              }}
                            >
                              <Check className={cn(
                                "mr-2 h-4 w-4",
                                !filters.city ? "opacity-100" : "opacity-0"
                              )} />
                              All cities
                            </CommandItem>
                            {cities.map((city) => (
                              <CommandItem
                                key={city}
                                value={city}
                                onSelect={() => {
                                  updateFilters({ city })
                                  setCityComboboxOpen(false)
                                }}
                              >
                                <Check className={cn(
                                  "mr-2 h-4 w-4",
                                  filters.city === city ? "opacity-100" : "opacity-0"
                                )} />
                                {city}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Sales Person Select */}
                <div className="space-y-2">
                  <Label>Sales Person</Label>
                  <Select
                    value={filters.salesPersonId}
                    onValueChange={(value) => updateFilters({ salesPersonId: value })}
                    disabled={salesPeopleLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All sales people" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All sales people</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {salesPeople.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range - Start */}
                <div className="space-y-2">
                  <Label>Orders from</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !filters.startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.startDate ? format(new Date(filters.startDate), "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filters.startDate ? new Date(filters.startDate) : undefined}
                        onSelect={(date) => updateFilters({ startDate: date ? format(date, 'yyyy-MM-dd') : '' })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Date Range - End */}
                <div className="space-y-2">
                  <Label>Orders to</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !filters.endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.endDate ? format(new Date(filters.endDate), "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filters.endDate ? new Date(filters.endDate) : undefined}
                        onSelect={(date) => updateFilters({ endDate: date ? format(date, 'yyyy-MM-dd') : '' })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Has Orders Toggle */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="has-orders"
                  checked={filters.hasOrders}
                  onCheckedChange={(checked) => updateFilters({ hasOrders: checked })}
                />
                <Label htmlFor="has-orders">Customers Only</Label>
                <span className="text-sm text-muted-foreground">(with order history)</span>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Results Summary & Pagination */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <p className="text-sm text-muted-foreground">
          {loading ? (
            <Skeleton className="h-4 w-40 inline-block" />
          ) : (
            `Showing ${showingFrom}-${showingTo} of ${totalCount.toLocaleString()} dispensaries`
          )}
        </p>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateFilters({ page: 1 })}
              disabled={filters.page === 1 || loading}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateFilters({ page: filters.page - 1 })}
              disabled={filters.page === 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-2">
              Page {filters.page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateFilters({ page: filters.page + 1 })}
              disabled={filters.page === totalPages || loading}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateFilters({ page: totalPages })}
              disabled={filters.page === totalPages || loading}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Dispensaries Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-8" />
                </div>
              ))}
            </div>
          ) : dispensaries.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                {activeFilterCount > 0 ? 'No dispensaries found matching your filters' : 'No dispensaries added yet'}
              </p>
              {canAddDispensary && activeFilterCount === 0 && (
                <Button asChild>
                  <Link href="/dashboard/dispensaries/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Add First Dispensary
                  </Link>
                </Button>
              )}
              {activeFilterCount > 0 && (
                <Button variant="outline" onClick={clearAllFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business Name</TableHead>
                    <TableHead className="hidden md:table-cell">City</TableHead>
                    <TableHead className="hidden md:table-cell">Phone</TableHead>
                    <TableHead className="hidden lg:table-cell">OMMA License</TableHead>
                    <TableHead className="hidden xl:table-cell">Sales Person</TableHead>
                    <TableHead className="hidden xl:table-cell">Orders</TableHead>
                    <TableHead className="w-[50px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dispensaries.map((dispensary) => (
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
                                {dispensary.city && <span>{dispensary.city}</span>}
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
                        {dispensary.city && (
                          <span className="text-muted-foreground">{dispensary.city}</span>
                        )}
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
                        {dispensary.assigned_sales?.name && (
                          <span className="text-sm text-muted-foreground">
                            {dispensary.assigned_sales.name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {dispensary.has_orders ? (
                          <Badge variant="secondary" className="text-xs">
                            {dispensary.order_count || 0}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
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

      {/* Bottom Pagination */}
      {totalPages > 1 && !loading && (
        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateFilters({ page: 1 })}
              disabled={filters.page === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateFilters({ page: filters.page - 1 })}
              disabled={filters.page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-2">
              Page {filters.page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateFilters({ page: filters.page + 1 })}
              disabled={filters.page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateFilters({ page: totalPages })}
              disabled={filters.page === totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {!canManageDispensaries && !canAddDispensary && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground text-center">
              Note: Only sales, management and admin users can add dispensaries.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
