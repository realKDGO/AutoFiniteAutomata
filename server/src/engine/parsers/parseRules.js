const mapping = {
  startsWith: 'prefix',
  doesNotStartWith: 'notPrefix',
  endsWith: 'suffix',
  doesNotEndWith: 'notSuffix',
  contains: 'substring',
  doesNotContain: 'notSubstring',
  lengthEqual: 'lengthEqual',
  lengthGreaterOrEqual: 'lengthAtLeast',
  lengthLessOrEqual: 'lengthAtMost',
  lengthGreater: 'lengthGreater',
  lengthLess: 'lengthLess',
  evenLength: 'evenLength',
  oddLength: 'oddLength',
  firstSymbol: 'firstSymbol',
  lastSymbol: 'lastSymbol',
  nthSymbol: 'nthSymbol',
  nthSymbolNot: 'nthSymbolNot',
  nthToLastSymbol: 'nthToLastSymbol',
  nthToLastSymbolNot: 'nthToLastSymbolNot',
  secondToLastSymbol: 'secondToLastSymbol',
  exactOccurrences: 'exactOccurrences',
  atLeastOccurrences: 'atLeastOccurrences',
  atMostOccurrences: 'atMostOccurrences',
  evenOccurrences: 'evenOccurrences',
  oddOccurrences: 'oddOccurrences',
};

export function parseRules(conditions) {
  const rules = [];
  let pending = 'AND';
  for (const item of conditions) {
    if (item.operator && !item.type) {
      pending = item.operator.toUpperCase();
      continue;
    }
    const rawCount = item.count ?? item.value;
    const pos = item.position === undefined ? (item.type === 'secondToLastSymbol' ? 2 : undefined) : Number(item.position);
    rules.push({
      kind: mapping[item.type],
      value: item.value,
      count: rawCount === undefined ? undefined : Number(rawCount),
      position: pos,
      symbol: item.symbol,
      join: rules.length ? (item.operator?.toUpperCase() || pending) : null,
      sourceType: item.type,
    });
    pending = 'AND';
  }
  return rules;
}