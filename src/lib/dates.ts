// Date locale "AAAA-MM-JJ". Ne pas utiliser toISOString().slice(0,10) : c'est la date UTC,
// fausse entre minuit et 1-2 h du matin en Belgique.
export function ymd(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function joursDepuis(date: string, now: number = Date.now()): number {
  return Math.floor((now - new Date(date + 'T00:00:00').getTime()) / 86_400_000)
}
