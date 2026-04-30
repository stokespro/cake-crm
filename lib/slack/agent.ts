import OpenAI from 'openai'
import { queryTasks, completeTask, createTask, editTask, getRoomStatus, getUserByName } from './tools'

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
}

const SYSTEM_PROMPT = `You are Bud, a task management assistant for CAKE's cannabis cultivation facility in Oklahoma. You help growers check their tasks, mark things complete, create new tasks, and check room status.

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
- When you find exactly one matching task, go ahead and perform the action without asking for confirmation
- Only ask for confirmation when there are multiple matches or the action is destructive (like deleting)
- When responding to a confirmation ("yes", "yeah", "do it", "confirm"), check the conversation history for what was being confirmed and execute it
- When someone says a task is "done", ask what task they mean if unclear, then mark it complete
- Use the current user's ID for assigned_to queries when they ask about "my tasks"
- Today's date for reference: use the current date from the system`

const TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'query_tasks',
      description: 'Search and filter cultivation tasks. Use this to find tasks by assignee, room, status, or date.',
      parameters: {
        type: 'object',
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
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Mark a cultivation task as completed with optional notes.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The task ID to complete' },
          notes: { type: 'string', description: 'Completion notes (observations, readings, etc.)' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a new ad-hoc cultivation task.',
      parameters: {
        type: 'object',
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
  },
  {
    type: 'function',
    function: {
      name: 'edit_task',
      description: 'Edit an existing task (reassign, change priority, status, or due date).',
      parameters: {
        type: 'object',
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
  },
  {
    type: 'function',
    function: {
      name: 'get_room_status',
      description: 'Get current status of grow rooms including phase, week, and task counts.',
      parameters: {
        type: 'object',
        properties: {
          room_number: { type: 'number', description: 'Specific room number (1-6), omit for all rooms' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_by_name',
      description: 'Look up a CAKE user by name to get their user ID for task assignment.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name or partial name to search for' },
        },
        required: ['name'],
      },
    },
  },
]

async function executeTool(toolName: string, args: any, cakeUser: { id: string }, supabase: any): Promise<any> {
  switch (toolName) {
    case 'query_tasks':
      return await queryTasks(supabase, args)
    case 'complete_task':
      return await completeTask(supabase, { ...args, completed_by: cakeUser.id })
    case 'create_task':
      return await createTask(supabase, { ...args, created_by: cakeUser.id })
    case 'edit_task':
      return await editTask(supabase, args)
    case 'get_room_status':
      return await getRoomStatus(supabase, args)
    case 'get_user_by_name':
      return await getUserByName(supabase, args)
    default:
      return { success: false, error: `Unknown tool: ${toolName}` }
  }
}

export async function processMessage(
  text: string,
  cakeUser: { id: string; name: string; role: string },
  supabase: any,
  threadHistory: Array<{role: string, content: string}> = []
): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const userContext = `The current user is ${cakeUser.name} (ID: ${cakeUser.id}, role: ${cakeUser.role}). Today is ${today}.`

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      // Include thread history for context
      ...threadHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      // Current message
      { role: 'user', content: `${userContext}\n\n${text}` },
    ]

    const openai = getOpenAI()

    let response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      max_tokens: 1024,
      messages,
      tools: TOOLS,
    })

    // Handle tool call loop (max 5 iterations)
    let iterations = 0
    while (response.choices[0]?.finish_reason === 'tool_calls' && iterations < 5) {
      iterations++
      const message = response.choices[0].message
      const toolCalls = message.tool_calls || []

      // Add assistant message with tool calls
      messages.push(message)

      // Execute each tool call and add results
      for (const toolCall of toolCalls) {
        const args = JSON.parse(toolCall.function.arguments)
        const result = await executeTool(toolCall.function.name, args, cakeUser, supabase)

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        })
      }

      // Get next response
      response = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        max_tokens: 1024,
        messages,
        tools: TOOLS,
      })
    }

    return response.choices[0]?.message?.content || 'I processed your request but have no text response.'
  } catch (error: any) {
    console.error('Agent error:', error)
    return `Sorry, I encountered an error: ${error.message}`
  }
}
