'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, Phone, Mail, User, MessageSquare, Calendar, Edit2, Save, X, History } from 'lucide-react'
import { format } from 'date-fns'
import type { Communication, ContactMethod } from '@/types/database'

interface EditFormData {
  notes: string
  contact_method: ContactMethod
  client_name: string
  follow_up_required: boolean
  interaction_date: string
}

interface UpdateData extends Partial<EditFormData> {
  last_edited_by?: string
  last_edited_at?: string
  is_edited?: boolean
}

export default function CommunicationsPage() {
  const [communications, setCommunications] = useState<Communication[]>([])
  const [filteredCommunications, setFilteredCommunications] = useState<Communication[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMethod, setFilterMethod] = useState('all')
  const [filterFollowUp, setFilterFollowUp] = useState('all')
  const [editingComm, setEditingComm] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditFormData>({} as EditFormData)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const { user } = useAuth()

  // Get user role from auth context
  const userRole = user?.role || 'agent'

  useEffect(() => {
    if (!user) return
    fetchCommunications()
  }, [user])

  useEffect(() => {
    filterCommunications()
  }, [communications, searchTerm, filterMethod, filterFollowUp])

  const fetchCommunications = async () => {
    if (!user) return

    try {
      let query = supabase
        .from('communications')
        .select(`
          *,
          customer:customers(business_name, email, phone_number)
        `)
        .order('interaction_date', { ascending: false })

      // Agents can only see their own communications
      if (userRole === 'agent') {
        query = query.eq('agent_id', user.id)
      }

      const { data, error } = await query

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
        comm.customer?.business_name?.toLowerCase().includes(searchTerm.toLowerCase())
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

  const canEditCommunications = ['management', 'admin'].includes(userRole)

  const startEditing = (comm: Communication) => {
    setEditingComm(comm.id)
    setEditForm({
      notes: comm.notes || '',
      contact_method: comm.contact_method || 'phone',
      client_name: comm.client_name || '',
      follow_up_required: comm.follow_up_required || false,
      interaction_date: comm.interaction_date ? new Date(comm.interaction_date).toISOString().slice(0, 16) : ''
    })
  }

  const cancelEditing = () => {
    setEditingComm(null)
    setEditForm({} as EditFormData)
  }

  const saveCommunication = async (commId: string) => {
    if (!user) return

    setSaving(true)
    try {
      const updateData: UpdateData = {
        ...editForm,
        last_edited_by: user.id,
        last_edited_at: new Date().toISOString(),
        is_edited: true
      }

      const { error } = await supabase
        .from('communications')
        .update(updateData)
        .eq('id', commId)

      if (error) throw error
      
      setEditingComm(null)
      setEditForm({} as EditFormData)
      fetchCommunications()
    } catch (error) {
      console.error('Error saving communication:', error)
      alert('Error saving communication. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const updateEditForm = <K extends keyof EditFormData>(field: K, value: EditFormData[K]) => {
    setEditForm((prev: EditFormData) => ({...prev, [field]: value}))
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
                          {comm.customer?.business_name || 'Unknown Dispensary'}
                        </h3>
                        {comm.client_name && (
                          <p className="text-sm text-muted-foreground">
                            Contact: {comm.client_name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {comm.follow_up_required && (
                          <Badge variant="destructive">Follow-up Required</Badge>
                        )}
                        {comm.is_edited && (
                          <Badge variant="outline" className="text-orange-600">
                            Edited
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <p className="text-sm">{comm.notes}</p>
                    
                    {/* Inline Editing */}
                    {editingComm === comm.id ? (
                      <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Contact Method</label>
                            <Select 
                              value={editForm.contact_method} 
                              onValueChange={(value) => updateEditForm('contact_method', value as ContactMethod)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="phone">Phone Call</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                                <SelectItem value="in-person">In Person</SelectItem>
                                <SelectItem value="text">Text Message</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Client Name</label>
                            <Input
                              value={editForm.client_name}
                              onChange={(e) => updateEditForm('client_name', e.target.value)}
                              placeholder="Contact person name..."
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Interaction Date</label>
                            <Input
                              type="datetime-local"
                              value={editForm.interaction_date}
                              onChange={(e) => updateEditForm('interaction_date', e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Follow-up Required</label>
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={editForm.follow_up_required}
                                onCheckedChange={(checked) => updateEditForm('follow_up_required', checked)}
                              />
                              <span className="text-sm text-muted-foreground">
                                {editForm.follow_up_required ? 'Required' : 'Not required'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Notes</label>
                          <Textarea
                            value={editForm.notes}
                            onChange={(e) => updateEditForm('notes', e.target.value)}
                            placeholder="Communication notes..."
                            rows={4}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => saveCommunication(comm.id)}
                            disabled={saving}
                          >
                            <Save className="h-4 w-4 mr-2" />
                            {saving ? 'Saving...' : 'Save Changes'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEditing}
                            disabled={saving}
                          >
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            {getContactMethodIcon(comm.contact_method)}
                            <span>{getContactMethodLabel(comm.contact_method)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>{format(new Date(comm.interaction_date), 'MMM d, yyyy h:mm a')}</span>
                          </div>
                          {comm.last_edited_at && (
                            <div className="flex items-center gap-1 text-orange-600">
                              <Edit2 className="h-3 w-3" />
                              <span className="text-xs">Edited {format(new Date(comm.last_edited_at), 'MMM d, yyyy')}</span>
                            </div>
                          )}
                          {comm.customer?.phone_number && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-4 w-4" />
                              <span>{comm.customer.phone_number}</span>
                            </div>
                          )}
                          {comm.customer?.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-4 w-4" />
                              <span>{comm.customer.email}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Action Buttons */}
                        {canEditCommunications && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEditing(comm)}
                            >
                              <Edit2 className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                            {comm.last_edited_at && (
                              <Button size="sm" variant="ghost" className="text-muted-foreground" asChild>
                                <Link href={`/dashboard/communications/${comm.id}/history`}>
                                  <History className="h-4 w-4 mr-2" />
                                  History
                                </Link>
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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