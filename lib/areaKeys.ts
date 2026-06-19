const JAPANESE_NUMBER_DIGITS: Record<string, number> = {
  "\u3007": 0,
  "\u96f6": 0,
  "\u4e00": 1,
  "\u4e8c": 2,
  "\u4e09": 3,
  "\u56db": 4,
  "\u4e94": 5,
  "\u516d": 6,
  "\u4e03": 7,
  "\u516b": 8,
  "\u4e5d": 9
};

function normalizeDigits(value: string): string {
  return value.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));
}

function parseJapaneseNumber(value: string): number | undefined {
  if (!value) {
    return undefined;
  }

  if (/^[\u3007\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d]+$/.test(value)) {
    const digits = Array.from(value, (char) => JAPANESE_NUMBER_DIGITS[char]);
    return digits.every((digit) => digit !== undefined) ? Number(digits.join("")) : undefined;
  }

  const tenIndex = value.indexOf("\u5341");
  if (tenIndex >= 0) {
    const left = value.slice(0, tenIndex);
    const right = value.slice(tenIndex + 1);
    const tens = left ? JAPANESE_NUMBER_DIGITS[left] : 1;
    const ones = right ? JAPANESE_NUMBER_DIGITS[right] : 0;

    if (tens === undefined || ones === undefined) {
      return undefined;
    }

    return tens * 10 + ones;
  }

  return JAPANESE_NUMBER_DIGITS[value];
}

export function normalizeAddress(address: string): string {
  return normalizeDigits(address).replace(/\s+/g, "").replace(/^大阪府/, "");
}

export function normalizeAreaKey(value: string): string {
  return normalizeDigits(value).replace(/\s+/g, "").replace(/([〇零一二三四五六七八九十]+)丁目/g, (_, numberText: string) => {
    const parsed = parseJapaneseNumber(numberText);
    return parsed === undefined ? `${numberText}丁目` : `${parsed}丁目`;
  });
}

export function normalizeAreaBaseLabel(value: string): string {
  return normalizeAreaKey(value).replace(/[0-9]+丁目$/, "");
}

export function normalizeMunicipality(value: string): string {
  return normalizeAddress(value).replace(/\|/g, "");
}

export function splitOsakaAddress(address: string): { municipality: string; town: string } {
  const normalized = normalizeAddress(address);
  const municipalityMatch =
    normalized.match(/^(.+?市.+?区)(.*)$/) ??
    normalized.match(/^(.+?郡.+?[町村])(.*)$/) ??
    normalized.match(/^(.+?[市町村])(.*)$/);

  if (!municipalityMatch) {
    return { municipality: "", town: normalized };
  }

  return {
    municipality: normalizeMunicipality(municipalityMatch[1]),
    town: municipalityMatch[2]
  };
}

export function areaLabelFromAddress(address: string): string {
  const { town } = splitOsakaAddress(address);
  const chome = town.match(/^(.+?(?:[0-9]+|[〇零一二三四五六七八九十]+)丁目)/);
  return normalizeAreaKey(chome?.[1] || town.slice(0, 10) || address);
}

export function areaBaseLabelFromAddress(address: string): string {
  return normalizeAreaBaseLabel(areaLabelFromAddress(address));
}

export function areaKeyFromAddress(address: string): string {
  const { municipality } = splitOsakaAddress(address);
  const label = areaLabelFromAddress(address);
  return municipality ? `${municipality}|${label}` : label;
}

export function areaBaseKeyFromAddress(address: string): string {
  const { municipality } = splitOsakaAddress(address);
  const label = areaBaseLabelFromAddress(address);
  return municipality ? `${municipality}|${label}` : label;
}

export function areaKeyFromBoundary(cityName: string, sName: string): string {
  const municipality = normalizeMunicipality(cityName);
  const label = normalizeAreaKey(sName);
  return municipality && label ? `${municipality}|${label}` : label;
}

export function areaBaseKeyFromBoundary(cityName: string, sName: string): string {
  const municipality = normalizeMunicipality(cityName);
  const label = normalizeAreaBaseLabel(sName);
  return municipality && label ? `${municipality}|${label}` : label;
}
