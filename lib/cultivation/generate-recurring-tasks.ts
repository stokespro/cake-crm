import { createClient } from '@/lib/supabase/client'

/**
 * How many days ahead to generate recurring task instances.
 * E.g. 14 means the generator will always ensure instances exist
 * from today through today+14.
 */
const LOOKAHEAD_DAYS = 14

/** Add `days` to a YYYY-MM-DD string and return a new YYYY-MM-DD string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * Build an ordered list of due-date strings that need to be generated for a
 * given recurrence pattern, given what has already been generated
 * (lastGenStr) and the current window (today … today+LOOKAHEAD_DAYS).
 */
function dueDatesNeeded(
  frequency: string,
  lastGenStr: string | null,
  todayStr: string,
  horizonStr: string,
  dayOfWeek: number | null,
  createdAt: string,
): string[] {
  const dates: string[] = []

  switch (frequency) {
    case 'daily': {
      // Start from the day after last_generated_date (or today if never generated)
      const startStr = lastGenStr ? addDays(lastGenStr, 1) : todayStr
      let cursor = startStr
      while (cursor <= horizonStr) {
        dates.push(cursor)
        cursor = addDays(cursor, 1)
      }
      break
    }

    case 'weekly': {
      // Find all target weekdays in the lookahead window that haven't been generated yet
      const targetDay = dayOfWeek ?? 1 // 1=Mon … 7=Sun
      // Find first occurrence of targetDay >= today
      const todayDate = new Date(todayStr + 'T00:00:00')
      const dayNum = todayDate.getDay() || 7 // convert 0 (Sun) -> 7
      const daysUntilTarget = ((targetDay - dayNum + 7) % 7) || 7
      // If we land exactly on today, include today; otherwise start from next occurrence
      const firstOccurrence = addDays(todayStr, daysUntilTarget === 7 ? 0 : daysUntilTarget)
      let cursor = firstOccurrence
      while (cursor <= horizonStr) {
        if (!lastGenStr || cursor > lastGenStr) {
          dates.push(cursor)
        }
        cursor = addDays(cursor, 7)
      }
      break
    }

    case 'biweekly': {
      const targetDay = dayOfWeek ?? 1
      const todayDate = new Date(todayStr + 'T00:00:00')
      const dayNum = todayDate.getDay() || 7
      const daysUntilTarget = ((targetDay - dayNum + 7) % 7) || 7
      const firstOccurrence = addDays(todayStr, daysUntilTarget === 7 ? 0 : daysUntilTarget)
      // Determine parity: even/odd weeks since creation
      const createdDate = new Date(createdAt)
      let cursor = firstOccurrence
      while (cursor <= horizonStr) {
        const weeksSinceCreation = Math.floor(
          (new Date(cursor + 'T00:00:00').getTime() - createdDate.getTime()) /
            (7 * 24 * 60 * 60 * 1000),
        )
        if (weeksSinceCreation % 2 === 0 && (!lastGenStr || cursor > lastGenStr)) {
          dates.push(cursor)
        }
        cursor = addDays(cursor, 7)
      }
      break
    }

    case 'monthly': {
      // Generate 1st of each month in the window that hasn't been generated yet
      const todayDate = new Date(todayStr + 'T00:00:00')
      let year = todayDate.getFullYear()
      let month = todayDate.getMonth()
      for (let i = 0; i < 3; i++) {
        const monthStart = new Date(year, month + i, 1)
        const monthStartStr = monthStart.toISOString().split('T')[0]
        if (monthStartStr <= horizonStr && (!lastGenStr || monthStartStr > lastGenStr)) {
          dates.push(monthStartStr)
        }
      }
      break
    }
  }

  return dates
}

export async function generateRecurringTasks() {
  const supabase = createClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]
  const horizonStr = addDays(todayStr, LOOKAHEAD_DAYS)

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
    const needed = dueDatesNeeded(
      def.frequency,
      def.last_generated_date ?? null,
      todayStr,
      horizonStr,
      def.day_of_week ?? null,
      def.created_at,
    )

    if (needed.length === 0) continue

    // Fetch existing children in this date range to avoid duplicates
    const { data: existing } = await supabase
      .from('cultivation_tasks')
      .select('due_date')
      .eq('recurring_parent_id', def.id)
      .gte('due_date', needed[0])
      .lte('due_date', needed[needed.length - 1])

    const existingDates = new Set((existing ?? []).map((r: { due_date: string }) => r.due_date))

    const toInsert = needed
      .filter((d) => !existingDates.has(d))
      .map((dueDate) => ({
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
      }))

    if (toInsert.length === 0) continue

    const { error: insertError } = await supabase.from('cultivation_tasks').insert(toInsert)

    if (!insertError) {
      generated += toInsert.length
      // Update last_generated_date to the furthest date we just created
      const maxDate = toInsert[toInsert.length - 1].due_date
      await supabase
        .from('cultivation_tasks')
        .update({ last_generated_date: maxDate })
        .eq('id', def.id)
    }
  }

  return generated
}
