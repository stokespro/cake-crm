'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertTriangle, ExternalLink, Calendar, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import briefingData from './briefings.json'

// ── Types ────────────────────────────────────────────────────────────────────

type Tag = 'federal' | 'oklahoma' | 'cultivation' | 'deadline' | 'pending'
type Urgency = 'urgent' | 'standard'

interface KeyDeadline {
  id: string
  label: string
  date: string
  description: string
  urgency: Urgency
}

interface BriefingSource {
  name: string
  url: string
}

interface BriefingItem {
  id: string
  headline: string
  date: string
  summary: string
  whyItMatters: string
  tags: Tag[]
  source: BriefingSource
  secondarySource?: BriefingSource
  pinned: boolean
}

interface BriefingData {
  lastUpdated: string
  keyDeadlines: KeyDeadline[]
  items: BriefingItem[]
}

// ── Cast the JSON import to the typed shape ───────────────────────────────────

const data = briefingData as BriefingData

// ── Format ISO date string for display ───────────────────────────────────────

function formatLastUpdated(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Tag badge color map ───────────────────────────────────────────────────────

const TAG_CLASSES: Record<Tag, string> = {
  federal:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  oklahoma:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
  cultivation:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border-amber-200 dark:border-amber-800',
  deadline:
    'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200 border-red-200 dark:border-red-800',
  pending:
    'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700',
}

const TAG_LABELS: Record<Tag, string> = {
  federal: 'Federal / DEA',
  oklahoma: 'Oklahoma',
  cultivation: 'Cultivation',
  deadline: 'Deadline',
  pending: 'Pending',
}

// ── Filter tab config ─────────────────────────────────────────────────────────

type FilterKey = 'all' | Tag

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'federal', label: 'Federal / DEA' },
  { key: 'oklahoma', label: 'Oklahoma' },
  { key: 'cultivation', label: 'Cultivation' },
  { key: 'deadline', label: 'Deadlines' },
]

// ── Sort items: date descending ───────────────────────────────────────────────

const SORTED_ITEMS = [...data.items].sort(
  (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
)

// ── Helper to get count per filter ───────────────────────────────────────────

function getCount(key: FilterKey): number {
  if (key === 'all') return data.items.length
  return data.items.filter((item) => item.tags.includes(key as Tag)).length
}

// ── Page component ────────────────────────────────────────────────────────────

export default function DeaBriefingPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')

  const filteredItems =
    activeFilter === 'all'
      ? SORTED_ITEMS
      : SORTED_ITEMS.filter((item) => item.tags.includes(activeFilter as Tag))

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">DEA &amp; Cannabis Regulation Briefing</h1>
        <p className="text-muted-foreground mt-1">
          Tracking federal DEA rescheduling, hemp-definition changes, and IRS/tax developments —
          with concentrated focus on Oklahoma (OMMA, OBNDD/OBN) and commercial cultivation
          facilities.
        </p>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Last updated: {formatLastUpdated(data.lastUpdated)}
        </p>
      </div>

      {/* ── Key Deadlines Panel ─────────────────────────────────────── */}
      <Card className="border-amber-300 dark:border-amber-700 border-l-4 border-l-amber-500">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-bold uppercase tracking-widest">
            <AlertTriangle className="h-4 w-4" />
            Key Deadlines &amp; Time-Sensitive Dates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.keyDeadlines.map((dl) => (
              <div
                key={dl.id}
                className={cn(
                  'flex gap-2.5 rounded-md border p-3',
                  dl.urgency === 'urgent'
                    ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                    : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                )}
              >
                <div
                  className={cn(
                    'mt-1.5 h-2 w-2 rounded-full flex-shrink-0',
                    dl.urgency === 'urgent' ? 'bg-red-600' : 'bg-amber-500'
                  )}
                />
                <div className="space-y-0.5">
                  <p
                    className={cn(
                      'text-xs font-bold',
                      dl.urgency === 'urgent'
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-amber-700 dark:text-amber-400'
                    )}
                  >
                    {dl.date}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{dl.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Filter Tabs ──────────────────────────────────────────────── */}
      <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as FilterKey)}>
        <TabsList className="flex-wrap h-auto gap-1">
          {FILTER_TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5">
              {tab.label}
              <span className="inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums min-w-[18px]">
                {getCount(tab.key)}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* ── Briefing Item Cards ──────────────────────────────────────── */}
      {filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No briefing items match the selected filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <BriefingCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* ── Footer Disclaimer ────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground border-t pt-4 leading-relaxed">
        <strong className="font-semibold">Disclaimer:</strong> This briefing is an automated news
        summary for informational purposes only and is not legal or tax advice. Verify all dates and
        requirements against official sources before acting. Regulatory status may change; items
        marked &ldquo;Pending&rdquo; are not yet law.
      </p>
    </div>
  )
}

// ── BriefingCard sub-component ────────────────────────────────────────────────

function BriefingCard({ item }: { item: BriefingItem }) {
  const hasOklahoma = item.tags.includes('oklahoma')
  const hasDeadline = item.tags.includes('deadline')

  // Format ISO date (YYYY-MM-DD) to display string
  const displayDate = (() => {
    const [year, month, day] = item.date.split('-').map(Number)
    const d = new Date(year, month - 1, day)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  })()

  return (
    <Card
      className={cn(
        'flex flex-col border-l-4',
        hasDeadline
          ? 'border-l-red-500'
          : hasOklahoma
          ? 'border-l-emerald-500'
          : 'border-l-blue-500'
      )}
    >
      <CardContent className="flex flex-col flex-1 gap-3 p-4">
        {/* Top row: tags + date */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className={cn(
                  'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5',
                  TAG_CLASSES[tag]
                )}
              >
                {TAG_LABELS[tag]}
              </Badge>
            ))}
          </div>
          <Badge variant="secondary" className="flex-shrink-0 text-[10px] gap-1 whitespace-nowrap">
            <Calendar className="h-2.5 w-2.5" />
            {displayDate}
          </Badge>
        </div>

        {/* Headline */}
        <h3 className="font-bold text-sm leading-snug">{item.headline}</h3>

        {/* Summary */}
        <p className="text-xs text-muted-foreground leading-relaxed">{item.summary}</p>

        {/* Why it matters */}
        <div
          className={cn(
            'border-l-2 pl-3 py-1 rounded-r text-xs text-muted-foreground leading-relaxed bg-muted/50',
            hasDeadline
              ? 'border-l-red-500'
              : hasOklahoma
              ? 'border-l-emerald-500'
              : 'border-l-blue-400'
          )}
        >
          <span
            className={cn(
              'font-semibold',
              hasDeadline
                ? 'text-red-700 dark:text-red-400'
                : hasOklahoma
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-blue-700 dark:text-blue-400'
            )}
          >
            Why it matters:{' '}
          </span>
          {item.whyItMatters}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Source link(s) */}
        <div className="flex items-center justify-between border-t pt-3 mt-1">
          <span className="text-[10px] text-muted-foreground font-medium">Source</span>
          <div className="flex items-center gap-3">
            {item.secondarySource && (
              <a
                href={item.secondarySource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:underline"
              >
                {item.secondarySource.name}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <a
              href={item.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              {item.source.name}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
