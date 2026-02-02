'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Loader2, Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Customer, Communication, ContactMethod } from '@/types/database'

interface CommunicationSheetProps {
  open: boolean
  onClose: () => void
  dispensaryId?: string // Kept for backwards compatibility, represents customer ID
  onSuccess?: (communication: Communication) => void
}

export function CommunicationSheet({
  open,
  onClose,
  dispensaryId,
  onSuccess
}: CommunicationSheetProps) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState(dispensaryId || '')
  const [clientName, setClientName] = useState('')
  const [notes, setNotes] = useState('')
  const [contactMethod, setContactMethod] = useState<ContactMethod>('phone')
  const [followUpRequired, setFollowUpRequired] = useState(false)
  const [interactionDate, setInteractionDate] = useState(
    new Date().toISOString().slice(0, 16)
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customerOpen, setCustomerOpen] = useState(false)
  const supabase = createClient()

  const fetchCustomers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('business_name')

      if (error) throw error
      setCustomers(data || [])
    } catch (error) {
      console.error('Error fetching customers:', error)
    }
  }, [supabase])

  useEffect(() => {
    if (open) {
      fetchCustomers()
      // Reset form when opening
      setSelectedCustomerId(dispensaryId || '')
      setClientName('')
      setNotes('')
      setContactMethod('phone')
      setFollowUpRequired(false)
      setInteractionDate(new Date().toISOString().slice(0, 16))
      setError(null)
    }
  }, [open, dispensaryId, fetchCustomers])

  const validateForm = () => {
    if (!selectedCustomerId) {
      setError('Please select a customer')
      return false
    }
    if (!notes.trim()) {
      setError('Please enter notes for the communication')
      return false
    }
    if (!contactMethod) {
      setError('Please select a contact method')
      return false
    }
    if (!interactionDate) {
      setError('Please select an interaction date and time')
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('communications')
        .insert({
          agent_id: user.id,
          customer_id: selectedCustomerId,
          client_name: clientName.trim() || null,
          notes: notes.trim(),
          contact_method: contactMethod,
          follow_up_required: followUpRequired,
          interaction_date: interactionDate,
        })
        .select('*, customer:customers(*), agent:users(*)')
        .single()

      if (error) throw error

      // Call onSuccess callback if provided
      if (onSuccess && data) {
        onSuccess(data)
      }

      // Close the sheet
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred while saving the communication')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[600px] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>Log Communication</SheetTitle>
          <SheetDescription>
            Record a client interaction with a dispensary
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerOpen}
                    className="h-12 w-full justify-between font-normal"
                    disabled={!!dispensaryId}
                  >
                    {selectedCustomerId
                      ? customers.find((c) => c.id === selectedCustomerId)?.business_name
                      : "Select a customer..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command filter={(value, search) => {
                    const valueLower = value.toLowerCase()
                    const searchTerms = search.toLowerCase().split(' ').filter(Boolean)
                    return searchTerms.every(term => valueLower.includes(term)) ? 1 : 0
                  }}>
                    <CommandInput placeholder="Search customers..." />
                    <CommandList>
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup>
                        {customers.map((customer) => (
                          <CommandItem
                            key={customer.id}
                            value={`${customer.business_name} ${customer.license_name || ''} ${customer.omma_license || ''} ${customer.city || ''}`}
                            onSelect={() => {
                              setSelectedCustomerId(customer.id)
                              setCustomerOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCustomerId === customer.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{customer.business_name}</span>
                              {(customer.license_name || customer.city) && (
                                <span className="text-xs text-muted-foreground">
                                  {[customer.license_name, customer.city].filter(Boolean).join(' • ')}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clientName">Client Name</Label>
              <Input
                id="clientName"
                placeholder="John Doe"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="h-12"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contactMethod">Contact Method *</Label>
                <Select value={contactMethod} onValueChange={(value: ContactMethod) => setContactMethod(value)}>
                  <SelectTrigger id="contactMethod" className="h-12">
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
                <Label htmlFor="interactionDate">Interaction Date & Time *</Label>
                <Input
                  id="interactionDate"
                  type="datetime-local"
                  value={interactionDate}
                  onChange={(e) => setInteractionDate(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes *</Label>
              <Textarea
                id="notes"
                placeholder="Describe the interaction, topics discussed, outcomes, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required
                rows={6}
                className="resize-none"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="followUp"
                checked={followUpRequired}
                onChange={(e) => setFollowUpRequired(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label 
                htmlFor="followUp" 
                className="text-sm font-normal cursor-pointer"
              >
                Follow-up required
              </Label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Communication'
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}