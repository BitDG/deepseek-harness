/** Validated data projected from two independent public services. */

/** One newly created GitHub repository ranked by current total stars. */
export interface TrendingRepository {
  readonly fullName: string
  readonly url: string
  readonly stars: number
  readonly description: string
  readonly language: string
}

/** Community prediction, with unknown probability represented by null. */
export interface TiboStatus {
  readonly chancePercent: number | null
  readonly forecast: string
  readonly fetchedAt: string
  readonly sourceUrl: string
  readonly stale: boolean
}

/**
 * Decode the fields shown by the GitHub card from a wire or API item.
 * @param value - untrusted repository data.
 * @returns a safe repository row, or undefined for invalid data.
 */
export function parseRepository(value: unknown): TrendingRepository | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  const fullName = row.fullName ?? row.full_name
  const url = row.html_url ?? row.url
  const stars = row.stars ?? row.stargazers_count
  if (typeof fullName !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(fullName)
    || url !== `https://github.com/${fullName}` || !Number.isSafeInteger(stars) || (stars as number) < 0) return undefined
  return {
    fullName,
    url,
    stars: stars as number,
    description: typeof row.description === 'string' ? row.description.slice(0, 300) : '',
    language: typeof row.language === 'string' ? row.language.slice(0, 40) : '',
  }
}

/**
 * Accept an available prediction only while its source and watch remain fresh.
 * @param value - untrusted Tibo API response.
 * @returns a nullable community prediction, or undefined for invalid data.
 */
export function parseTiboStatus(value: unknown): TiboStatus | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  const data = row.data
  const provenance = row.provenance
  if (data === null || typeof data !== 'object') return undefined
  const watch = (data as Record<string, unknown>).active_watch
  const sourceUrl = row.sourceUrl ?? row.source_url
  const fetchedAt = row.fetchedAt ?? row.fetched_at
  if (typeof sourceUrl !== 'string' || !sourceUrl.startsWith('https://')
    || typeof fetchedAt !== 'string' || !Number.isFinite(Date.parse(fetchedAt))) return undefined
  const source = watch !== null && typeof watch === 'object' ? watch as Record<string, unknown> : {}
  const expired = provenance !== null && typeof provenance === 'object'
    && (provenance as Record<string, unknown>).watch_expired === true
  const stale = row.stale === true || expired
  const chance = source.reset_chance_percent
  const translation = source.translation
  const translated = translation !== null && typeof translation === 'object'
    && (translation as Record<string, unknown>).stale !== true
    ? (translation as Record<string, unknown>).text : undefined
  return {
    chancePercent: !stale && typeof chance === 'number' && Number.isFinite(chance) && chance >= 0 && chance <= 100 ? chance : null,
    forecast: typeof translated === 'string' ? translated.slice(0, 240)
      : typeof source.text === 'string' ? source.text.slice(0, 240) : '',
    fetchedAt,
    sourceUrl,
    stale,
  }
}

/**
 * Decode the Host-projected Tibo result before browser rendering.
 * @param value - untrusted DSH route response.
 * @returns a card-safe prediction, or undefined for invalid data.
 */
export function parseTiboCard(value: unknown): TiboStatus | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  if (typeof row.sourceUrl !== 'string' || !row.sourceUrl.startsWith('https://')
    || typeof row.fetchedAt !== 'string' || !Number.isFinite(Date.parse(row.fetchedAt))
    || typeof row.forecast !== 'string' || typeof row.stale !== 'boolean') return undefined
  const chance = row.chancePercent
  if (chance !== null && (typeof chance !== 'number' || !Number.isFinite(chance) || chance < 0 || chance > 100)) return undefined
  return { chancePercent: chance, forecast: row.forecast, fetchedAt: row.fetchedAt,
    sourceUrl: row.sourceUrl, stale: row.stale }
}
