import { translateIdentifierFilter, parseIdentifier } from '../linear-tools.js';

describe('parseIdentifier', () => {
  it('parses a valid identifier', () => {
    expect(parseIdentifier('W10-82')).toEqual({ teamKey: 'W10', number: 82 });
  });

  it('parses single-letter team key', () => {
    expect(parseIdentifier('A-1')).toEqual({ teamKey: 'A', number: 1 });
  });

  it('throws on lowercase team key', () => {
    expect(() => parseIdentifier('w10-82')).toThrow('Invalid identifier format');
  });

  it('throws on missing number', () => {
    expect(() => parseIdentifier('W10-')).toThrow('Invalid identifier format');
  });

  it('throws on missing dash', () => {
    expect(() => parseIdentifier('W1082')).toThrow('Invalid identifier format');
  });

  it('throws on empty string', () => {
    expect(() => parseIdentifier('')).toThrow('Invalid identifier format');
  });

  it('throws on number-only input', () => {
    expect(() => parseIdentifier('123')).toThrow('Invalid identifier format');
  });

  it('throws on bad-format with lowercase dash number', () => {
    expect(() => parseIdentifier('bad-format')).toThrow('Invalid identifier format');
  });
});

describe('translateIdentifierFilter', () => {
  it('translates eq identifier to team.key + number', () => {
    const input = {
      filter: { identifier: { eq: 'W10-82' } }
    };
    expect(translateIdentifierFilter(input)).toEqual({
      filter: {
        team: { key: { eq: 'W10' } },
        number: { eq: 82 }
      }
    });
  });

  it('translates in identifiers from same team', () => {
    const input = {
      filter: { identifier: { in: ['W10-82', 'W10-83'] } }
    };
    expect(translateIdentifierFilter(input)).toEqual({
      filter: {
        team: { key: { eq: 'W10' } },
        number: { in: [82, 83] }
      }
    });
  });

  it('translates in identifiers from different teams', () => {
    const input = {
      filter: { identifier: { in: ['W10-82', 'ENG-5'] } }
    };
    expect(translateIdentifierFilter(input)).toEqual({
      filter: {
        team: { key: { in: ['W10', 'ENG'] } },
        number: { in: [82, 5] }
      }
    });
  });

  it('preserves other filters alongside identifier', () => {
    const input = {
      filter: {
        identifier: { eq: 'W10-82' },
        state: { name: { eq: 'Done' } }
      }
    };
    expect(translateIdentifierFilter(input)).toEqual({
      filter: {
        state: { name: { eq: 'Done' } },
        team: { key: { eq: 'W10' } },
        number: { eq: 82 }
      }
    });
  });

  it('passes through variables without filter.identifier unchanged', () => {
    const input = {
      filter: { title: { contains: 'bug' } }
    };
    expect(translateIdentifierFilter(input)).toEqual(input);
  });

  it('returns unchanged when variables is undefined', () => {
    expect(translateIdentifierFilter(undefined)).toBeUndefined();
  });

  it('returns unchanged when variables is null', () => {
    expect(translateIdentifierFilter(null)).toBeNull();
  });

  it('returns unchanged when filter is missing', () => {
    const input = { first: 10 };
    expect(translateIdentifierFilter(input)).toEqual(input);
  });

  it('does not mutate the original input', () => {
    const input = {
      filter: { identifier: { eq: 'W10-82' }, state: { name: { eq: 'Todo' } } }
    };
    const original = JSON.parse(JSON.stringify(input));
    translateIdentifierFilter(input);
    expect(input).toEqual(original);
  });

  it('preserves non-filter properties', () => {
    const input = {
      first: 50,
      after: 'cursor123',
      filter: { identifier: { eq: 'W10-82' } }
    };
    const result = translateIdentifierFilter(input);
    expect(result.first).toBe(50);
    expect(result.after).toBe('cursor123');
  });

  it('throws on invalid identifier format in eq', () => {
    const input = {
      filter: { identifier: { eq: 'bad-format' } }
    };
    expect(() => translateIdentifierFilter(input)).toThrow('Invalid identifier format');
  });

  it('throws on invalid identifier format in in array', () => {
    const input = {
      filter: { identifier: { in: ['W10-82', 'bad'] } }
    };
    expect(() => translateIdentifierFilter(input)).toThrow('Invalid identifier format');
  });
});
