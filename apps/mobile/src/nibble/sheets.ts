/**
 * THE TWO SHEETS NIBBLECUE MAKES FROM THE LOG (NibbleCue Plus), as plain sections a screen draws and
 * the platform's share sheet sends as text: the caregiver sheet (what this baby eats and how, for
 * daycare and grandparents) and the pediatrician summary (firsts, allergens and what was noticed,
 * in the order a doctor asks). Only what the household logged; nothing inferred.
 */
import {
  ALLERGENS,
  allergenOrder,
  servingFor,
  SIGN_LABEL,
  STATE_LABEL,
  type AgeBand,
  type AllergenId,
  type AllergenState,
  type Food,
  type FoodStatus,
  type NibbleProfile,
  type ReadRecord,
} from '@nibblecue/core/nibble';

export interface SheetSection {
  title: string;
  lines: string[];
}

export interface SheetInput {
  childName: string;
  months: number;
  band: AgeBand;
  profile: NibbleProfile | null;
  foods: readonly Food[];
  foodById: (id: string) => Food | undefined;
  statuses: ReadonlyMap<string, FoodStatus>;
  allergens: Readonly<Record<AllergenId, AllergenState>>;
  noticed: readonly ReadRecord<'noticed'>[];
}

export interface SheetWords {
  approved: string;
  allergensIn: string;
  allergens: string;
  allergensNotYet: string;
  never: string;
  howToServe: string;
  newFoods: string;
  noAdded: string;
  firsts: string;
  noticed: string;
  notMedical: string;
}

const IN_DIET = new Set(['introduced', 'keeping_going', 'established']);

const triedFoods = (input: SheetInput): { food: Food; status: FoodStatus }[] =>
  input.foods
    .map(food => ({ food, status: input.statuses.get(`id:${food.id}`) }))
    .filter(
      (x): x is { food: Food; status: FoodStatus } => x.status !== undefined && x.status.times > 0,
    );

export function caregiverSections(input: SheetInput, w: SheetWords): SheetSection[] {
  const order = allergenOrder(input.profile?.allergenOrder ?? []);
  const tried = triedFoods(input).sort((a, b) => a.food.name.localeCompare(b.food.name));
  const inDiet = order.filter(a => IN_DIET.has(input.allergens[a].kind));
  const notYet = order.filter(a => !IN_DIET.has(input.allergens[a].kind));
  const never = (input.profile?.neverServe ?? []).map(id => input.foodById(id)?.name ?? id);
  const careful = tried.filter(x => x.food.chokingRisk !== 'low').slice(0, 10);
  const sections: SheetSection[] = [
    { title: w.approved, lines: [tried.map(x => x.food.name).join(', ') || '-'] },
    { title: w.allergensIn, lines: [inDiet.map(a => ALLERGENS[a].name).join(', ') || '-'] },
    { title: w.allergensNotYet, lines: [notYet.map(a => ALLERGENS[a].name).join(', ') || '-'] },
  ];
  if (never.length > 0) sections.push({ title: w.never, lines: [never.join(', ')] });
  if (careful.length > 0)
    sections.push({
      title: w.howToServe,
      lines: careful.map(x => `${x.food.name}: ${servingFor(x.food, input.band).how}`),
    });
  sections.push({ title: '', lines: [w.newFoods, w.noAdded, w.notMedical] });
  return sections;
}

export function summarySections(
  input: SheetInput,
  w: SheetWords,
  dayLabel: (day: string) => string,
): SheetSection[] {
  const order = allergenOrder(input.profile?.allergenOrder ?? []);
  const firsts = triedFoods(input)
    .sort((a, b) => a.status.firstDay.localeCompare(b.status.firstDay))
    .map(x => `${dayLabel(x.status.firstDay)}: ${x.food.name}`);
  const allergens = order
    .map(a => input.allergens[a])
    .filter(a => a.times > 0 || a.kind === 'held' || a.kind === 'excluded')
    .map(a => {
      const first = a.firstDay ? `, first ${dayLabel(a.firstDay)}` : '';
      return `${ALLERGENS[a.allergen].name}: ${STATE_LABEL[a.kind]}${first}, offered ${a.times} times`;
    });
  const noticed = [...input.noticed]
    .sort((a, b) => b.body.at.localeCompare(a.body.at))
    .map(r => {
      const foods = r.body.foodIds.map(id => input.foodById(id)?.name ?? id).join(', ');
      const signs = r.body.signs.map(s => SIGN_LABEL[s].toLowerCase()).join(', ');
      const onset =
        r.body.onsetMinutes === null ? '' : `, about ${r.body.onsetMinutes} minutes after eating`;
      return `${dayLabel(r.body.at.slice(0, 10))}: ${signs}${foods ? ` after ${foods}` : ''}${onset}`;
    });
  return [
    { title: w.firsts, lines: firsts.length > 0 ? firsts : ['-'] },
    { title: w.allergens, lines: allergens.length > 0 ? allergens : ['-'] },
    { title: w.noticed, lines: noticed.length > 0 ? noticed : ['-'] },
    { title: '', lines: [w.notMedical] },
  ];
}

/** The sections as one plain text, for the share sheet. */
export function sheetText(heading: string, sections: readonly SheetSection[]): string {
  const parts = [heading];
  for (const s of sections) {
    parts.push('');
    if (s.title) parts.push(s.title);
    parts.push(...s.lines);
  }
  return parts.join('\n');
}
