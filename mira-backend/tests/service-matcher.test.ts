import { describe, expect, it } from 'vitest';
import { demoServices } from '../prisma/demo-data.js';
import { matchServices } from '../src/modules/services/service.matcher.js';

const ids = (query: string, catalog = demoServices()) => matchServices(query, catalog).map(service => service.id);

describe('Conservative catalog matching', () => {
  it.each([
    'leaking kitchen pipe', 'the kitchen pipe is leaking', 'the kitchen pipes are leaking',
    'pipes leaked in my kitchen', 'LEAKING, kitchen PIPE!', 'my kitchen pípe leaks',
    'Hi, my leaking basement pipe needs repair',
  ])('matches reordered and inflected words: %s', query => {
    expect(ids(query)).toEqual(['pipe-repair']);
  });

  it.each([
    'Pipe Repair', 'pipe leak', 'Repair of leaking domestic water pipes',
  ])('preserves whole-query exact names, aliases, and descriptions: %s', query => {
    expect(ids(query)).toEqual(['pipe-repair']);
  });

  it('does not let an embedded phrase suppress another qualifying service', () => {
    expect(ids('Repair a leaking kitchen faucet supply or drain pipe underneath the sink'))
      .toEqual(['fixture-repair', 'pipe-repair']);
    expect(ids('leaking pipe and blocked drain')).toEqual(['drain-cleaning', 'pipe-repair']);
  });

  it.each([
    'my sink is leaking', 'install a solar panel', 'repair', 'please help me', '', '?!',
    'the pipeline needs repairing', 'leaking household',
  ])('requires enough catalog evidence: %s', query => {
    expect(ids(query)).toEqual([]);
  });

  it('does not combine incomplete entries to manufacture a match', () => {
    const service = { ...demoServices()[0]!, name: 'Pipe Installation',
      description: 'Basement inspection', aliases: ['Faucet repair'] };
    expect(ids('pipe repair', [service])).toEqual([]);
  });

  it('requires two meaningful tokens for non-exact matches', () => {
    const service = { ...demoServices()[0]!, name: 'Consultation', description: '', aliases: ['the repair service'] };
    expect(ids('Consultation', [service])).toEqual(['pipe-repair']);
    expect(ids('please arrange a consultation', [service])).toEqual([]);
    expect(ids('please repair this', [service])).toEqual([]);
  });

  it('keeps duplicate exact aliases ambiguous and sorts and deduplicates by ID', () => {
    const catalog = demoServices();
    catalog[2]!.aliases.push('pipe leak');
    expect(ids('pipe leak', [catalog[0]!, catalog[2]!, catalog[0]!]))
      .toEqual(['fixture-repair', 'pipe-repair']);
  });

  it('gives whole-query exact matches precedence over broader token matches', () => {
    const catalog = demoServices();
    catalog[2]!.aliases.push('repair pipe');
    expect(ids('Pipe Repair', catalog)).toEqual(['pipe-repair']);
  });

  it.each([
    'not pipe repair', 'my pipe is not leaking', 'my pipe is never leaking',
    "my pipe isn't leaking", 'my pipe isn’t leaking', "I don't need pipe repair",
    'no leaking pipe', 'anything except pipe repair', 'without pipe repair',
    'not pipe repair but a leaking faucet', 'no hot water but not pipe repair',
    'my leaking pipe does not need repair', 'anything but pipe repair',
    'I need a leaking faucet fixed rather than pipe repair',
  ])('does not select a service from negated mentions: %s', query => {
    expect(ids(query)).toEqual([]);
  });

  it('preserves literal negative symptoms configured in the catalog', () => {
    expect(ids('no hot water')).toEqual(['water-heater-assessment']);
    expect(ids('I have no hot water, please help')).toEqual(['water-heater-assessment']);
    expect(ids('no hot water and a leaking pipe')).toEqual(['pipe-repair', 'water-heater-assessment']);
    expect(ids('no hot water and no leaking pipe')).toEqual([]);
  });

  it('does not filter inactive services or mutate the catalog', () => {
    const catalog = demoServices();
    catalog[0]!.active = false;
    const snapshot = structuredClone(catalog);
    expect(ids('leaking pipe and blocked drain', catalog)).toEqual(['drain-cleaning', 'pipe-repair']);
    expect(catalog).toEqual(snapshot);
  });
});
