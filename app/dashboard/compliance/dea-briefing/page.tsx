'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertTriangle,
  ExternalLink,
  Calendar,
  Clock,
  ShieldCheck,
  AlertCircle,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import briefingData from './briefings.json'

// ── Types ────────────────────────────────────────────────────────────────────

type Tag = 'federal' | 'oklahoma' | 'cultivation' | 'deadline' | 'pending' | 'dispensary'
type Urgency = 'urgent' | 'standard'
type StatusLevel = 'live' | 'pending' | 'blocked'

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

interface RegistrationTrack {
  audience: string
  status: string
  statusLevel: StatusLevel
  detail: string
  sources: BriefingSource[]
}

interface DeaRegistrationStatus {
  lastVerified: string
  headline: string
  tracks: RegistrationTrack[]
  expeditedWindow: string
  caution: string
  officialSources: BriefingSource[]
}

interface DiscourseItem {
  id: string
  headline: string
  claim: string
  caution: string
  source: BriefingSource
  date: string
}

interface BriefingData {
  lastUpdated: string
  deaRegistrationStatus: DeaRegistrationStatus
  discourse: DiscourseItem[]
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
  dispensary:
    'bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200 border-violet-200 dark:border-violet-800',
}

const TAG_LABELS: Record<Tag, string> = {
  federal: 'Federal / DEA',
  oklahoma: 'Oklahoma',
  cultivation: 'Cultivation',
  deadline: 'Deadline',
  pending: 'Pending',
  dispensary: 'Dispensary',
}

// ── Status level badge colors ─────────────────────────────────────────────────

function statusBadgeClasses(level: StatusLevel): string {
  switch (level) {
    case 'live':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700'
    case 'pending':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border-amber-300 dark:border-amber-700'
    case 'blocked':
      return 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200 border-red-300 dark:border-red-700'
  }
}

function statusBadgeLabel(level: StatusLevel): string {
  switch (level) {
    case 'live':
      return 'LIVE'
    case 'pending':
      return 'PENDING'
    case 'blocked':
      return 'BLOCKED'
  }
}

// ── Filter tab config ─────────────────────────────────────────────────────────

type FilterKey = 'all' | 'dea-registration' | 'cultivation' | 'dispensary' | 'deadline' | 'watch'

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'dea-registration', label: 'DEA Registration' },
  { key: 'cultivation', label: 'Cultivators & Mfg' },
  { key: 'dispensary', label: 'Dispensaries' },
  { key: 'deadline', label: 'Deadlines' },
  { key: 'watch', label: 'Watch' },
]

// ── Sort items: date descending ───────────────────────────────────────────────

