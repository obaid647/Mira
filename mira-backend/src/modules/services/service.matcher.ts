import { stemmer } from 'stemmer';
import type { Service } from '../../types/domain.js';

// Language normalization only: service vocabulary always comes from the catalog.
const stopwords = new Set([
  'a', 'an', 'the', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'can', 'could', 'would', 'should', 'will',
  'and', 'or', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'with', 'from',
  'this', 'that', 'there', 'please', 'hello', 'hi', 'help', 'need', 'needs',
  'want', 'someone', 'service', 'services',
]);
const negations = new Set(['no', 'not', 'never', 'neither', 'nor', 'without', 'except', 'excluding', 'cannot']);

const normalize = (value: string) => value.toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\b([a-z]+)n['’]t\b/g, '$1 not')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const tokens = (normalized: string) => new Set(normalized.split(' ')
  .filter(word => word && !stopwords.has(word)).map(word => stemmer(word)));
const hasNegation = (normalized: string) => normalized.split(' ').some(word => negations.has(word))
  || /\b(?:instead of|rather than|other than|anything but|everything but)\b/.test(normalized);

function uniqueSorted(services: readonly Service[]): Service[] {
  return [...new Map(services.map(service => [service.id, service])).values()]
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Matches only the supplied business catalog; does not infer synonyms or availability. */
export function matchServices(query: string, services: readonly Service[]): Service[] {
  const normalized = normalize(query);
  const queryTokens = tokens(normalized);
  if (!queryTokens.size) return [];

  const catalog = services.map(service => ({ service,
    entries: [service.name, ...service.aliases, service.description].map(normalize).filter(Boolean),
  }));
  const exact = catalog.filter(({ entries }) => entries.includes(normalized));
  if (exact.length) return uniqueSorted(exact.map(({ service }) => service));

  // Negation scope cannot be established reliably with a bag of words. Ask for
  // clarification on the whole request rather than selecting a negated mention.
  // Preserve literal configured symptoms such as "no hot water" inside a sentence.
  let remainder = ` ${normalized} `;
  const negativeEntries = catalog.flatMap(({ entries }) => entries)
    .filter(entry => hasNegation(entry) && tokens(entry).size >= 2)
    .sort((a, b) => b.length - a.length);
  for (const entry of negativeEntries) {
    while (remainder.includes(` ${entry} `)) remainder = remainder.replace(` ${entry} `, ' ');
  }
  if (hasNegation(remainder)) return [];

  return uniqueSorted(catalog.filter(({ entries }) => entries.some(entry => {
    const entryTokens = tokens(entry);
    return entryTokens.size >= 2 && [...entryTokens].every(token => queryTokens.has(token));
  })).map(({ service }) => service));
}
