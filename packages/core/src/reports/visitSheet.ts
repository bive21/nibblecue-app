/**
 * The sheet a parent brings to the pediatrician (PRODUCT_SPEC.md §8 "a clean summary for a paper
 * handoff"; the owner, 2026-09-16: "an info sheet they can bring to pediatricians for them to
 * analyze and see if there is anything concerning").
 *
 * READ THAT SENTENCE AGAIN, BECAUSE IT IS THE WHOLE SAFETY ARGUMENT. *They* analyze. The
 * clinician is the one who decides whether anything here matters; this file's job is to lay the
 * household's own record out in the order a doctor asks for it, completely and without editing.
 * That is why it is allowed to exist at all under CLAUDE.md §2 — it moves no judgment into the
 * app, it moves the FACTS to the person qualified to judge them.
 *
 * SO: NO FLAG, NO COLOR, NO VERDICT, NO ORDERING BY SEVERITY. The difference is narrow and it is
 * everything:
 *
 *   "No dirty diaper logged in 3 days"      is a count of days. It ships.
 *   "3 days without a dirty diaper — this   is a diagnosis and an instruction. It does not,
 *    can indicate constipation; call us"     with a disclaimer or without one.
 *
 *   "38.4 °C, rectal, Tue 15 Sep 21:40"     is a reading. It ships, all of them, in order.
 *   "One reading was high"                   is a clinical threshold. The app does not own one.
 *
 * Every number is a sum, a count, a quotient or an elapsed time over entries the household
 * typed, and every figure carries its sample size and its window so a clinician can weigh it.
 * A gap is stated as "nothing logged", never as "none happened": this is a record of what was
 * WRITTEN DOWN, and §9's own caveat line says so on the sheet itself.
 *
 * The output is DATA — sections of labelled rows — not a rendered document, so the screen, the
 * plain-text share and any later PDF all read from one place and cannot drift apart.
 */
import { foodReport, mealEntriesFrom, responseCounts, type MealEntry } from '../solids/history';
import { agoLabel } from '../today/since';
import type { TodayActivity } from '../today/rows';
import { careRouteLabel } from '../today/careRoute';
import type { DiaperInsight, GrowthMetric, MilkFlowInsight, SleepInsight } from './insights';
import { growthInsight } from './insights';
import type { ReportRange } from './range';
import { inRange } from './series';
import type { ReportStats } from './stats';
import { healthNoteRows } from '../wellbeing/visit';
import { VISIT_NOTE_COPY } from '../wellbeing/copy';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
/** Foods and notes named one by one on the sheet; past this they are counted, never dropped. */
const SOLIDS_NAMED = 12;

export interface VisitRow {
  label: string;
  value: string;
  /** The sample size or the window behind the value, where one exists. */
  note?: string;
  /**
   * A ROW THAT BELONGS TO THE ONE ABOVE IT, drawn indented under it — the foods under "Foods
   * eaten" (the owner, 2026-09-24: "each food is listed in the same format as meals and food
   * eaten, these should be a subcategory of food eaten. so make sure it is tabbed"). Every place
   * the sheet is drawn indents it: the screen, the printable page and the shared text.
   */
  sub?: true;
}

export interface VisitSection {
  key: string;
  title: string;
  rows: VisitRow[];
  /** Shown instead of the rows when the household tracks nothing in this area. */
  empty?: string;
}

export interface VisitSheet {
  title: string;
  /** The child, the window and when it was made — a clinician's first three questions. */
  header: VisitRow[];
  sections: VisitSection[];
  /** The sentence that says what this is and, just as importantly, what it is not. */
  caveat: string;
}

export const VISIT_TITLE = 'Visit summary';

/**
 * The caveat, and it is not boilerplate — it is the sheet's own honesty about two things: that
 * a log is what somebody remembered to write down, and that nothing here has been interpreted.
 */
export const VISIT_CAVEAT =
  'This is a record of what this household logged, added up. Gaps mean nothing was logged, ' +
  'which is not the same as nothing happening. Nothing here has been interpreted or compared ' +
  'to any guideline.';

