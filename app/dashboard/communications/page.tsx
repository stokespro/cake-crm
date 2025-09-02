'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, Phone, Mail, User, MessageSquare, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import type { Communication } from '@/types/database'

export default function CommunicationsPage() {
  const [communications, setCommunications] = useState<Communication[]>([])
  const [filteredCommunications, setFilteredCommunications] = useState<Communication[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMethod, setFilterMethod] = useState('all')
  const [filterFollowUp, setFilterFollowUp] = useState('all')
  const supabase = createClient()

  useEffect(() => {
    fetchCommunications()
  }, [])

  useEffect(() => {
    filterCommunications()
  }, [communications, searchTerm, filterMethod, filterFollowUp])

  const fetchCommunications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('communications')
        .select(`
          *,
          dispensary:dispensary_profiles(business_name, email, phone_number)
        `)
        .eq('agent_id', user.id)
        .order('interaction_date', { ascending: false })

      if (error) throw error
      setCommunications(data || [])
    } catch (error) {
      console.error('Error fetching communications:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterCommunications = () => {
    let filtered = [...communications]

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(comm => 
        comm.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comm.notes.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comm.dispensary?.business_name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Contact method filter
    if (filterMethod !== 'all') {
      filtered = filtered.filter(comm => comm.contact_method === filterMethod)
    }

    // Follow-up filter
    if (filterFollowUp === 'required') {
      filtered = filtered.filter(comm => comm.follow_up_required)
    } else if (filterFollowUp === 'not-required') {
      filtered = filtered.filter(comm => !comm.follow_up_required)
    }

    setFilteredCommunications(filtered)
  }

  const getContactMethodIcon = (method?: string) => {
    switch (method) {
      case 'phone':
        return <Phone className="h-4 w-4" />
      case 'email':
        return <Mail className="h-4 w-4" />
      case 'in-person':
        return <User className="h-4 w-4" />
      case 'text':
        return <MessageSquare className="h-4 w-4" />
      default:
        return <MessageSquare className="h-4 w-4" />
    }
  }

  const getContactMethodLabel = (method?: string) => {
    switch (method) {
      case 'phone':
        return 'Phone Call'
      case 'email':
        return 'Email'
      case 'in-person':
        return 'In Person'
      case 'text':
        return 'Text Message'
      default:
        return 'Unknown'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading communications...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Communications</h1>
          <p className="text-muted-foreground mt-1">Track all client interactions</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/communications/new">
            <Plus className="mr-2 h-4 w-4" />
            Log Communication
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search communications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterMethod} onValueChange={setFilterMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Contact Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="phone">Phone Call</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="in-person">In Person</SelectItem>
                <SelectItem value="text">Text Message</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterFollowUp} onValueChange={setFilterFollowUp}>
              <SelectTrigger>
                <SelectValue placeholder="Follow-up Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Communications</SelectItem>
                <SelectItem value="required">Follow-up Required</SelectItem>
                <SelectItem value="not-required">No Follow-up</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center text-sm text-muted-foreground">
              {filteredCommunications.length} of {communications.length} communications
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Communications List */}
      <div className="space-y-4">
        {filteredCommunications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No communications found</p>
              <Button className="mt-4" asChild>
                <Link href="/dashboard/communications/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Log Your First Communication
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredCommunications.map((comm) => (
            <Card key={comm.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {comm.dispensary?.business_name || 'Unknown Dispensary'}
                        </h3>
                        {comm.client_name && (
                          <p className="text-sm text-muted-foreground">
                            Contact: {comm.client_name}
                          </p>
                        )}
                      </div>
                      {comm.follow_up_required && (
                        <Badge variant="destructive">Follow-up Required</Badge>
                      )}
                    </div>
                    
                    <p className="text-sm">{comm.notes}</p>
                    
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        {getContactMethodIcon(comm.contact_method)}
                        <span>{getContactMethodLabel(comm.contact_method)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{format(new Date(comm.interaction_date), 'MMM d, yyyy h:mm a')}</span>
                      </div>
                      {comm.dispensary?.phone_number && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-4 w-4" />
                          <span>{comm.dispensary.phone_number}</span>
                        </div>
                      )}
                      {comm.dispensary?.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-4 w-4" />
                          <span>{comm.dispensary.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}