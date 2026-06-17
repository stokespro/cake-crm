'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth, canManageUsers } from '@/lib/auth-context'
import { getUser, updateUser } from '@/actions/users'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Save, User, RefreshCw } from 'lucide-react'
import Link from 'next/link'

export default function EditUserPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    pin: '',
    role: 'standard',
    slack_user_id: ''
  })
  const [slackMappingId, setSlackMappingId] = useState<string | null>(null)

  const router = useRouter()
  const params = useParams()
  const userId = params.id as string
  const { user: currentUser, isLoading: authLoading } = useAuth()

  const userRole = currentUser?.role || 'standard'
  const userCanManageUsers = canManageUsers(userRole)

  useEffect(() => {
    if (userId) {
      fetchUser()
    }
  }, [userId])

  const fetchUser = async () => {
    try {
      const result = await getUser(userId)
      if (result.error || !result.data) {
        console.error('Error fetching user:', result.error)
        alert('Error loading user details')
        router.push('/dashboard/users')
        return
      }

      const { data: user } = result
      setFormData({
        name: user.name || '',
        pin: user.pin || '',
        role: user.role || 'standard',
        slack_user_id: user.slack_user_id || ''
      })
      setSlackMappingId(user.slack_mapping_id)
    } catch (error) {
      console.error('Error fetching user:', error)
      alert('Error loading user details')
      router.push('/dashboard/users')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const result = await updateUser(userId, {
        name: formData.name,
        pin: formData.pin,
        role: formData.role,
        slack_user_id: formData.slack_user_id,
        slack_mapping_id: slackMappingId,
      })

      if (result.error) {
        alert(result.error)
        return
      }

      router.push('/dashboard/users')
    } catch (error: unknown) {
      console.error('Error updating user:', error)
      alert(error instanceof Error ? error.message : 'An error occurred while updating the user')
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const regeneratePin = () => {
    setFormData(prev => ({
      ...prev,
      pin: Math.floor(1000 + Math.random() * 9000).toString()
    }))
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading user...</div>
      </div>
    )
  }

  if (!userCanManageUsers) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">You do not have permission to edit users.</div>
      </div>
    )
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
          <h1 className="text-2xl md:text-3xl font-bold">Edit User</h1>
          <p className="text-muted-foreground">Update user details and permissions</p>
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
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                required
              />
            </div>

            {/* PIN */}
            <div className="space-y-2">
              <Label htmlFor="pin">
                Login PIN <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="pin"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  placeholder="4-digit PIN"
                  value={formData.pin}
                  onChange={(e) => handleInputChange('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="font-mono text-lg tracking-widest"
                  required
                />
                <Button type="button" variant="outline" onClick={regeneratePin}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Changing the PIN will require the user to use the new PIN for login.
              </p>
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
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="vault">Vault</SelectItem>
                  <SelectItem value="packaging">Packaging</SelectItem>
                  <SelectItem value="management">Management</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Standard:</strong> Access to Vault and Packaging only</p>
                <p><strong>Sales/Agent:</strong> Access to Dispensaries and Orders</p>
                <p><strong>Vault:</strong> Vault, Packaging, Inventory, Products</p>
                <p><strong>Packaging:</strong> Packaging, Materials, Inventory, Products</p>
                <p><strong>Management:</strong> Full access to all sections</p>
                <p><strong>Admin:</strong> Full system access including user management</p>
              </div>
            </div>

            {/* Slack User ID */}
            <div className="space-y-2">
              <Label htmlFor="slack_user_id">Slack User ID</Label>
              <Input
                id="slack_user_id"
                placeholder="e.g., U07XXXXXXXX"
                value={formData.slack_user_id}
                onChange={(e) => handleInputChange('slack_user_id', e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Optional. Links this user to their Slack account for notifications and integrations.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? (
                  'Saving...'
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
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
    </div>
  )
}
