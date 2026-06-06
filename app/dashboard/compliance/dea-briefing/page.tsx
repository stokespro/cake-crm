'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertTriangle, ExternalLink, Calendar, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

type Tag = 'federal' | 'oklahoma' | 'cultivation' | 'deadline' | 'pending'

interface BriefingItem {
  id: number
  headline: string
  date: string
  summary: string
  whyItMatters: string
  sourceUrl: string
  sourceLabel: string
  tags: Tag[]
}

interface DeadlineItem {
  date: string
  description: string
  urgent: boolean
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

// ── Key Deadlines data ────────────────────────────────────────────────────────

const KEY_DEADLINES: DeadlineItem[] = [
  {
    date: '~ June 26–27, 2026 — URGENT',
    description:
      'DEA expedited 60-day registration window closes. Apply within 60 days of the April 28 Federal Register publication to keep operating during the six-month DEA review. Applies to all medical operators: cultivators, processors, labs, distributors, dispensaries.',
    urgent: true,
  },
  {
    date: '~ June 27, 2026 — URGENT (Oklahoma)',
    description:
      'OBNDD deadline for OMMA manufacturers & distributors to file for DEA registration. Failure may result in OBNDD administrative sanctions including revocation of the OBNDD registration that underpins OMMA grower licenses.',
    urgent: true,
  },
  {
    date: 'June 29 – July 15, 2026',
    description:
      'Broader-rescheduling ALJ hearing (DEA Arlington, VA). Determines whether adult-use marijuana also moves to Schedule III. July 3 recess included.',
    urgent: false,
  },
  {
    date: 'August 1, 2026',
    description:
      'Oklahoma new-license moratorium currently expires. HB 3143 (pending Senate) would extend it to August 1, 2028, with a companion 2,500-license cap on cultivation (HB 3144).',
    urgent: false,
  },
  {
    date: 'November 12, 2026',
    description:
      'Federal hemp redefinition takes effect: 0.3% total-THC threshold (includes THCA); final-product cap 0.4 mg THC; synthetics excluded. Delta-8 / Delta-10 / THCA-flower market effectively eliminated unless reformulated.',
    urgent: false,
  },
  {
    date: 'January 1, 2027',
    description:
      'OBNDD enforcement grace period ends. Oklahoma operators without DEA registration by this date face active OBNDD administrative sanctions, regardless of whether they applied before the June 27 window.',
    urgent: false,
  },
]

// ── Briefing items data (20 items) ────────────────────────────────────────────

const BRIEFING_ITEMS: BriefingItem[] = [
  // ── Priority: Most urgent first ─────────────────────────────────────────

  {
    id: 1,
    headline: 'DEA Reschedules State Medical Marijuana & FDA-Approved Products to Schedule III',
    date: 'Apr 28, 2026',
    summary:
      'Acting AG Todd Blanche issued a final order moving (1) marijuana in FDA-approved drug products and (2) marijuana under a qualifying state medical license from Schedule I to Schedule III, using treaty-implementation authority (21 U.S.C. 811(d)(1)) without traditional notice-and-comment. Recreational/adult-use, unlicensed marijuana, and synthetically derived THC remain Schedule I. A parallel expedited rulemaking on broader rescheduling was simultaneously initiated.',
    whyItMatters:
      'Most consequential federal cannabis action in decades — creates new DEA registration duties, 280E tax relief, and treaty-compliance obligations for thousands of operators.',
    sourceUrl:
      'https://www.justice.gov/opa/pr/justice-department-places-fda-approved-marijuana-products-and-products-containing-marijuana',
    sourceLabel: 'DOJ Press Release',
    tags: ['federal'],
  },
  {
    id: 2,
    headline:
      'DEA Registration Now Required for Medical Marijuana Operators — Expedited Window Closes ~June 26, 2026',
    date: '~ Jun 26, 2026',
    summary:
      'State-licensed medical operators must obtain DEA Schedule III registration. The dispensary portal opened April 29; manufacturer, cultivator, lab, and distributor forms were announced May 11, 2026. Filing within 60 days of the April 28 Federal Register publication lets operators keep running under state license during a committed six-month DEA review. Annual fees: manufacturers $3,699; distributors $1,850; dispensers $888 per three-year registration. Applications require SSNs for all staff with controlled-substance access, upstream supplier DEA numbers, security documentation, and SOPs.',
    whyItMatters:
      'Every operator — cultivator, processor, lab, distributor, dispensary — now faces a federal registration obligation that did not previously exist; missing the window risks shutdown during review.',
    sourceUrl:
      'https://www.marijuanamoment.net/dea-announces-new-marijuana-registration-forms-for-manufacturing-distribution-and-testing-businesses/',
    sourceLabel: 'Marijuana Moment',
    tags: ['federal', 'deadline'],
  },
  {
    id: 11,
    headline:
      'OBNDD Mandates DEA Registration for OMMA Manufacturers & Distributors — Deadline ~June 27; Grace Period to Jan 1, 2027',
    date: 'May 8, 2026',
    summary:
      'OBNDD Director Donnie Anderson directed that every OMMA registrant who is a "distributor or manufacturer" must obtain federal DEA registration. Applying within 60 days of the April 28 publication (~June 27, 2026) lets a business keep operating under state authority during DEA\'s six-month review. Anderson warned that failure "could result in OBNDD administrative sanctions up to and including the potential revocation" of OBNDD registrations, with an enforcement grace period running until January 1, 2027. The DEA application has seven sections and costs approximately $794.',
    whyItMatters:
      'OBNDD\'s requirement reaches ALL licensed manufacturers (growers) and distributors, not just dispensaries; growers who miss it risk losing the OBNDD manufacturer registration that underpins their OMMA grower license.',
    sourceUrl:
      'https://www.marijuanamoment.net/oklahoma-officials-say-medical-marijuana-businesses-must-register-with-federal-dea-to-avoid-punishment/',
    sourceLabel: 'Marijuana Moment',
    tags: ['oklahoma', 'deadline'],
  },
  {
    id: 13,
    headline:
      'Oklahoma House Passes Moratorium Extension to 2028 (HB 3143) and 2,500 Grower-License Cap (HB 3144)',
    date: 'Feb 26, 2026',
    summary:
      'The Oklahoma House passed HB 3143 (82–8) to extend the new-license moratorium — currently expiring August 1, 2026 — to August 1, 2028, and HB 3144 (82–15) to cap total cultivation licenses at 2,500 statewide. At passage Oklahoma had 2,164 active grows, 686 processors, 1,421 dispensaries, and 58 transporters. The moratorium applies only to new licenses; existing licensees in good standing may still expand or buy/transfer licenses with OMMA approval. Both bills are pending in the Senate.',
    whyItMatters:
      'If enacted, new cultivation licenses stay frozen two more years and the 2,500 cap makes existing grow licenses scarce, more valuable transferable assets.',
    sourceUrl:
      'https://www.marijuanamoment.net/oklahoma-lawmakers-vote-to-extend-medical-marijuana-business-license-moratorium',
    sourceLabel: 'Marijuana Moment',
    tags: ['oklahoma', 'cultivation', 'deadline'],
  },

  // ── Federal / DEA items ─────────────────────────────────────────────────

  {
    id: 3,
    headline:
      'Schedule III + Single Convention Activates Five New Compliance Burdens for Cultivators',
    date: 'Apr 28, 2026',
    summary:
      'Because the rescheduling order is grounded in treaty-implementation authority, it increases — not reduces — cultivator compliance burdens: (1) SSNs for all personnel with controlled-substance access; (2) disclosure of upstream supplier DEA numbers; (3) DEA on-demand unscheduled inspection authority; (4) a crop purchase-and-resale mechanism where DEA serves as exclusive purchaser at a nominal price before crops can leave the facility; (5) parallel federal recordkeeping including quota reporting and import/export permits. The 2026 cultivator administrative fee is $113/kg on the 6,675 kg aggregate quota.',
    whyItMatters:
      'Operators who assumed "rescheduling = deregulation" face a compliance shock; the DEA purchase-resale mechanism restructures the cultivation supply chain.',
    sourceUrl: 'https://cannabistech.com/articles/dea-registration-medical-cannabis/',
    sourceLabel: 'Cannabis Tech',
    tags: ['federal', 'cultivation'],
  },
  {
    id: 6,
    headline: 'Multiple Legal Challenges Filed in D.C. Circuit to Vacate Rescheduling',
    date: 'May–Jun 2026',
    summary:
      'Three consolidated petition sets challenge the April 23 order: (1) Smart Approaches to Marijuana (SAM) + NDASA, filed May 4; (2) AGs of Nebraska and Indiana, filed May 22; (3) MMJ International Holdings, addiction physicians, and CIVEL, filed May 28. A state lawsuit was reported June 4, 2026. Arguments include: exceeds AG authority, violates APA notice-and-comment, implicates the major questions doctrine, and relies on a possibly unconstitutional ALJ structure. Petitioners seek both a stay and full vacatur.',
    whyItMatters:
      'A stay could freeze the entire order — reverting state medical marijuana to Schedule I and nullifying registration, 280E relief, and research expansion.',
    sourceUrl:
      'https://norml.org/news/2026/06/04/republican-led-states-file-lawsuit-to-overturn-cannabis-rescheduling-decision',
    sourceLabel: 'NORML',
    tags: ['federal'],
  },
  {
    id: 5,
    headline: 'Broader-Rescheduling ALJ Hearing Set for June 29 – July 15, 2026',
    date: 'Jun 29, 2026',
    summary:
      'Alongside the partial rescheduling, DEA withdrew its stalled August 2024 proceeding and issued a new Notice of Hearing for an expedited ALJ proceeding on whether ALL marijuana — including adult-use — should move to Schedule III via notice-and-comment rulemaking. The hearing runs June 29 – July 15, 2026 (July 3 recess) at DEA\'s Arlington, VA facility.',
    whyItMatters:
      'Determines whether recreational marijuana joins medical in Schedule III; any final rule would also be subject to a Congressional Review Act challenge.',
    sourceUrl:
      'https://www.gibsondunn.com/dea-downschedules-state-medical-marijuana-to-schedule-iii-expedited-hearing-set-to-consider-broader-rescheduling/',
    sourceLabel: 'Gibson Dunn',
    tags: ['federal', 'deadline'],
  },
  {
    id: 4,
    headline: '280E Tax Deduction Bar Lifted for Medical Operators — Retroactive Relief Uncertain',
    date: 'Apr 28, 2026',
    summary:
      'State-licensed medical marijuana is no longer Schedule I/II, so operators are no longer subject to the IRC Section 280E deduction disallowance. Treasury/IRS guidance announced April 23, 2026 is forthcoming and expected to treat rescheduling as applying for the full 2026 tax year. No retroactive relief for prior years has been announced; recreational-only operators remain fully subject to 280E.',
    whyItMatters:
      'Potentially tens of millions in aggregate annual tax savings for medical operators; dual-use states face apportionment questions still unresolved.',
    sourceUrl: 'https://home.treasury.gov/news/press-releases/sb0471',
    sourceLabel: 'U.S. Treasury',
    tags: ['federal'],
  },
  {
    id: 8,
    headline: 'Congress Closes the Hemp Loophole — Delta-8 / THCA / Synthetics Banned Effective Nov 12, 2026',
    date: 'Nov 12, 2026',
    summary:
      'The Continuing Appropriations and Extensions Act, 2026 (H.R. 5371 §781), enacted November 12, 2025, rewrote the federal hemp definition: the 0.3% THC threshold now counts total THC including THCA; final consumable products are capped at 0.4 mg total THC per container; intermediates are capped at 0.3% total THC dry-weight post-decarboxylation; cannabinoids not naturally produced by the plant or synthesized outside it are excluded and treated as Schedule I. Products exceeding thresholds after November 12, 2026 revert to Schedule I.',
    whyItMatters:
      'Functionally eliminates the current Delta-8/Delta-10/THCA-flower intoxicating-hemp market unless reformulated or Congress acts before the effective date.',
    sourceUrl:
      'https://www.arnoldporter.com/en/perspectives/advisories/2025/12/major-changes-to-federal-regulation-of-hemp-derived-products',
    sourceLabel: 'Arnold & Porter Advisory',
    tags: ['federal', 'deadline'],
  },
  {
    id: 9,
    headline: 'FDA Misses Statutory Deadline to Publish Cannabinoid Lists — Compliance Void Continues',
    date: 'Deadline: Feb 10, 2026',
    summary:
      'The November 2025 hemp law required FDA to publish four lists within 90 days: naturally produced cannabinoids; naturally occurring THC-class cannabinoids; THC-similar cannabinoids; and the definition of a "container." FDA missed the February 10, 2026 deadline and, as of early June 2026, had not published. The synthetic-exclusion turns on whether a cannabinoid is "naturally produced," a determination only FDA can make.',
    whyItMatters:
      'Without the lists, producers, retailers, and law enforcement lack a definitive line between legal hemp and Schedule I — industry is reformulating blind.',
    sourceUrl:
      'https://www.marijuanamoment.net/fda-misses-deadline-to-publish-cannabinoid-list-and-define-hemp-containers-drawing-industry-criticism/',
    sourceLabel: 'Marijuana Moment',
    tags: ['federal'],
  },
  {
    id: 7,
    headline: 'Trump Executive Order Directs Expedited Rescheduling to Schedule III',
    date: 'Dec 18, 2025',
    summary:
      'The EO "Increasing Medical Marijuana and Cannabidiol Research" directed the AG to complete rescheduling to Schedule III "in the most expeditious manner," and tasked HHS, FDA, CMS, and NIH with real-world evidence research models for hemp-derived cannabinoids. It reactivated a process that had stalled through most of 2025.',
    whyItMatters:
      'This executive order triggered the April 2026 DEA final order within four months, establishing the legal and political context for the entire current rescheduling framework.',
    sourceUrl:
      'https://www.whitehouse.gov/presidential-actions/2025/12/increasing-medical-marijuana-and-cannabidiol-research/',
    sourceLabel: 'White House EO',
    tags: ['federal'],
  },
  {
    id: 10,
    headline: 'SAFER Banking Stalled — Rescheduling Does Not Fix Cannabis Banking',
    date: 'Ongoing 2026',
    summary:
      'SAFER Banking has passed the House and cleared Senate Banking Committee but has no scheduled Senate floor vote in the 119th Congress. Rescheduling to Schedule III does not by itself fix banking: it doesn\'t change FinCEN guidance or BSA/AML obligations, doesn\'t make marijuana FDA-approved, and doesn\'t remove SAR-filing requirements.',
    whyItMatters:
      'Newly Schedule III-compliant medical operators still face limited banking, card processing, and SBA-loan access; the industry remains cash-heavy despite the historic rescheduling.',
    sourceUrl:
      'https://www.cannabisbusinesstimes.com/business-issues-benchmarks/safe-banking-act/news/15825992/safe-banking-act-nowhere-to-be-found-in-wake-of-schedule-iii-cannabis-order',
    sourceLabel: 'Cannabis Business Times',
    tags: ['federal'],
  },

  // ── Oklahoma items ──────────────────────────────────────────────────────

  {
    id: 12,
    headline: 'OMMA Monitors Rescheduling & Confirms 280E Relief Applies Regardless of DEA Registration Status',
    date: 'May 6, 2026',
    summary:
      'OMMA\'s official notice confirms it is monitoring DEA rescheduling, that approximately 4,000 OMMA licensees are affected, and that 280E removal applies to Oklahoma medical operators regardless of whether a licensee pursues DEA registration. OMMA cautioned that all information "remains subject to change pending petition outcomes" — a reference to the consolidated D.C. Circuit litigation.',
    whyItMatters:
      'Oklahoma operators get federal tax relief now, but the pending lawsuits are the key wildcard that could reverse it.',
    sourceUrl:
      'https://oklahoma.gov/omma/about/news/2026/update-omma-monitors-dea-rescheduling-status-shares-recently-filed-lawsuit.html',
    sourceLabel: 'OMMA Official Notice',
    tags: ['oklahoma'],
  },
  {
    id: 14,
    headline: 'SB 1066: Physicians Must Register With OMMA to Recommend — Effective Jan 1, 2026',
    date: 'Jan 1, 2026',
    summary:
      'Physicians must complete a state-approved continuing education course and register with OMMA before issuing recommendations; they must stay in good standing, follow standards of care, and not operate from a dispensary location including virtual. Patient applications with an unregistered physician\'s signature are rejected as of January 1, 2026. Recommendations signed before December 31, 2025 remain valid for their 30-day window.',
    whyItMatters:
      'A new bottleneck in the patient pipeline that can affect dispensary and grow sales volume if physician supply does not keep pace with registration requirements.',
    sourceUrl:
      'https://oklahoma.gov/omma/about/news/2026/reminder-physician-medical-marijuana-recommendation-requirements-now-in-effect.html',
    sourceLabel: 'OMMA Physician Reminder',
    tags: ['oklahoma'],
  },
  {
    id: 20,
    headline: 'State Question 837 (Adult-Use Legalization) Failed to Qualify for 2026 Ballot',
    date: 'Nov 3, 2025',
    summary:
      'The "Oklahoma Responsible Cannabis Act" would have legalized adult-use for 21+, set a 10% sales tax (eliminating the 7% medical tax), allowed home grow up to 12 plants, and added privacy/anti-discrimination protections. It needed 172,993 valid signatures by November 3, 2025; petitioners did not submit signature sheets by the deadline, so it will not appear on the November 3, 2026 ballot. Law-enforcement opposition — including from OBNDD Director Anderson — was a significant headwind.',
    whyItMatters:
      'Oklahoma stays medical-only through at least 2026, preserving the current market structure that cultivators operate within.',
    sourceUrl:
      'https://ballotpedia.org/Oklahoma_State_Question_837,_Marijuana_Legalization_Initiative_(2026)',
    sourceLabel: 'Ballotpedia',
    tags: ['oklahoma'],
  },
  {
    id: 16,
    headline: 'OMMA Enforcement: 6,000+ Inspections, 1,400+ Administrative Cases, 704 Products Recalled',
    date: 'Feb 17, 2026',
    summary:
      'OMMA reported 6,000+ compliance inspections, 1,400+ administrative cases, and 704 products recalled through June 2024. A February 17, 2026 update reported 17 more administrative actions in three weeks, embargoing thousands of unregulated plants and products. Enforcement targets include secret-shopping 50 dispensaries and testing 100+ samples per month at OMMA\'s QA Reference Lab.',
    whyItMatters:
      'OMMA is in an active enforcement posture; growers and processors should treat Metrc accuracy, labeling, and credentialing as live enforcement priorities, not administrative formalities.',
    sourceUrl:
      'https://oklahoma.gov/omma/about/news/2026/continued-progress-recent-administrative-actions.html',
    sourceLabel: 'OMMA Admin Actions Update',
    tags: ['oklahoma'],
  },

  // ── Cultivation-specific items ──────────────────────────────────────────

  {
    id: 17,
    headline:
      'Oklahoma Grower License: Current Compliance Stack — Metrc, OBNDD Registration, 75% Residency, $50K Bond',
    date: 'Current — Jun 2026',
    summary:
      'Commercial growers must comply with OMMA rules and hold an OBNDD "Manufacturer" registration. Key requirements: ≥75% Oklahoma-resident ownership; owners ≥25 years old; background checks (nonviolent felony within 2 yrs / any felony within 5 yrs disqualifying); $50,000 surety bond or 5+ years land ownership; not within 1,000 ft of a school; outdoor growers register with the Oklahoma Department of Agriculture; active Metrc seed-to-sale tracking (tags at vegetative stage, movements reported within 24 hrs, sales pushed to Metrc same day). Tier-1 fees range $2,558.30 to $50,000+ by canopy size.',
    whyItMatters:
      'The 75% residency rule is the main anti-foreign-ownership mechanism; post-moratorium applicants will face all of this plus the new DEA registration layer.',
    sourceUrl: 'https://oklahoma.gov/omma/businesses/commercial-licenses/grower-license.html',
    sourceLabel: 'OMMA Grower License',
    tags: ['oklahoma', 'cultivation'],
  },
  {
    id: 18,
    headline: 'Illegal-Grow Crackdown: 51-Defendant Federal Indictment; 1.7M+ Plants Seized Since 2021',
    date: 'Apr 27, 2026',
    summary:
      'A multi-agency task force (Oklahoma AG Organized Crime Task Force, OBN/OBNDD, OMMA, ICE/HSI, Cherokee Nation Marshals, National Guard) targets illegal grows, many linked to Chinese nationals. A June 24, 2025 Craig/Mayes County operation seized 40,723 plants and 1,000+ lbs of processed marijuana. In April 2026 a DEA-led Homeland Security Task Force announced a 51-defendant federal indictment over a nationwide black-market conspiracy originating in Oklahoma. OBNDD Director Anderson testified that product from ~85 million plants is unaccounted for. Since 2021: 1.7 million illegal plants seized, 181,000 lbs confiscated, 302 arrests.',
    whyItMatters:
      'Licensed growers compete against massive illegal supply, and OMMA agents are embedded in the criminal task force — administrative investigative powers are being used in prosecutions.',
    sourceUrl:
      'https://www.dea.gov/press-releases/2026/04/27/homeland-security-task-force-investigation-results-51-defendant',
    sourceLabel: 'DEA Press Release',
    tags: ['oklahoma', 'cultivation'],
  },
  {
    id: 15,
    headline:
      'HB 2807: Mandatory Pre-Packaging of All Flower — Effective June 1, 2025; Grace Period Ended Nov 1, 2025',
    date: 'Jun 1, 2025',
    summary:
      'All flower-based products — flower, trim, shake, kief — must be sold to dispensaries pre-packaged in units of 0.5 g to 3 oz, packaged at the grower or processor level before reaching the dispensary floor. Deli-style inventory received before June 1, 2025 had to be sold, transferred, or wasted by November 1, 2025.',
    whyItMatters:
      'A direct operational mandate for cultivators and processors — packaging equipment, materials, labeling, and Metrc tagging at the grow/processing stage are now prerequisites for a legal transfer.',
    sourceUrl: 'https://oklahoma.gov/omma/businesses/pre-pack.html',
    sourceLabel: 'OMMA Pre-Pack Rules',
    tags: ['oklahoma', 'cultivation'],
  },
  {
    id: 19,
    headline:
      'HB 3519 & SB 640: New Land-Reclamation Fee and Cleanup Mandates for Growers (PENDING — Not Yet Law)',
    date: '2026 Session',
    summary:
      'HB 3519 would require grower applicants to pay a $2,000 land-reclamation fee, create a remediation revolving fund, exempt applicants who have owned the land 5+ years, and eliminate the $50,000 surety-bond requirement. SB 640 (Sen. Cynthia Roe) would require all licensed businesses to remove surface trash/waste and complete cleanup within 30 days after a license is revoked, expires, or goes inactive — or the property becomes a public nuisance subject to abatement, with fines of $5,000 then $25,000. Both bills are pending and NOT YET LAW.',
    whyItMatters:
      'Changes the cost calculus for license transfers and surrenders — growers must budget for remediation or face nuisance designation; the bond elimination partially offsets the new fee.',
    sourceUrl: 'https://oklahoma.gov/omma/rules-and-legislation/legislative-updates.html',
    sourceLabel: 'OMMA Legislative Updates',
    tags: ['oklahoma', 'cultivation', 'pending'],
  },
]

// ── Filter tab config ─────────────────────────────────────────────────────────

type FilterKey = 'all' | Tag

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'federal', label: 'Federal / DEA' },
  { key: 'oklahoma', label: 'Oklahoma' },
  { key: 'cultivation', label: 'Cultivation' },
  { key: 'deadline', label: 'Deadlines' },
]