export interface VisitFormat {
  /** ml → the household's own unit, e.g. `4 oz`. */
  volume: (ml: number) => string;
  /** minutes → `1h 35m`. */
  duration: (minutes: number) => string;
  /** hundredths of a degree Celsius → the household's own scale, e.g. `101.1 °F`. */
  temperature: (cHundredths: number) => string;
  /** canonical grams or millimetres → `4.6 kg`, `55.6 cm`. */
  growth: (metric: GrowthMetric, value: number) => string;
  /** an instant → `Tue, Sep 15, 9:40 PM`. */
  stamp: (ms: number) => string;
  /**
   * an instant → `Sep 15`, in the household's own zone.
   *
   * IT MUST BE DAY-GRANULAR, because the rash row groups by what it returns: two instants on one
   * local day have to format to one string, and it is the only day boundary this file can see —
   * `packages/core` never reads a zone of its own. Two entries a year apart would collide, which
   * is why this is safe today: the range chips top out at a month (`range.ts` keeps `custom` off
   * the list) and the Free history window narrows rather than widens it. If a multi-year custom
   * range is ever added, this needs a year in the key, not a longer cap.
   */
  day: (ms: number) => string;
}

export interface VisitInput {
  childName: string;
  /** `YYYY-MM-DD`, as stored; blank when the household has not given one. */
  birthDate: string;
  ageLabel: string;
  range: ReportRange;
  nowMs: number;
  rows: readonly TodayActivity[];
  /** Growth reads its own longer window (`useReport` says why). */
  growthRows: readonly TodayActivity[];
  stats: ReportStats;
  sleep: SleepInsight;
  milk: MilkFlowInsight;
  diapers: DiaperInsight;
  feedGapMinutes: number | null;
  fmt: VisitFormat;
  /**
   * Every meal this child has had, not only the period's — "first eaten" means first ever
   * (docs/SOLIDS.md §5). Read from `rows` when not given.
   */
  meals?: readonly MealEntry[];
}

const one = (n: number, singular: string, plural = `${singular}s`): string =>
  `${n} ${n === 1 ? singular : plural}`;
const per = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);

/**
 * Whole days since the most recent entry matching a predicate, or null when there is none in
 * the window at all — which is a different fact and must read differently.
 */
export function daysSince(
  rows: readonly TodayActivity[],
  nowMs: number,
  match: (r: TodayActivity) => boolean,
): { days: number; atMs: number } | null {
  let latest: number | null = null;
  for (const r of rows) {
    if (!match(r) || r.startMs > nowMs) continue;
    if (latest === null || r.startMs > latest) latest = r.startMs;
  }
  if (latest === null) return null;
  return { days: Math.floor((nowMs - latest) / DAY), atMs: latest };
}

/**
 * How many days of the list to name before it becomes a wall of dates. Eight fits a line or two
 * on paper and covers a week; a two-year range would otherwise print a paragraph of them.
 */
const RASH_DAYS_NAMED = 8;

/** `2 days ago · Sep 14, 8:05 AM`, or the plain sentence when nothing is on record. */
const sinceRow = (
  label: string,
  hit: { days: number; atMs: number } | null,
  nothing: string,
  fmt: VisitFormat,
  nowMs: number,
): VisitRow =>
  hit === null
    ? { label, value: nothing }
    : {
        label,
        value: hit.days === 0 ? agoLabel(hit.atMs, nowMs) : one(hit.days, 'day ago', 'days ago'),
        note: fmt.stamp(hit.atMs),
      };

