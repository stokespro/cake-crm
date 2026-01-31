'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/theme-toggle'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import {
  Home,
  MessageSquare,
  CheckSquare,
  ShoppingCart,
  Building2,
  Package,
  LogOut,
  User,
  Users,
  Warehouse,
  ClipboardList,
  BarChart3
} from 'lucide-react'

// Navigation items with role restrictions
// roles: which roles can see this item (empty = all roles)
const allNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home, roles: [] },

  // Vault section - standard, vault, packaging, management, admin
  { name: 'Vault', href: '/dashboard/vault', icon: Warehouse, roles: ['standard', 'vault', 'packaging', 'management', 'admin'] },

  // Packaging section - standard, packaging, vault, management, admin
  { name: 'Packaging', href: '/dashboard/packaging', icon: ClipboardList, roles: ['standard', 'packaging', 'vault', 'management', 'admin'] },

  // Inventory dashboard - vault, packaging, management, admin
  { name: 'Inventory', href: '/dashboard/inventory', icon: BarChart3, roles: ['vault', 'packaging', 'management', 'admin'] },

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

function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()

  if (!user) return null

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

  const navigation = getNavigationItems()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <span className="font-bold text-sm">C</span>
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">CAKE</span>
                  <span className="text-xs text-muted-foreground">CRM</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={item.name}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={`${user.name} (${user.role})`}>
              <User className="h-4 w-4" />
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-medium">{user.name}</span>
                <span className="text-xs text-muted-foreground capitalize">{user.role}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              tooltip="Sign Out"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div className="flex items-center justify-center p-2 group-data-[collapsible=icon]:p-0">
              <ModeToggle />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { user, isLoading } = useAuth()

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

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        {/* Header with sidebar trigger */}
        <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1" />
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}
