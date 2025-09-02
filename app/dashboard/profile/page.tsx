'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Save, User, Mail, Phone, Shield } from 'lucide-react'

export default function ProfilePage() {
  const [profile, setProfile] = useState<{id?: string, created_at?: string, updated_at?: string, full_name?: string, phone?: string, role?: string} | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Try to use the new secure function first
      const { data: profileData, error: functionError } = await supabase
        .rpc('get_user_profile', { user_id: user.id })

      if (!functionError && profileData) {
        setProfile(profileData)
        setFullName(profileData.full_name || '')
        setPhone(profileData.phone || '')
        setEmail(profileData.email || user.email || '')
        setRole(profileData.role || 'agent')
        setMessage(null) // Clear any previous errors
        return
      }

      // Fallback to direct query if function doesn't exist yet
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Profile fetch error:', error)
        
        // Try to create missing profile
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            role: 'agent'
          })
          .select()
          .single()

        if (!createError && newProfile) {
          setProfile(newProfile)
          setFullName('')
          setPhone('')
          setEmail(user.email || '')
          setRole('agent')
          setMessage({ 
            type: 'success', 
            text: 'Profile created successfully! You can now update your information.' 
          })
        } else {
          setMessage({ 
            type: 'error', 
            text: `Failed to load profile: ${error.message}. Contact admin for assistance.` 
          })
          // Set basic user info even if profile creation fails
          setEmail(user.email || '')
          setRole('agent')
        }
        return
      }

      setProfile(profile)
      setFullName(profile.full_name || '')
      setPhone(profile.phone || '')
      setEmail(profile.email || user.email || '')
      setRole(profile.role || 'agent')
      setMessage(null) // Clear any previous errors
    } catch (error) {
      console.error('Error fetching profile:', error)
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to load profile. Please try again.' 
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

      if (error) throw error

      setMessage({ type: 'success', text: 'Profile updated successfully!' })
      
      // Refresh the page to update the sidebar
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (error) {
      console.error('Error updating profile:', error)
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update profile' })
    } finally {
      setSaving(false)
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-600'
      case 'management':
        return 'bg-blue-600'
      case 'agent':
        return 'bg-green-600'
      default:
        return 'bg-gray-600'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">My Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account information</p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Personal Information</CardTitle>
            <Badge className={`${getRoleBadgeColor(role)} text-white`}>
              <Shield className="h-3 w-3 mr-1" />
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </Badge>
          </div>
          <CardDescription>
            Update your personal details. Email and role cannot be changed here.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSave}>
          <CardContent className="space-y-4">
            {message && (
              <div className={`p-3 text-sm rounded-md ${
                message.type === 'success' 
                  ? 'text-green-600 bg-green-50 border border-green-200' 
                  : 'text-red-600 bg-red-50 border border-red-200'
              }`}>
                {message.text}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Address
                </div>
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                disabled
                className="h-12 bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed. Contact admin for assistance.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Full Name
                </div>
              </Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={saving}
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone Number
                </div>
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={saving}
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Account Role
                </div>
              </Label>
              <Input
                id="role"
                value={role.charAt(0).toUpperCase() + role.slice(1)}
                disabled
                className="h-12 bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                {role === 'admin' 
                  ? 'You have full administrative access to all features.'
                  : role === 'management'
                  ? 'You can manage orders, products, and view all data.'
                  : 'You can manage your own data and view shared resources.'}
              </p>
            </div>
          </CardContent>

          <div className="flex justify-end p-6 pt-0">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>
            Account details and permissions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between py-2 border-b">
            <span className="text-sm text-muted-foreground">User ID</span>
            <span className="text-sm font-mono">{profile?.id?.slice(0, 8)}...</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-sm text-muted-foreground">Account Created</span>
            <span className="text-sm">
              {profile?.created_at 
                ? new Date(profile.created_at).toLocaleDateString()
                : 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-sm text-muted-foreground">Last Updated</span>
            <span className="text-sm">
              {profile?.updated_at 
                ? new Date(profile.updated_at).toLocaleDateString()
                : 'Never'}
            </span>
          </div>
          <div className="pt-2">
            <p className="text-sm font-medium mb-2">Permissions</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              {role === 'admin' ? (
                <>
                  <p>✓ Full system access</p>
                  <p>✓ Manage all users and data</p>
                  <p>✓ Configure system settings</p>
                </>
              ) : role === 'management' ? (
                <>
                  <p>✓ View all data</p>
                  <p>✓ Manage products and dispensaries</p>
                  <p>✓ Approve orders</p>
                </>
              ) : (
                <>
                  <p>✓ Manage own communications</p>
                  <p>✓ Create tasks and orders</p>
                  <p>✓ View shared resources</p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}