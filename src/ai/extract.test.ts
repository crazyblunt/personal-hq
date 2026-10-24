import { extractJson } from './extract';

describe('extractJson', () => {
  it('pulls the first JSON object out of prose, fences, or extra blocks', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here you go:\n```json\n{"a":2}\n```\nHope that helps')).toEqual({ a: 2 });
    expect(extractJson('Sure! {"a":3,"s":"}{"} and also {"b":4}')).toEqual({ a: 3, s: '}{' });
    expect(extractJson('Bad {not json} then {"ok":true}')).toEqual({ ok: true });
  });

  it('rejects replies with no valid JSON', () => {
    expect(() => extractJson('Sorry, I cannot help.')).toThrow('Not valid JSON');
    expect(() => extractJson('{"a":1,}')).toThrow('Not valid JSON');
    expect(() => extractJson('')).toThrow('Not valid JSON');
  });
});
