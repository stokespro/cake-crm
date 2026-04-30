import { createClient } from '@/lib/supabase/client'

export async function generateRecurringTasks() {
  const supabase = createClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  // Fetch all recurring definitions: tasks where frequency IS NOT NULL AND recurring_parent_id IS NULL
  // These are the "parent" definitions. Generated children have recurring_parent_id set.
  const { data: definitions, error } = await supabase
    .from('cultivation_tasks')
    .select('*')
    .not('frequency', 'is', null)
    .is('recurring_parent_id', null)
    .order('created_at')

  if (error || !definitions) return 0

  let generated = 0

  for (const def of definitions) {
    const lastGen = def.last_generated_date ? new Date(def.last_generated_date + 'T00:00:00') : null
    let shouldGenerate = false
    let dueDate = todayStr

    switch (def.frequency) {
      case 'daily':
        // Generate if last_generated_date < today (or never generated)
        shouldGenerate = !lastGen || lastGen < today
        dueDate = todayStr
        break

      case 'weekly': {
        // Generate for this week's target day
        const targetDay = def.day_of_week || 1 // Default Monday
        const weekStart = new Date(today)
        const currentDay = weekStart.getDay() || 7
        weekStart.setDate(weekStart.getDate() - currentDay + targetDay)
        const weekStartStr = weekStart.toISOString().split('T')[0]
        shouldGenerate = !lastGen || lastGen < weekStart
        dueDate = weekStartStr
        break
      }

      case 'biweekly': {
        // Generate every other week based on creation date parity
        const targetDay = def.day_of_week || 1
        const createdDate = new Date(def.created_at)
        const weeksSinceCreation = Math.floor((today.getTime() - createdDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
        if (weeksSinceCreation % 2 === 0) {
          const weekStart = new Date(today)
          const currentDay = weekStart.getDay() || 7
          weekStart.setDate(weekStart.getDate() - currentDay + targetDay)
          const weekStartStr = weekStart.toISOString().split('T')[0]
          shouldGenerate = !lastGen || lastGen < weekStart
          dueDate = weekStartStr
        }
        break
      }

      case 'monthly': {
        // Generate for 1st of current month
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        const monthStartStr = monthStart.toISOString().split('T')[0]
        shouldGenerate = !lastGen || lastGen < monthStart
        dueDate = monthStartStr
        break
      }
    }

    if (shouldGenerate) {
      // Check no duplicate exists for this definition + due_date
      const { data: existing } = await supabase
        .from('cultivation_tasks')
        .select('id')
        .eq('recurring_parent_id', def.id)
        .eq('due_date', dueDate)
        .limit(1)

      if (!existing || existing.length === 0) {
        const { error: insertError } = await supabase
          .from('cultivation_tasks')
          .insert({
            title: def.title,
            description: def.description,
            task_type: 'recurring',
            room_id: def.room_id,
            due_date: dueDate,
            priority: def.priority,
            estimated_minutes: def.estimated_minutes,
            assigned_to: def.assigned_to,
            assigned_group: def.assigned_group,
            status: 'pending',
            recurring_parent_id: def.id,
            frequency: null, // Children don't have frequency — only the parent does
            created_by: def.created_by,
          })

        if (!insertError) {
          generated++
          // Update last_generated_date on the parent
          await supabase
            .from('cultivation_tasks')
            .update({ last_generated_date: dueDate })
            .eq('id', def.id)
        }
      }
    }
  }

  return generated
}
