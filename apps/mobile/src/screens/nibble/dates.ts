/** Days as a parent reads them, shared by every NibbleCue screen. */
/** "Mon, Oct 12": a day the parent reads. */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