export function visitSheet(input: VisitInput): VisitSheet {
  const { fmt, range, stats, sleep, milk, diapers, nowMs } = input;
  const scoped = inRange(input.rows, range);
  const days = Math.max(1, range.days);
  const window = `${fmt.day(range.fromMs)} – ${fmt.day(range.toMs - 1)}`;
  const over = `over ${one(days, 'day')}`;

  const header: VisitRow[] = [
    { label: 'Child', value: input.childName },
    ...(input.birthDate === ''
      ? []
      : [{ label: 'Date of birth', value: input.birthDate, note: input.ageLabel }]),
    { label: 'Period covered', value: window, note: over },
    { label: 'Prepared', value: fmt.stamp(nowMs) },
  ];

  /* --------------------------------------------------------------- feeding */
  const feeding: VisitRow[] = [];
  if (milk.bottles > 0) {
    feeding.push(
      {
        label: 'Bottles a day',
        value: per(milk.bottles / days),
        note: one(milk.bottles, 'bottle') + ' in total',
      },
      {
        label: 'Taken a day',
        value: fmt.volume(Math.round(stats.milk.totalMl / days)),
        note: `${fmt.volume(stats.milk.totalMl)} in total`,
      },
      {
        label: 'Average bottle',
        value: fmt.volume(Math.round(stats.milk.averageMl)),
        note: `over ${one(milk.bottles, 'bottle')}`,
      },
    );
  }
  if (milk.breastfeeds > 0) {
    feeding.push(
      {
        label: 'Breastfeeds a day',
        value: per(milk.breastfeeds / days),
        note: one(milk.breastfeeds, 'session') + ' in total',
      },
      {
        label: 'Average session',
        value: fmt.duration(Math.round(stats.breastfeed.averageMinutes)),
        note: `over ${one(milk.breastfeeds, 'session')}`,
      },
    );
  }
  if (input.feedGapMinutes !== null) {
    feeding.push({
      label: 'Between feeds',
      value: fmt.duration(input.feedGapMinutes),
      note: 'start to start, both kinds',
    });
  }

  /* ---------------------------------------------------------------- solids */
  /**
   * WHAT THE BABY ATE, as the household logged it (the owner, 2026-09-24; docs/SOLIDS.md §5):
   * how many meals and foods, then each food eaten for the FIRST TIME in the period with its
   * date — the question a clinician asks when foods are being introduced — then every word the
   * parent wrote about a meal, verbatim.
   *
   * NOTHING HERE MARKS A FOOD. No allergen list, no "watch for", no ordering by anything but the
   * date: a first time is a date, and a note is the parent's sentence (CLAUDE.md §2). The section
   * exists only once solids have been logged at all — a newborn's sheet does not carry an empty
   * one.
   */
  const meals = input.meals ?? mealEntriesFrom(input.rows);
  const fr = foodReport(meals, range.fromMs, range.toMs);
  const solids: VisitRow[] = [];
  if (fr.meals > 0) {
    solids.push(
      { label: 'Meals', value: String(fr.meals), note: over },
      {
        label: 'Foods eaten',
        value: String(fr.foods.length),
        note:
          fr.firsts.length === 0
            ? 'none for the first time'
            : `${String(fr.firsts.length)} for the first time`,
      },
    );
    /*
      THE NEWEST FIRST TIMES ARE THE ONES NAMED, AND THE REST ARE COUNTED (the solids audit, M7).
      The list runs in the order the foods were first eaten, and cutting it at twelve from the
      front dropped the most recent introductions — the ones a visit is most likely to be about —
      with nothing on the page to say anything was missing. So the named twelve are the latest
      twelve, still in date order, and a row above them counts the earlier ones: a first time is
      never dropped silently. Every one of them is in the log and in the full download.
    */
    const earlier = Math.max(0, fr.firsts.length - SOLIDS_NAMED);
    if (earlier > 0) {
      solids.push({
        label: 'Earlier first times',
        value: `+${String(earlier)}`,
        note: 'each one is in the log, and in the full download',
        sub: true,
      });
    }
    // the foods themselves are the parts of "Foods eaten", so they sit under it (`sub`), not
    // beside it as figures of the same rank as the meal count
    for (const f of fr.firsts.slice(earlier)) {
      solids.push({
        label: f.name,
        value: `first eaten ${fmt.day(f.firstEverMs)}`,
        note: [one(f.times, 'time'), responseCounts(f.responses)].filter(Boolean).join(' · '),
        sub: true,
      });
    }
    const before = fr.foods.filter(f => !f.firstEver).map(f => f.name);
    if (before.length > 0) {
      solids.push({
        label: 'Also eaten',
        value: before.slice(0, SOLIDS_NAMED).join(', '),
        note:
          before.length > SOLIDS_NAMED
            ? `+${String(before.length - SOLIDS_NAMED)} more · eaten before this period too`
            : 'eaten before this period too',
        sub: true,
      });
    }
    for (const n of fr.noticed.slice(0, SOLIDS_NAMED)) {
      solids.push({
        label: `Noticed · ${fmt.stamp(n.atMs)}`,
        value: n.text,
        ...(n.foods.length === 0 ? {} : { note: n.foods.join(', ') }),
      });
    }
    if (fr.noticed.length > SOLIDS_NAMED) {
      solids.push({
        label: 'More notes',
        value: `+${String(fr.noticed.length - SOLIDS_NAMED)}`,
        note: 'each one is in the log, and in the full download',
      });
    }
  }

  /* ---------------------------------------------------------------- output */
  const isDirty = (r: TodayActivity) =>
    r.type === 'diaper' && (r.diaperKind === 'DIRTY' || r.diaperKind === 'BOTH');
  const isWet = (r: TodayActivity) =>
    r.type === 'diaper' && (r.diaperKind === 'WET' || r.diaperKind === 'BOTH');
  const output: VisitRow[] = [
    {
      label: 'Wet a day',
      value: per(diapers.wet / days),
      note: one(diapers.wet, 'in total', 'in total'),
    },
    {
      label: 'Dirty a day',
      value: per(diapers.dirty / days),
      note: `${diapers.dirty} in total`,
    },
    sinceRow(
      'Last dirty diaper',
      // the whole log, not the range: "nothing in 9 days" is the fact a 7-day window hides
      daysSince(input.rows, nowMs, isDirty),
      'None logged in this record',
      fmt,
      nowMs,
    ),
    sinceRow(
      'Last wet diaper',
      daysSince(input.rows, nowMs, isWet),
      'None logged in this record',
      fmt,
      nowMs,
    ),
  ];

  /**
   * THE RASH TICK, COUNTED AND DATED, AND THAT IS ALL IT IS.
   *
   * The diaper sheet has carried a "Rash noted" switch since the first release and nothing ever
   * read it back, so a parent who ticked it four days running had no way to tell anyone (the
   * owner, 2026-09-19: "this information is not being shown or used anywhere. where should it be
   * shown on for user to look back?"). Here is where it belongs first: a clinician asking "has
   * there been any rash?" is asking for exactly these dates.
   *
   * IT IS A COUNT OF TICKS. No severity, because the app never asked for one; no site, no
   * duration, no "consider", no color, and it is NOT sorted or placed by how much of it there is
   * — it is the last row of the diaper section whether the number is 0 or 40 (CLAUDE.md §2
   * rules 1–3). The days come from the entries' own timestamps in the household's zone, which is
   * what `fmt.day` formats, so the count and the dates can never disagree.
   */
  const rashes = scoped
    .filter(r => r.type === 'diaper' && r.diaperRash === true)
    .sort((a, b) => a.startMs - b.startMs);
  const rashDays = [...new Set(rashes.map(r => fmt.day(r.startMs)))];
  const rashEntries = rashes.length;
  const named = rashDays.slice(0, RASH_DAYS_NAMED).join(', ');
  const more = rashDays.length - RASH_DAYS_NAMED;
  output.push(
    rashEntries === 0
      ? { label: 'Rash noted', value: 'None logged in this period' }
      : {
          label: 'Rash noted',
          value: one(rashEntries, 'entry', 'entries'),
          note: `${one(rashDays.length, 'day')} · ${named}${more > 0 ? `, +${String(more)} more` : ''}`,
        },
  );

  /* ----------------------------------------------------------------- sleep */
  const sleepRows: VisitRow[] = [];
  if (sleep.perDayMinutes > 0) {
    sleepRows.push(
      {
        label: 'Asleep a day',
        value: fmt.duration(Math.round(sleep.perDayMinutes)),
        note: `${fmt.duration(Math.round(sleep.nightPerDayMinutes))} at night, ${fmt.duration(Math.round(sleep.napPerDayMinutes))} in naps`,
      },
      {
        label: 'Naps a day',
        value: per(sleep.napsPerDay),
        note: one(sleep.naps, 'nap') + ' in total',
      },
      {
        label: 'Average nap',
        value: fmt.duration(Math.round(sleep.averageNapMinutes)),
        note: `over ${one(sleep.naps, 'nap')}`,
      },
    );
    // The night half, alongside the nap half rather than folded into the headline. It is the
    // question a parent is most often asked at a visit, and until the household set a waking
    // window there was nothing to separate a 9 p.m. bedtime from an afternoon nap.
    if (sleep.nights > 0) {
      sleepRows.push({
        label: 'Average night sleep',
        value: fmt.duration(Math.round(sleep.averageNightMinutes)),
        note: `over ${one(sleep.nights, 'night')}`,
      });
    }
    sleepRows.push({
      label: 'Longest single stretch',
      value: fmt.duration(sleep.longestMinutes),
      ...(sleep.longestAtMs === null ? {} : { note: `began ${fmt.stamp(sleep.longestAtMs)}` }),
    });
  }

  /* ------------------------------------------------------------ temperature */
  // EVERY READING, IN ORDER, WITH ITS METHOD. A clinician wants the readings; an average of
  // four temperatures taken for four different reasons is a number nobody can use, and any
  // "high"/"normal" split would be the app owning a clinical threshold, which it does not.
  const temps = scoped
    .filter(r => r.type === 'temp' && typeof r.tempCHundredths === 'number')
    .sort((a, b) => b.startMs - a.startMs);
  const temperature: VisitRow[] = temps.map(r => ({
    label: fmt.stamp(r.startMs),
    value: fmt.temperature(r.tempCHundredths as number),
    ...(r.tempMethod ? { note: String(r.tempMethod).toLowerCase() } : {}),
  }));

  /* -------------------------------------------------------------- medicines */
  // Grouped by the name AS LOGGED, with the amount as the parent typed it. Nothing is parsed,
  // summed or converted: an amount in this app is text the household was told to give
  // (CLAUDE.md §2 rule 4), and a total of it would be the app doing arithmetic on a dose. How it
  // was given is the words for the entry's stored route (`careRoute.ts`), never the token, and
  // nothing at all when the entry did not say.
  //
  // WHICH TIMES THE AMOUNT DESCRIBES, SAID (the solids audit, M8). The row used to pair the
  // LATEST entry's amount with the count of ALL of them — "3 times (2.5 ml · …)" when two of the
  // three were 5 ml — which reads as three of 2.5 ml. Now an amount every entry shares is said
  // once, "each time"; otherwise the amount is the last entry's and says so; and an amount from an
  // older entry is never borrowed for the last one. The comparison is of the TEXT as typed,
  // trimmed — two strings are the same or they are not; nothing is parsed or added (rule 4).
  const byItem = new Map<
    string,
    { count: number; lastMs: number; lastAmount: string; route: string; amounts: string[] }
  >();
  for (const r of scoped) {
    if (r.type !== 'med') continue;
    const name = (r.medName ?? 'Medicine').trim() || 'Medicine';
    const amount = (r.medAmount ?? '').trim();
    const cur = byItem.get(name);
    const amounts = [...(cur?.amounts ?? []), amount];
    if (cur === undefined || r.startMs > cur.lastMs) {
      byItem.set(name, {
        count: (cur?.count ?? 0) + 1,
        lastMs: r.startMs,
        lastAmount: amount,
        route: careRouteLabel(r.medRoute) ?? cur?.route ?? '',
        amounts,
      });
    } else {
      byItem.set(name, { ...cur, count: cur.count + 1, amounts });
    }
  }
  const amountPart = (m: { count: number; lastAmount: string; amounts: string[] }): string => {
    if (m.count === 1 || m.lastAmount === '') return m.lastAmount;
    return m.amounts.every(a => a === m.lastAmount)
      ? `${m.lastAmount} each time`
      : `${m.lastAmount} the last time`;
  };
  const medicines: VisitRow[] = [...byItem.entries()]
    .sort((a, b) => b[1].lastMs - a[1].lastMs)
    .map(([name, m]) => ({
      label: name,
      value: `${one(m.count, 'time')} ${over}`,
      note: [
        amountPart(m),
        m.route === '' ? '' : m.route.toLowerCase(),
        `last ${fmt.stamp(m.lastMs)}`,
      ]
        .filter(Boolean)
        .join(' · '),
    }));

  /* ----------------------------------------------------------------- growth */
  const growth: VisitRow[] = (['weight', 'length', 'head'] as const).flatMap(metric => {
    const g = growthInsight(input.growthRows, metric);
    if (g === null) return [];
    const label = metric === 'weight' ? 'Weight' : metric === 'length' ? 'Length' : 'Head';
    const change =
      g.spanDays > 0
        ? `${g.delta >= 0 ? '+' : '−'}${fmt.growth(metric, Math.abs(g.delta))} over ${one(g.spanDays, 'day')}`
        : one(g.points.length, 'measurement');
    return [
      {
        label,
        value: fmt.growth(metric, g.last.value),
        note: `${fmt.day(g.last.atMs)} · ${change}`,
      },
    ];
  });

  /* ----------------------------------------------------------- health notes */
  /**
   * THE HEALTH NOTES (the owner, 2026-10-08: "most importantly the entries will be shown in
   * pediatricians sheet generated"). Each one the household wrote in the period, with the 48 hours
   * logged before it — the foods named and a first time logged marked, every medicine with the
   * amount as typed, every temperature, and the day's feeds, sleep and diapers counted — built by
   * the same look back the app opens on (`wellbeing/visit.ts` holds the rules). Read from every row
   * the sheet is handed, so a note on the period's first morning still shows the evening before.
   * The section is drawn whether or not there is a note, in one fixed place, like the others.
   */
  const healthNotes = healthNoteRows({
    notes: scoped.filter(r => r.type === 'wellbeing'),
    rows: input.rows,
    meals,
    fmt,
  });

  /* ------------------------------------------------------------------ notes */
  // The household's own words, verbatim and newest first. A doctor's "anything else you
  // noticed?" is exactly this field, and the app has no business summarising it. A Health note's
  // words are in its own section above, with its look back, so they are not said twice.
  const notes: VisitRow[] = scoped
    .filter(r => r.type !== 'wellbeing')
    .filter(r => typeof r.notes === 'string' && r.notes.trim() !== '')
    .sort((a, b) => b.startMs - a.startMs)
    .slice(0, 12)
    .map(r => ({ label: fmt.stamp(r.startMs), value: (r.notes as string).trim(), note: r.type }));

  // SLEEP LEADS (the owner, 2026-09-18: "parents take baby sleeping routine seriously, and
  // sleeping statistic should be number one in export"). It is an ordering of SECTIONS, not of
  // findings: nothing here is ranked by how worrying it is, and a household with no sleep logged
  // still gets the section, still empty, in the same place. Feeding follows, then output.
  const sections: VisitSection[] = [
    { key: 'sleep', title: 'Sleep', rows: sleepRows, empty: 'No sleep logged in this period.' },
    { key: 'feeding', title: 'Feeding', rows: feeding, empty: 'No feeds logged in this period.' },
    ...(meals.length === 0
      ? []
      : [
          {
            key: 'solids',
            title: 'Solids',
            rows: solids,
            empty: 'No solids logged in this period.',
          },
        ]),
    { key: 'output', title: 'Diapers', rows: output },
    {
      key: 'temperature',
      title: 'Temperature readings',
      rows: temperature,
      empty: 'None taken in this period.',
    },
    {
      key: 'medicines',
      title: 'Medicines, vitamins and creams',
      rows: medicines,
      empty: 'None logged in this period.',
    },
    { key: 'growth', title: 'Measurements', rows: growth, empty: 'None recorded.' },
    {
      key: 'healthNotes',
      title: VISIT_NOTE_COPY.title,
      rows: healthNotes,
      empty: VISIT_NOTE_COPY.empty,
    },
    { key: 'notes', title: 'Notes from the household', rows: notes, empty: 'None in this period.' },
  ];

  return { title: VISIT_TITLE, header, sections, caveat: VISIT_CAVEAT };
}

/**
 * The same sheet as plain text, for the share sheet — mail, a message, a printer.
 *
 * Plain text rather than a PDF on purpose, for now: it pastes into any of those, it needs no
 * renderer and no server, and it is legible on a phone in a waiting room. The PDF is the Plus
 * export's job and needs the server that does not exist yet.
 */
export function visitSheetText(sheet: VisitSheet): string {
  const out: string[] = [sheet.title, ''];
  for (const row of sheet.header) {
    out.push(`${row.label}: ${row.value}${row.note === undefined ? '' : ` (${row.note})`}`);
  }
  for (const section of sheet.sections) {
    out.push('', section.title.toUpperCase());
    if (section.rows.length === 0) {
      out.push(`  ${section.empty ?? 'Nothing logged.'}`);
      continue;
    }
    for (const row of section.rows) {
      // a food under "Foods eaten" is set in one step further, the way a list nests in mail
      const indent = row.sub ? '    - ' : '  ';
      out.push(
        `${indent}${row.label}: ${row.value}${row.note === undefined ? '' : ` (${row.note})`}`,
      );
    }
  }
  out.push('', sheet.caveat);
  return out.join('\n');
}
