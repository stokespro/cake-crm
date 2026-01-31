'use client'

import { useState, useEffect } from 'react'
import { Contact, ContactRole } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { getContactsByDispensary, deleteContact, setPrimaryContact } from '@/actions/contacts'
import { ContactSheet } from './contact-sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Star,
  Mail,
  Phone,
  MoreHorizontal,
  Edit,
  Trash2,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Users,
  Copy,
  Check,
  Loader2,
  MessageSquare,
} from 'lucide-react'
import { toast } from 'sonner'

interface DispensaryContactsProps {
  dispensaryId: string
  defaultOpen?: boolean
}

const ROLE_COLORS: Record<ContactRole, string> = {
  owner: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
  manager: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  inventory_manager: 'bg-green-100 text-green-800 hover:bg-green-200',
  buyer: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
  other: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
}

const ROLE_LABELS: Record<ContactRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  inventory_manager: 'Inventory Manager',
  buyer: 'Buyer',
  other: 'Other',
}

// Type IDs for A Buds and B Buds
const A_BUDS_TYPE_ID = '506cc32c-272c-443b-823e-77652afc2409'
const B_BUDS_TYPE_ID = '06db9d58-e3dd-4c77-aa24-795c31c8f065'

// Conversion rates for vault (grams to cases)
const A_BUDS_GRAMS_PER_CASE = 112
const B_BUDS_GRAMS_PER_CASE = 224

interface AvailableItem {
  strainName: string
  productTypeName: string
  available: number
}

async function fetchAvailableInventory(): Promise<AvailableItem[]> {
  const supabase = createClient()

  const [
    skusResult,
    strainsResult,
    productTypesResult,
    inventoryResult,
    packagesResult,
    ordersResult,
  ] = await Promise.all([
    supabase.from('skus').select('id, code, name, strain_id, product_type_id').order('code'),
    supabase.from('strains').select('id, name'),
    supabase.from('product_types').select('id, name'),
    supabase.from('inventory').select('sku_id, cased, filled, staged'),
    supabase.from('packages').select('strain_id, type_id, current_weight, is_active').eq('is_active', true),
    supabase.from('orders').select('id, status, order_items(sku_id, quantity)').in('status', ['pending', 'confirmed', 'packed']),
  ])

  if (skusResult.error || strainsResult.error || productTypesResult.error ||
      inventoryResult.error || packagesResult.error || ordersResult.error) {
    throw new Error('Failed to fetch inventory data')
  }

  const skus = skusResult.data || []
  const strains = strainsResult.data || []
  const productTypes = productTypesResult.data || []
  const inventory = inventoryResult.data || []
  const vaultPackages = packagesResult.data || []
  const orders = ordersResult.data || []

  // Calculate pending orders by SKU
  const pendingOrderItems = new Map<string, number>()
  for (const order of orders) {
    for (const item of (order.order_items as { sku_id: string; quantity: number }[]) || []) {
      const current = pendingOrderItems.get(item.sku_id) || 0
      pendingOrderItems.set(item.sku_id, current + item.quantity)
    }
  }

  // Calculate vault grams by strain and product type
  const vaultByStrainAndType = new Map<string, number>()
  for (const pkg of vaultPackages) {
    const key = `${pkg.strain_id}-${pkg.type_id}`
    const current = vaultByStrainAndType.get(key) || 0
    vaultByStrainAndType.set(key, current + pkg.current_weight)
  }

  const strainMap = new Map(strains.map(s => [s.id, s.name]))
  const typeMap = new Map(productTypes.map(t => [t.id, t.name]))
  const inventoryMap = new Map(inventory.map(i => [i.sku_id, i]))

  // Group by strain + type to avoid duplicates in the message
  const availabilityByStrainType = new Map<string, AvailableItem>()

  for (const sku of skus) {
    const strainName = strainMap.get(sku.strain_id) || 'Unknown'
    const productTypeName = typeMap.get(sku.product_type_id) || 'Unknown'
    const inv = inventoryMap.get(sku.id)

    const vaultKey = `${sku.strain_id}-${sku.product_type_id}`
    const vaultGrams = vaultByStrainAndType.get(vaultKey) || 0

    let vaultCases = 0
    if (sku.product_type_id === A_BUDS_TYPE_ID) {
      vaultCases = Math.floor(vaultGrams / A_BUDS_GRAMS_PER_CASE)
    } else if (sku.product_type_id === B_BUDS_TYPE_ID) {
      vaultCases = Math.floor(vaultGrams / B_BUDS_GRAMS_PER_CASE)
    }

    const staged = inv?.staged || 0
    const filled = inv?.filled || 0
    const cased = inv?.cased || 0
    const pendingOrders = pendingOrderItems.get(sku.id) || 0

    const available = vaultCases + staged + filled + cased - pendingOrders

    if (available > 0) {
      const key = `${strainName}-${productTypeName}`
      const existing = availabilityByStrainType.get(key)
      if (existing) {
        existing.available += available
      } else {
        availabilityByStrainType.set(key, {
          strainName,
          productTypeName,
          available,
        })
      }
    }
  }

  return Array.from(availabilityByStrainType.values())
    .sort((a, b) => a.strainName.localeCompare(b.strainName))
}

