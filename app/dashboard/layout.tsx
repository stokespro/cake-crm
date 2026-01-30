'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ModeToggle } from '@/components/theme-toggle'
import {
  Home,
  MessageSquare,
  CheckSquare,
  ShoppingCart,
  Building2,
  Package,
  Menu,
  LogOut,
  User,
  Users,
  Warehouse,
  ClipboardList
} from 'lucide-react'

// Navigation items with role restrictions
// roles: which roles can see this item (empty = all roles)
const allNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home, roles: [] },

  // Vault section - standard, vault, packaging, management, admin
  { name: 'Vault', href: '/dashboard/vault', icon: Warehouse, roles: ['standard', 'vault', 'packaging', 'management', 'admin'] },

  // Packaging section - standard, packaging, vault, management, admin
  { name: 'Packaging', href: '/dashboard/packaging', icon: ClipboardList, roles: ['standard', 'packaging', 'vault', 'management', 'admin'] },

  // CRM section - sales, agent, management, admin
  { name: 'Orders', href: '/dashboard/orders', icon: ShoppingCart, roles: ['sales', 'agent', 'management', 'admin'] },
  { name: 'Dispensaries', href: '/dashboard/dispensaries', icon: Building2, roles: ['sales', 'agent', 'management', 'admin'] },
  { name: 'Communications', href: '/dashboard/communications', icon: MessageSquare, roles: ['sales', 'agent', 'management', 'admin'] },
  { name: 'Tasks', href: '/dashboard/tasks', icon: CheckSquare, roles: ['sales', 'agent', 'management', 'admin'] },

  // Shared - only for management/admin and warehouse
  { name: 'Products', href: '/dashboard/products', icon: Package, roles: ['standard', 'vault', 'packaging', 'management', 'admin'] },

  // Admin only
  { name: 'Users', href: '/dashboard/users', icon: Users, roles: ['admin'] },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, isLoading, logout } = useAuth()

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [user, isLoading, router])

  // Show nothing while checking auth
  if (isLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  // Get navigation items based on user role
  const getNavigationItems = () => {
    return allNavigation.filter(item => {
      // Empty roles array means all roles can access
      if (item.roles.length === 0) return true
      // Check if user's role is in the allowed roles
      return item.roles.includes(user.role)
    })
  }

  const handleSignOut = () => {
    logout()
    router.push('/login')
  }

  const NavigationContent = () => {
    const navigation = getNavigationItems()

    return (
      <>
        <div className="flex h-16 shrink-0 items-center px-6 border-b">
          <h2 className="text-lg font-semibold">CAKE</h2>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                  ${isActive
                    ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-50'
                  }
                `}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            )
          })}
        </nav>
        <div className="border-t p-3">
          <Link
            href="/dashboard/profile"
            className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
          >
            <User className="h-5 w-5 text-zinc-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-zinc-500 capitalize">{user.role}</p>
            </div>
          </Link>
          <div className="flex items-center justify-between gap-2 mt-2">
            <Button
              variant="ghost"
              className="flex-1 justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
              onClick={handleSignOut}
            >
              <LogOut className="h-5 w-5" />
              Sign Out
            </Button>
            <ModeToggle />
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col">
        <div className="flex flex-col flex-grow border-r bg-white dark:bg-zinc-950">
          <NavigationContent />
        </div>
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <NavigationContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between h-16 px-4 border-b bg-white dark:bg-zinc-950">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </Button>
          <h1 className="text-lg font-semibold">CAKE</h1>
          <div className="w-10" /> {/* Spacer for centering */}
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
