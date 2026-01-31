'use client'

import { useState, useEffect } from 'react'
import { Contact, ContactRole } from '@/types/database'
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