const SORTED_ITEMS = [...data.items].sort(
  (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
)

// ── Helper to get count per filter ───────────────────────────────────────────

function getCount(key: FilterKey): number | null {
  switch (key) {
    case 'all':
      return data.items.length
    case 'dea-registration':
      return data.items.filter(
        (item) => item.tags.includes('federal') && item.tags.includes('deadline')
      ).length
    case 'cultivation':
      return data.items.filter((item) => item.tags.includes('cultivation')).length
    case 'dispensary':
      return data.items.filter((item) => item.tags.includes('dispensary')).length
    case 'deadline':
      return data.items.filter((item) => item.tags.includes('deadline')).length
    case 'watch':
      return data.discourse.length
  }
}

// ── Filter items for each tab ─────────────────────────────────────────────────

function filterItems(key: FilterKey): BriefingItem[] {
  switch (key) {
    case 'all':
      return SORTED_ITEMS
    case 'dea-registration':
      return SORTED_ITEMS.filter(
        (item) => item.tags.includes('federal') && item.tags.includes('deadline')
      )
    case 'cultivation':
      return SORTED_ITEMS.filter((item) => item.tags.includes('cultivation'))
    case 'dispensary':
      return SORTED_ITEMS.filter((item) => item.tags.includes('dispensary'))
    case 'deadline':
      return SORTED_ITEMS.filter((item) => item.tags.includes('deadline'))
    case 'watch':
      return []
  }
}

// ── Page component ────────────────────────────────────────────────────────────

export default function DeaBriefingPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')

  const filteredItems = filterItems(activeFilter)
  const showKeyDeadlines = activeFilter !== 'watch'
  const showDiscourse = activeFilter === 'watch' || activeFilter === 'all'
  const showVerifiedItems = activeFilter !== 'watch'

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

      {/* ── DEA Registration Status Panel ───────────────────────────── */}
      <DeaRegistrationPanel status={data.deaRegistrationStatus} />

      {/* ── Key Deadlines Panel ─────────────────────────────────────── */}
      {showKeyDeadlines && (
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
      )}

      {/* ── Filter Tabs ──────────────────────────────────────────────── */}
      <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as FilterKey)}>
        <TabsList className="flex-wrap h-auto gap-1 overflow-x-auto">
          {FILTER_TABS.map((tab) => {
            const count = getCount(tab.key)
            return (
              <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5 whitespace-nowrap">
                {tab.key === 'watch' && <Eye className="h-3 w-3" />}
                {tab.label}
                {count !== null && (
                  <span className="inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums min-w-[18px]">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      {/* ── Verified Briefing Item Cards ─────────────────────────────── */}
      {showVerifiedItems && (
        <>
          {filteredItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No briefing items match the selected filter.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredItems.map((item) => (
                <BriefingCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Watch / Discourse Section ─────────────────────────────────── */}
      {showDiscourse && <DiscourseSection items={data.discourse} />}

      {/* ── Footer Disclaimer ────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground border-t pt-4 leading-relaxed">
        <strong className="font-semibold">Disclaimer:</strong> This briefing is an automated news
        summary for informational purposes only and is not legal or tax advice. Verify all dates and
        requirements against official sources before acting. Regulatory status may change; items
        marked &ldquo;Pending&rdquo; are not yet law.{' '}
        <strong className="font-semibold">Watch section:</strong> Items in the Watch / Discourse
        section are unverified consultant claims and community conversation — they are not official
        guidance and have not been independently confirmed.
      </p>
    </div>
  )
}

// ── DEA Registration Status Panel ─────────────────────────────────────────────

function DeaRegistrationPanel({ status }: { status: DeaRegistrationStatus }) {
  return (
    <Card className="border-2 border-blue-400 dark:border-blue-600 shadow-md">
      <CardHeader className="pb-4 bg-blue-50 dark:bg-blue-950/40 rounded-t-lg border-b border-blue-200 dark:border-blue-800">
        <CardTitle className="flex items-center gap-2.5 text-blue-800 dark:text-blue-200 text-base font-bold uppercase tracking-wider">
          <ShieldCheck className="h-5 w-5 flex-shrink-0" />
          {status.headline}
        </CardTitle>
        <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-1">
          <Clock className="h-3 w-3" />
          Official status verified: {status.lastVerified}
        </p>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* ── Two track columns ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {status.tracks.map((track) => (
            <div
              key={track.audience}
              className={cn(
                'rounded-lg border p-4 space-y-3',
                track.statusLevel === 'live'
                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-700'
                  : track.statusLevel === 'blocked'
                  ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-700'
                  : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-700'
              )}
            >
              {/* Audience + status badge */}
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-sm leading-snug">{track.audience}</p>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 flex-shrink-0',
                    statusBadgeClasses(track.statusLevel)
                  )}
                >
                  {statusBadgeLabel(track.statusLevel)}
                </Badge>
              </div>

              {/* Status summary line */}
              <p className="text-xs font-semibold text-foreground">{track.status}</p>

              {/* Detail text */}
              <p className="text-xs text-muted-foreground leading-relaxed">{track.detail}</p>

              {/* Source links */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-current/10">
                {track.sources.map((src) => (
                  <a
                    key={src.url}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    {src.name}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Expedited window callout ── */}
        <div className="flex gap-2.5 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed font-medium">
            {status.expeditedWindow}
          </p>
        </div>

        {/* ── Caution block ── */}
        <div className="flex gap-2.5 rounded-md border border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-950/50 p-3">
          <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-300 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Compliance Director Caution
            </p>
            <p className="text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
              {status.caution}
            </p>
          </div>
        </div>

        {/* ── Official sources row ── */}
        <div className="border-t pt-3 flex flex-wrap gap-x-4 gap-y-1 items-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Official Sources
          </span>
          {status.officialSources.map((src) => (
            <a
              key={src.url}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 dark:text-blue-400 hover:underline"
            >
              {src.name}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Watch / Discourse Section ──────────────────────────────────────────────────

function DiscourseSection({ items }: { items: DiscourseItem[] }) {
  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-3 border-b-2 border-dashed border-zinc-300 dark:border-zinc-600 pb-3">
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-base font-bold text-zinc-700 dark:text-zinc-300">
            Watch — Unverified Discourse
          </h2>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600"
        >
          UNVERIFIED
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed -mt-1">
        Consultant claims and community conversation.{' '}
        <strong className="text-amber-700 dark:text-amber-400">
          UNVERIFIED — not official guidance;
        </strong>{' '}
        verify against the Registration Status panel and official sources before acting.
      </p>

      {/* Discourse cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((item) => (
          <DiscourseCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}

// ── DiscourseCard sub-component ───────────────────────────────────────────────

function DiscourseCard({ item }: { item: DiscourseItem }) {
  return (
    <Card className="flex flex-col border border-dashed border-amber-400 dark:border-amber-700 bg-zinc-50 dark:bg-zinc-900/60">
      <CardContent className="flex flex-col flex-1 gap-3 p-4">
        {/* Top row: UNVERIFIED badge + date */}
        <div className="flex items-start justify-between gap-2">
          <Badge
            variant="outline"
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 flex-shrink-0"
          >
            UNVERIFIED
          </Badge>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{item.date}</span>
        </div>

        {/* Headline */}
        <h3 className="font-bold text-sm leading-snug text-zinc-800 dark:text-zinc-200">
          {item.headline}
        </h3>

        {/* Being claimed */}
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Being claimed:
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">{item.claim}</p>
        </div>

        {/* Why to be cautious */}
        <div className="border-l-2 border-amber-400 dark:border-amber-600 pl-3 py-1 rounded-r bg-amber-50/60 dark:bg-amber-950/20 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Why to be cautious:
          </p>
          <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            {item.caution}
          </p>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Source link */}
        <div className="flex items-center justify-between border-t border-dashed border-zinc-200 dark:border-zinc-700 pt-3 mt-1">
          <span className="text-[10px] text-muted-foreground font-medium">Source / Context</span>
          <a
            href={item.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:underline"
          >
            {item.source.name}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
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
            {item.tags.map((tag) => {
              const classes = TAG_CLASSES[tag] ?? TAG_CLASSES.pending
              const label = TAG_LABELS[tag] ?? tag
              return (
                <Badge
                  key={tag}
                  variant="outline"
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5',
                    classes
                  )}
                >
                  {label}
                </Badge>
              )
            })}
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
