'use client'

import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
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
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { CycleTemplate, GrowPhase, PHASE_CONFIG } from '@/types/cultivation'

const TEMPLATE_PHASES = (
  Object.entries(PHASE_CONFIG) as [GrowPhase, { label: string; weeks: number; color: string }][]
).filter(([key]) => key !== 'empty')

interface TemplateSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: CycleTemplate | null
  userId: string
  onSaved: () => void
}

export function TemplateSheet({
  open,
  onOpenChange,
  template,
  userId,
  onSaved,
}: TemplateSheetProps) {
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<string>('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  const isEditing = !!template

  useEffect(() => {
    if (template) {
      setName(template.name)
      setPhase(template.phase)
      setDescription(template.description || '')
      setIsActive(template.is_active)
    } else {
      setName('')
      setPhase('')
      setDescription('')
      setIsActive(true)
    }
  }, [template, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Template name is required')
      return
    }
    if (!phase) {
      toast.error('Phase is required')
      return
    }

    setSaving(true)
    const supabase = createClient()

    if (isEditing) {
      const { error } = await supabase
        .from('cycle_templates')
        .update({
          name: name.trim(),
          phase,
          description: description.trim() || null,
          is_active: isActive,
        })
        .eq('id', template.id)

      if (error) {
        toast.error('Failed to update template')
        console.error(error)
        setSaving(false)
        return
      }
      toast.success('Template updated')
    } else {
      const { error } = await supabase.from('cycle_templates').insert({
        name: name.trim(),
        phase,
        description: description.trim() || null,
        is_active: isActive,
        created_by: userId,
      })

      if (error) {
        toast.error('Failed to create template')
        console.error(error)
        setSaving(false)
        return
      }
      toast.success('Template created')
    }

    setSaving(false)
    onOpenChange(false)
    onSaved()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit Template' : 'New Template'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Update the cycle template details.'
              : 'Create a new cycle template to define tasks for a growth phase.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Name *</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Standard Flower Cycle"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-phase">Phase *</Label>
            <Select value={phase} onValueChange={setPhase}>
              <SelectTrigger id="template-phase">
                <SelectValue placeholder="Select phase" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_PHASES.map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label} ({config.weeks} weeks)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-description">Description</Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of this template..."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="template-active">Active</Label>
            <Switch
              id="template-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

          <SheetFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
