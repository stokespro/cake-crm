import Anthropic from '@anthropic-ai/sdk'
import { queryTasks, completeTask, createTask, editTask, getRoomStatus, getUserByName } from './tools'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are CAKE Grow Bot, a task management assistant for CAKE's cannabis cultivation facility in Oklahoma. You help growers check their tasks, mark things complete, create new tasks, and check room status.

Key facts:
- There are 6 flower rooms (Room 1-6)
- Growth cycle: Clone Dome (2 wks) → Veg (4 wks) → Flower (9 wks) → Harvest
- Room pairings: 1 & 2 individual, 3 & 5 paired, 4 & 6 paired
- Task priorities: low, medium, high, critical
- Task statuses: pending, in_progress, completed, skipped

Behavior:
- Be concise — this is Slack, not email
- Use bullet points for task lists
- When listing tasks, show: title, room (if any), priority, due date
- When ambiguous, ask a short clarifying question
- Always confirm before creating or modifying tasks
- When someone says a task is "done", ask what task they mean if unclear, then mark it complete
- Use the current user's ID for assigned_to queries when they ask about "my tasks"
- Today's date for reference: use the current date from the system`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'query_tasks',
    description: 'Search and filter cultivation tasks. Use this to find tasks by assignee, room, status, or date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        assigned_to: { type: 'string', description: 'User ID to filter by assignee' },
        room_number: { type: 'number', description: 'Room number (1-6) to filter by room' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'skipped'], description: 'Filter by status' },
        overdue_only: { type: 'boolean', description: 'Only show overdue tasks' },
        due_today: { type: 'boolean', description: 'Only show tasks due today' },
        limit: { type: 'number', description: 'Max results to return (default 20)' },
      },
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a cultivation task as completed with optional notes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'The task ID to complete' },
        notes: { type: 'string', description: 'Completion notes (observations, readings, etc.)' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new ad-hoc cultivation task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Detailed description' },
        room_number: { type: 'number', description: 'Room number (1-6), omit for facility-wide' },
        assigned_to: { type: 'string', description: 'User ID to assign to' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      },
      required: ['title', 'due_date'],
    },
  },
  {
    name: 'edit_task',
    description: 'Edit an existing task (reassign, change priority, status, or due date).',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'The task ID to edit' },
        assigned_to: { type: 'string', description: 'New assignee user ID' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        due_date: { type: 'string', description: 'New due date YYYY-MM-DD' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'skipped'] },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'get_room_status',
    description: 'Get current status of grow rooms including phase, week, and task counts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        room_number: { type: 'number', description: 'Specific room number (1-6), omit for all rooms' },
      },
    },
  },
  {
    name: 'get_user_by_name',
    description: 'Look up a CAKE user by name to get their user ID for task assignment.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name or partial name to search for' },
      },
      required: ['name'],
    },
  },
]

export async function processMessage(
  text: string,
  cakeUser: { id: string; name: string; role: string },
  supabase: any
): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const userContext = `The current user is ${cakeUser.name} (ID: ${cakeUser.id}, role: ${cakeUser.role}). Today is ${today}.`

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: `${userContext}\n\n${text}` },
    ]

    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    })

    // Handle tool use loop (max 5 iterations)
    let iterations = 0
    while (response.stop_reason === 'tool_use' && iterations < 5) {
      iterations++
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      )

      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolUse of toolUseBlocks) {
        let result: any

        switch (toolUse.name) {
          case 'query_tasks':
            result = await queryTasks(supabase, toolUse.input as any)
            break
          case 'complete_task':
            result = await completeTask(supabase, {
              ...(toolUse.input as any),
              completed_by: cakeUser.id,
            })
            break
          case 'create_task':
            result = await createTask(supabase, {
              ...(toolUse.input as any),
              created_by: cakeUser.id,
            })
            break
          case 'edit_task':
            result = await editTask(supabase, toolUse.input as any)
            break
          case 'get_room_status':
            result = await getRoomStatus(supabase, toolUse.input as any)
            break
          case 'get_user_by_name':
            result = await getUserByName(supabase, toolUse.input as any)
            break
          default:
            result = { success: false, error: `Unknown tool: ${toolUse.name}` }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        })
      }

      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: toolResults })

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      })
    }

    // Extract text from response
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    )

    return textBlocks.map((b) => b.text).join('\n') || 'I processed your request but have no text response.'
  } catch (error: any) {
    console.error('Agent error:', error)
    return `Sorry, I encountered an error: ${error.message}`
  }
}