// ── Helper to get count per filter ───────────────────────────────────────────

function getCount(key: FilterKey): number {
  if (key === 'all') return BRIEFING_ITEMS.length
  return BRIEFING_ITEMS.filter((item) => item.tags.includes(key as Tag)).length
}

// ── Page component ────────────────────────────────────────────────────────────

export default function DeaBriefingPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')

  const filteredItems =
    activeFilter === 'all'
      ? BRIEFING_ITEMS
      : BRIEFING_ITEMS.filter((item) => item.tags.includes(activeFilter as Tag))

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
          Current as of June 6, 2026
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
            {KEY_DEADLINES.map((dl, i) => (
              <div
                key={i}
                className={cn(
                  'flex gap-2.5 rounded-md border p-3',
                  dl.urgent
                    ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                    : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                )}
              >
                <div
                  className={cn(
                    'mt-1.5 h-2 w-2 rounded-full flex-shrink-0',
                    dl.urgent ? 'bg-red-600' : 'bg-amber-500'
                  )}
                />
                <div className="space-y-0.5">
                  <p
                    className={cn(
                      'text-xs font-bold',
                      dl.urgent
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
            {item.date}
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

        {/* Source link */}
        <div className="flex items-center justify-between border-t pt-3 mt-1">
          <span className="text-[10px] text-muted-foreground font-medium">Source</span>
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            {item.sourceLabel}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  )
}
