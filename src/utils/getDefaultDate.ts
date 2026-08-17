export function getDefaultDate(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 0 : day;
  const lastSunday = new Date(d);
  lastSunday.setDate(d.getDate() - diff);
  const year = lastSunday.getFullYear();
  const month = String(lastSunday.getMonth() + 1).padStart(2, '0');
  const date = String(lastSunday.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}
