'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DateRangePicker } from '@/components/date-range-picker'
import {
  DollarSign,
  ExternalLink,
  Clock,
  CheckCircle,
  Banknote,
  Calendar,
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, startOfYear } from 'date-fns'
import type { Commission, CommissionStatus } from '@/types/database'

type PeriodType = 'this-month' | 'last-month' | 'this-quarter' | 'this-year' | 'all-time' | 'custom'

interface FilterState {
  dateFrom: string
  dateTo: string
  status: string
  period: PeriodType
}

const initialFilters: FilterState = {
  dateFrom: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  dateTo: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  status: 'all',
  period: 'this-month',
}

export default function MyCommissionsPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const supabase = createClient()

  const [commissions, setCommissions] = useState<Commission[]>([])
  const [filteredCommissions, setFilteredCommissions] = useState<Commission[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterState>(initialFilters)

  const userRole = user?.role || 'standard'
  const canAccess = ['sales', 'agent', 'management', 'admin'].includes(userRole)

  useEffect(() => {
    if (!authLoading && user && !canAccess) {
      router.push('/dashboard')
    }
  }, [user, authLoading, canAccess, router])

  useEffect(() => {
    if (canAccess && user) {
      fetchData()
    }
  }, [canAccess, user])

  useEffect(() => {
    filterCommissions()
  }, [commissions, filters])

  const fetchData = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('commissions')
        .select(`
          *,
          salesperson:profiles!commissions_salesperson_id_fkey(id, full_name),
          order:orders(id, order_number, customer:customers(business_name))
        `)
        .eq('salesperson_id', user.id)
        .order('order_date', { ascending: false })

      if (error) throw error

      setCommissions(data || [])
    } catch (error) {
      console.error('Error fetching commissions:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterCommissions = useCallback(() => {
    let filtered = [...commissions]

    // Filter by date range
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom + 'T00:00:00')
      filtered = filtered.filter(c => new Date(c.order_date) >= fromDate)
    }
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo + 'T23:59:59')
      filtered = filtered.filter(c => new Date(c.order_date) <= toDate)
    }

    // Filter by status
    if (filters.status && filters.status !== 'all') {
      filtered = filtered.filter(c => c.status === filters.status)
    }

    setFilteredCommissions(filtered)
  }, [commissions, filters])

  const handlePeriodChange = (period: PeriodType) => {
    const now = new Date()
    let dateFrom = ''
    let dateTo = ''

    switch (period) {
      case 'this-month':
        dateFrom = format(startOfMonth(now), 'yyyy-MM-dd')
        dateTo = format(endOfMonth(now), 'yyyy-MM-dd')
        break
      case 'last-month':
        const lastMonth = subMonths(now, 1)
        dateFrom = format(startOfMonth(lastMonth), 'yyyy-MM-dd')
        dateTo = format(endOfMonth(lastMonth), 'yyyy-MM-dd')
        break
      case 'this-quarter':
        dateFrom = format(startOfQuarter(now), 'yyyy-MM-dd')
        dateTo = format(now, 'yyyy-MM-dd')
        break
      case 'this-year':
        dateFrom = format(startOfYear(now), 'yyyy-MM-dd')
        dateTo = format(now, 'yyyy-MM-dd')
        break
      case 'all-time':
        dateFrom = ''
        dateTo = ''
        break
      case 'custom':
        // Keep existing dates for custom
        return setFilters(prev => ({ ...prev, period }))
    }

    setFilters(prev => ({ ...prev, period, dateFrom, dateTo }))
  }

  const handleDateRangeChange = (range: { from: Date; to?: Date }) => {
    setFilters(prev => ({
      ...prev,
      period: 'custom',
      dateFrom: format(range.from, 'yyyy-MM-dd'),
      dateTo: range.to ? format(range.to, 'yyyy-MM-dd') : '',
    }))
  }

  // Summary calculations - This Month (regardless of filter)
  const thisMonthStart = startOfMonth(new Date())
  const thisMonthEnd = endOfMonth(new Date())
  const thisMonthCommissions = commissions.filter(c => {
    const date = new Date(c.order_date)
    return date >= thisMonthStart && date <= thisMonthEnd
  })
  const thisMonthEarnings = thisMonthCommissions.reduce((sum, c) => sum + c.commission_amount, 0)

  // Status totals (from all commissions, not filtered)
  const totalPending = commissions
    .filter(c => c.status === 'pending')
    .reduce((sum, c) => sum + c.commission_amount, 0)

  const totalApproved = commissions
    .filter(c => c.status === 'approved')
    .reduce((sum, c) => sum + c.commission_amount, 0)

  const totalPaid = commissions
    .filter(c => c.status === 'paid')
    .reduce((sum, c) => sum + c.commission_amount, 0)

  // Filtered totals for table footer
  const filteredOrderTotal = filteredCommissions.reduce((sum, c) => sum + c.order_total, 0)
  const filteredCommissionTotal = filteredCommissions.reduce((sum, c) => sum + c.commission_amount, 0)

  const getStatusBadge = (status: CommissionStatus) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
      case 'approved':
        return <Badge variant="default" className="bg-blue-600"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>
      case 'paid':
        return <Badge variant="default" className="bg-green-600"><Banknote className="h-3 w-3 mr-1" />Paid</Badge>
      default:
        return null
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">My Commissions</h1>
        <p className="text-muted-foreground mt-1">Track your sales commissions and earnings</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${thisMonthEarnings.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">${totalPending.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">${totalApproved.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">${totalPaid.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Period Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter Period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filters.period === 'this-month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePeriodChange('this-month')}
              >
                This Month
              </Button>
              <Button
                variant={filters.period === 'last-month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePeriodChange('last-month')}
              >
                Last Month
              </Button>
              <Button
                variant={filters.period === 'this-quarter' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePeriodChange('this-quarter')}
              >
                This Quarter
              </Button>
              <Button
                variant={filters.period === 'this-year' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePeriodChange('this-year')}
              >
                This Year
              </Button>
              <Button
                variant={filters.period === 'all-time' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePeriodChange('all-time')}
              >
                All Time
              </Button>
            </div>
            <div className="flex gap-2 items-center">
              <DateRangePicker
                initialDateFrom={filters.dateFrom || undefined}
                initialDateTo={filters.dateTo || undefined}
                onUpdate={({ range }) => handleDateRangeChange(range)}
                align="start"
              />
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Commissions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Commissions ({filteredCommissions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredCommissions.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No commissions found for the selected period
              </p>
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Order Total</TableHead>
                    <TableHead className="text-right">Rate %</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCommissions.map((commission) => (
                    <TableRow key={commission.id}>
                      <TableCell>
                        {format(new Date(commission.order_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {commission.order?.order_number ? (
                          <Link
                            href={`/dashboard/orders?order=${commission.order_id}`}
                            className="flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            #{commission.order.order_number}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{commission.order?.customer?.business_name || '—'}</TableCell>
                      <TableCell className="text-right">
                        ${commission.order_total.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {commission.rate_applied}%
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${commission.commission_amount.toFixed(2)}
                      </TableCell>
                      <TableCell>{getStatusBadge(commission.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="font-semibold">Totals</TableCell>
                    <TableCell className="text-right font-semibold">
                      ${filteredOrderTotal.toFixed(2)}
                    </TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right font-semibold">
                      ${filteredCommissionTotal.toFixed(2)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
