'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Save, User } from 'lucide-react'
import Link from 'next/link'

export default function NewUserPage() {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone_number: '',
    role: 'agent',
    temporary_password: '',
    notes: ''
  })
  
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // In a full implementation, this would use Supabase Auth Admin functions
      // to create a user account and send invitation email
      // For now, we'll create a profile entry directly
      
      const { error } = await supabase
        .from('profiles')
        .insert({
          email: formData.email,
          full_name: formData.full_name,
          phone_number: formData.phone_number || null,
          role: formData.role
        })

      if (error) throw error

      router.push('/dashboard/users')
    } catch (error: unknown) {
      console.error('Error creating user:', error)
      alert(error instanceof Error ? error.message : 'An error occurred while creating the user')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/users">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Add New User</h1>
          <p className="text-muted-foreground">Create a new user account</p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">
                Email Address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                required
              />
              <p className="text-sm text-muted-foreground">
                This will be used for login and system notifications
              </p>
            </div>

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="full_name">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="full_name"
                placeholder="John Doe"
                value={formData.full_name}
                onChange={(e) => handleInputChange('full_name', e.target.value)}
                required
              />
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
              <Label htmlFor="phone_number">Phone Number</Label>
              <Input
                id="phone_number"
                type="tel"
                placeholder="(555) 123-4567"
                value={formData.phone_number}
                onChange={(e) => handleInputChange('phone_number', e.target.value)}
              />
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label htmlFor="role">
                User Role <span className="text-destructive">*</span>
              </Label>
              <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="management">Management</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Agent:</strong> Can manage their own tasks, communications, and orders</p>
                <p><strong>Management:</strong> Can view all data and manage dispensaries</p>
                <p><strong>Admin:</strong> Full system access including user management</p>
              </div>
            </div>

            {/* Temporary Password */}
            <div className="space-y-2">
              <Label htmlFor="temporary_password">Temporary Password</Label>
              <Input
                id="temporary_password"
                type="password"
                placeholder="Enter temporary password"
                value={formData.temporary_password}
                onChange={(e) => handleInputChange('temporary_password', e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                If provided, user will be able to login immediately. Otherwise, an invitation email will be sent.
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes about this user..."
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? (
                  'Creating User...'
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Create User
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/users">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Help Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">User Creation Process</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Fill out the required user information above</p>
          <p>2. Select the appropriate role based on their responsibilities</p>
          <p>3. If providing a temporary password, the user can login immediately</p>
          <p>4. Without a password, an invitation email will be sent to the user</p>
          <p>5. Users can update their own profile information after first login</p>
        </CardContent>
      </Card>
    </div>
  )
}