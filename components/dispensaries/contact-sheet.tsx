'use client'

import { useState, useEffect } from 'react'
import { Contact, ContactRole } from '@/types/database'
import { createContact, updateContact } from '@/actions/contacts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ContactSheetProps {
  open: boolean
  onClose: () => void
  dispensaryId: string
  contact?: Contact | null
  onSuccess: () => void
}

interface FormData {
  name: string
  email: string
  phone: string
  role: ContactRole | ''
  is_primary: boolean
  comm_email: boolean
  comm_sms: boolean
  notes: string
}

const ROLE_OPTIONS: { value: ContactRole; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'inventory_manager', label: 'Inventory Manager' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'other', label: 'Other' },
]

export function ContactSheet({
  open,
  onClose,
  dispensaryId,
  contact,
  onSuccess,
}: ContactSheetProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    role: '',
    is_primary: false,
    comm_email: true,
    comm_sms: false,
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  const isEditMode = !!contact

  // Reset form when sheet opens/closes or contact changes
  useEffect(() => {
    if (open) {
      if (contact) {
        setFormData({
          name: contact.name || '',
          email: contact.email || '',
          phone: contact.phone || '',
          role: contact.role || '',
          is_primary: contact.is_primary ?? false,
          comm_email: contact.comm_email ?? true,
          comm_sms: contact.comm_sms ?? false,
          notes: contact.notes || '',
        })
      } else {
        setFormData({
          name: '',
          email: '',
          phone: '',
          role: '',
          is_primary: false,
          comm_email: true,
          comm_sms: false,
          notes: '',
        })
      }
      setErrors({})
    }
  }, [open, contact])

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose()
    }
  }

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (formData.phone && !/^[\+\(\)\-\.\s\d]+$/.test(formData.phone)) {
      newErrors.phone = 'Please enter a valid phone number'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const data = {
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        role: formData.role || undefined,
        is_primary: formData.is_primary,
        comm_email: formData.comm_email,
        comm_sms: formData.comm_sms,
        notes: formData.notes.trim() || undefined,
      }

      let result
      if (isEditMode && contact) {
        result = await updateContact(contact.id, data)
      } else {
        result = await createContact({
          ...data,
          dispensary_id: dispensaryId,
        })
      }

      if (result.success) {
        toast.success(isEditMode ? 'Contact updated successfully' : 'Contact added successfully')
        onSuccess()
        onClose()
      } else {
        toast.error(result.error || 'An error occurred')
      }
    } catch (error) {
      console.error('Error saving contact:', error)
      toast.error('Failed to save contact. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <SheetHeader>
            <SheetTitle>{isEditMode ? 'Edit Contact' : 'Add Contact'}</SheetTitle>
            <SheetDescription>
              {isEditMode
                ? 'Update the contact information.'
                : 'Add a new contact for this dispensary.'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 py-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="John Smith"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                disabled={loading}
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && (
                <p className="text-sm text-red-600">{errors.name}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@dispensary.com"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                disabled={loading}
                className={errors.email ? 'border-red-500' : ''}
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                disabled={loading}
                className={errors.phone ? 'border-red-500' : ''}
              />
              {errors.phone && (
                <p className="text-sm text-red-600">{errors.phone}</p>
              )}
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => handleInputChange('role', value as ContactRole)}
                disabled={loading}
              >
                <SelectTrigger id="role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Is Primary */}
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label htmlFor="is_primary">Primary Contact</Label>
                <p className="text-sm text-muted-foreground">
                  Set as the main contact for this dispensary
                </p>
              </div>
              <Switch
                id="is_primary"
                checked={formData.is_primary}
                onCheckedChange={(checked) => handleInputChange('is_primary', checked)}
                disabled={loading}
              />
            </div>

            {/* Communication Preferences */}
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-base">Communication Preferences</Label>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="comm_email" className="font-normal">Email</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive communications via email
                  </p>
                </div>
                <Switch
                  id="comm_email"
                  checked={formData.comm_email}
                  onCheckedChange={(checked) => handleInputChange('comm_email', checked)}
                  disabled={loading}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="comm_sms" className="font-normal">SMS</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive communications via text message
                  </p>
                </div>
                <Switch
                  id="comm_sms"
                  checked={formData.comm_sms}
                  onCheckedChange={(checked) => handleInputChange('comm_sms', checked)}
                  disabled={loading}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2 pt-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes about this contact..."
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                disabled={loading}
                rows={3}
              />
            </div>
          </div>

          <SheetFooter className="gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditMode ? 'Updating...' : 'Adding...'}
                </>
              ) : (
                isEditMode ? 'Update Contact' : 'Add Contact'
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