function buildAvailabilityMessage(items: AvailableItem[]): string {
  if (items.length === 0) {
    return "Hey! We're currently restocking - check back soon!\n\n- CAKE"
  }

  const lines = items.map(item =>
    `🌿 ${item.strainName} ${item.productTypeName} - ${item.available} cases`
  )

  return `Hey! Here is what we have available:\n\n${lines.join('\n')}\n\nLet me know what you would like!\n- CAKE`
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  return navigator.maxTouchPoints > 0 || window.innerWidth < 768
}

export function DispensaryContacts({ dispensaryId, defaultOpen = true }: DispensaryContactsProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const loadContacts = async () => {
    setLoading(true)
    const result = await getContactsByDispensary(dispensaryId)
    if (result.success && result.data) {
      setContacts(result.data)
    } else {
      toast.error(result.error || 'Failed to load contacts')
    }
    setLoading(false)
  }

  useEffect(() => {
    loadContacts()
  }, [dispensaryId])

  const handleAddContact = () => {
    setEditingContact(null)
    setSheetOpen(true)
  }

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact)
    setSheetOpen(true)
  }

  const handleDeleteContact = async () => {
    if (!deletingContact) return

    const result = await deleteContact(deletingContact.id)
    if (result.success) {
      toast.success('Contact deleted successfully')
      loadContacts()
    } else {
      toast.error(result.error || 'Failed to delete contact')
    }
    setDeletingContact(null)
  }

  const handleSetPrimary = async (contact: Contact) => {
    const result = await setPrimaryContact(dispensaryId, contact.id)
    if (result.success) {
      toast.success(`${contact.name} is now the primary contact`)
      loadContacts()
    } else {
      toast.error(result.error || 'Failed to set primary contact')
    }
  }

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

  const handleTextAvailability = async (contact: Contact) => {
    if (!contact.phone) {
      toast.error('No phone number for this contact')
      return
    }

    try {
      const items = await fetchAvailableInventory()
      const message = buildAvailabilityMessage(items)

      if (isMobileDevice()) {
        // Open SMS app on mobile
        const smsUrl = `sms:${contact.phone}?&body=${encodeURIComponent(message)}`
        window.location.href = smsUrl
      } else {
        // Copy to clipboard on desktop
        await navigator.clipboard.writeText(message)
        toast.success(`Message copied! Text to: ${contact.phone}`)
      }
    } catch (error) {
      toast.error('Failed to load inventory data')
    }
  }

  const getRoleBadge = (role?: ContactRole) => {
    if (!role) return null
    return (
      <Badge variant="secondary" className={ROLE_COLORS[role]}>
        {ROLE_LABELS[role]}
      </Badge>
    )
  }

  const renderContactInfo = (contact: Contact, fieldId: string) => (
    <div className="flex items-center gap-2 flex-wrap">
      {contact.email && (
        <button
          type="button"
          onClick={() => copyToClipboard(contact.email!, `email-${fieldId}`)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-1"
          title="Click to copy email"
        >
          {copiedField === `email-${fieldId}` ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{contact.email}</span>
        </button>
      )}
      {contact.phone && (
        <button
          type="button"
          onClick={() => copyToClipboard(contact.phone!, `phone-${fieldId}`)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-1"
          title="Click to copy phone"
        >
          {copiedField === `phone-${fieldId}` ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Phone className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{contact.phone}</span>
        </button>
      )}
    </div>
  )

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between p-4 h-auto hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <span className="font-medium">Contacts</span>
              {!loading && (
                <Badge variant="secondary" className="ml-1">
                  {contacts.length}
                </Badge>
              )}
            </div>
            {isOpen ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t">
            {/* Add Contact Button */}
            <div className="p-4 border-b">
              <Button
                type="button"
                onClick={handleAddContact}
                size="sm"
                className="w-full sm:w-auto"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No contacts yet</p>
                <p className="text-sm">Add a contact to get started</p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Name</TableHead>
                        <TableHead className="hidden md:table-cell">Role</TableHead>
                        <TableHead className="hidden lg:table-cell">Contact Info</TableHead>
                        <TableHead className="hidden xl:table-cell">Preferences</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((contact) => (
                        <TableRow key={contact.id} className="hover:bg-muted/50">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {contact.is_primary && (
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              )}
                              <span className="font-medium">{contact.name}</span>
                            </div>
                            {/* Show role on smaller screens inline */}
                            <div className="md:hidden mt-1">
                              {getRoleBadge(contact.role as ContactRole)}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {getRoleBadge(contact.role as ContactRole)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {renderContactInfo(contact, contact.id)}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {contact.comm_email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                </span>
                              )}
                              {contact.comm_sms && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditContact(contact)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                {!contact.is_primary && (
                                  <DropdownMenuItem onClick={() => handleSetPrimary(contact)}>
                                    <Star className="h-4 w-4 mr-2" />
                                    Set as Primary
                                  </DropdownMenuItem>
                                )}
                                {contact.email && (
                                  <DropdownMenuItem onClick={() => copyToClipboard(contact.email!, `menu-email-${contact.id}`)}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy Email
                                  </DropdownMenuItem>
                                )}
                                {contact.phone && (
                                  <DropdownMenuItem onClick={() => copyToClipboard(contact.phone!, `menu-phone-${contact.id}`)}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy Phone
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleTextAvailability(contact)}>
                                  <MessageSquare className="h-4 w-4 mr-2" />
                                  Text Availability
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setDeletingContact(contact)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards */}
                <div className="sm:hidden divide-y">
                  {contacts.map((contact) => (
                    <div key={contact.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {contact.is_primary && (
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                            )}
                            <span className="font-medium truncate">{contact.name}</span>
                          </div>
                          {contact.role && (
                            <div className="mb-2">
                              {getRoleBadge(contact.role as ContactRole)}
                            </div>
                          )}
                          <div className="space-y-1">
                            {contact.email && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(contact.email!, `mobile-email-${contact.id}`)}
                                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground min-h-[44px] w-full text-left"
                              >
                                {copiedField === `mobile-email-${contact.id}` ? (
                                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                                ) : (
                                  <Mail className="h-4 w-4 flex-shrink-0" />
                                )}
                                <span className="truncate">{contact.email}</span>
                              </button>
                            )}
                            {contact.phone && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(contact.phone!, `mobile-phone-${contact.id}`)}
                                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground min-h-[44px] w-full text-left"
                              >
                                {copiedField === `mobile-phone-${contact.id}` ? (
                                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                                ) : (
                                  <Phone className="h-4 w-4 flex-shrink-0" />
                                )}
                                <span>{contact.phone}</span>
                              </button>
                            )}
                          </div>
                          {/* Communication preferences */}
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            {contact.comm_email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" /> Email
                              </span>
                            )}
                            {contact.comm_sms && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> SMS
                              </span>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-11 w-11 p-0 flex-shrink-0"
                            >
                              <MoreHorizontal className="h-5 w-5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditContact(contact)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {!contact.is_primary && (
                              <DropdownMenuItem onClick={() => handleSetPrimary(contact)}>
                                <Star className="h-4 w-4 mr-2" />
                                Set as Primary
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleTextAvailability(contact)}>
                              <MessageSquare className="h-4 w-4 mr-2" />
                              Text Availability
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeletingContact(contact)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Contact Sheet */}
      <ContactSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        dispensaryId={dispensaryId}
        contact={editingContact}
        onSuccess={loadContacts}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingContact} onOpenChange={(open) => !open && setDeletingContact(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingContact?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteContact}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
