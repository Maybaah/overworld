import { describe, expect, it } from 'vitest';
import { buildPeopleQuery, parsePeople } from './people';

const uri = (id: string) => ({ type: 'uri', value: `http://www.wikidata.org/entity/${id}` });
const prop = (id: string) => ({ type: 'uri', value: `http://www.wikidata.org/prop/direct/${id}` });
const lit = (value: string) => ({ type: 'literal', value });

describe('people stage', () => {
  it('asks only for humans in the key roles of the given games', () => {
    const q = buildPeopleQuery(['Q1', 'Q2']);
    expect(q).toContain('VALUES ?game { wd:Q1 wd:Q2 }');
    expect(q).toContain('wdt:P57');
    expect(q).toContain('wdt:P86');
    expect(q).toContain('?person wdt:P31 wd:Q5');
  });

  it('groups by game, maps roles, drops unlabelled people and duplicates', () => {
    const rows = [
      { game: uri('Q10'), prop: prop('P57'), person: uri('Q5001'), personLabel: lit('Hideo Kojima') },
      { game: uri('Q10'), prop: prop('P57'), person: uri('Q5001'), personLabel: lit('Hideo Kojima') },
      { game: uri('Q10'), prop: prop('P86'), person: uri('Q5002'), personLabel: lit('Ludvig Forssell') },
      { game: uri('Q10'), prop: prop('P86'), person: uri('Q5003'), personLabel: lit('Q5003') },
      { game: uri('Q2'), prop: prop('P999'), person: uri('Q5004'), personLabel: lit('Nobody') },
    ];
    expect(parsePeople(rows)).toEqual([
      {
        qid: 'Q10',
        people: [
          { qid: 'Q5002', name: 'Ludvig Forssell', role: 'composer' },
          { qid: 'Q5001', name: 'Hideo Kojima', role: 'director' },
        ],
      },
    ]);
  });
});
