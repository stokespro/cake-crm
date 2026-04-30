import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySlackSignature, postMessage, lookupCakeUser, getThreadMessages } from '@/lib/slack/client'
import { processMessage } from '@/lib/slack/agent'
import type { SlackEvent } from '@/lib/slack/types'

// Use service role client for the Slack bot (bypasses RLS)
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const event: SlackEvent = JSON.parse(body)

  // Handle Slack URL verification challenge
  if (event.type === 'url_verification' && event.challenge) {
    return NextResponse.json({ challenge: event.challenge })
  }

  // Verify signature
  const signature = req.headers.get('x-slack-signature') || ''
  const timestamp = req.headers.get('x-slack-request-timestamp') || ''

  if (!verifySlackSignature(signature, timestamp, body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const slackEvent = event.event
  if (!slackEvent || slackEvent.type !== 'message') {
    return NextResponse.json({ ok: true })
  }

  // Ignore bot messages (prevent loops)
  if (slackEvent.bot_id || slackEvent.subtype) {
    return NextResponse.json({ ok: true })
  }

  // Use next/server after() to keep the function alive after responding
  after(async () => {
    await processSlackMessage(slackEvent)
  })

  return NextResponse.json({ ok: true })
}

async function processSlackMessage(event: {
  text: string
  user: string
  channel: string
  ts: string
  thread_ts?: string
  files?: any[]
}) {
  const supabase = createServiceClient()

  // Look up CAKE user
  const cakeUser = await lookupCakeUser(supabase, event.user)

  if (!cakeUser) {
    await postMessage(
      event.channel,
      "I don't recognize your Slack account. Ask an admin to link your Slack ID to your CAKE account.",
      event.ts
    )
    return
  }

  // If this is a thread reply, fetch thread history for context
  let threadHistory: Array<{role: string, content: string}> = []
  if (event.thread_ts) {
    const threadMessages = await getThreadMessages(event.channel, event.thread_ts)
    // Convert to message format, excluding the current message (last one)
    threadHistory = threadMessages.slice(0, -1).map(msg => ({
      role: msg.bot_id ? 'assistant' as const : 'user' as const,
      content: msg.content,
    }))
  }

  // Process message with AI agent
  const response = await processMessage(event.text, cakeUser, supabase, threadHistory)

  // Reply in thread (use thread_ts if replying in thread, otherwise use ts to start a thread)
  await postMessage(event.channel, response, event.thread_ts || event.ts)

  // Log the interaction
  await supabase.from('slack_agent_log').insert({
    slack_user_id: event.user,
    cake_user_id: cakeUser.id,
    channel_id: event.channel,
    message_text: event.text,
    agent_response: response,
  })
}
