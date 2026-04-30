import crypto from 'crypto'

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ''
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || ''

export function verifySlackSignature(
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const sigBasestring = `v0:${timestamp}:${body}`
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(sigBasestring)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  )
}

export async function postMessage(
  channel: string,
  text: string,
  threadTs?: string
) {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      text,
      thread_ts: threadTs,
    }),
  })
  return response.json()
}

export async function lookupCakeUser(supabase: any, slackUserId: string) {
  const { data, error } = await supabase
    .from('slack_user_mappings')
    .select('cake_user_id, slack_username')
    .eq('slack_user_id', slackUserId)
    .single()

  if (error || !data) return null

  // Get the full user info
  const { data: user } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('id', data.cake_user_id)
    .single()

  return user
}
