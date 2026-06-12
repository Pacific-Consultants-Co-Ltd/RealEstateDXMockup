export function formatYen(value?: number): string {
  if (!Number.isFinite(value ?? NaN)) {
    return "-";
  }

  const amount = value ?? 0;
  if (Math.abs(amount) >= 100_000_000) {
    return `${(amount / 100_000_000).toLocaleString("ja-JP", {
      maximumFractionDigits: 2
    })}億円`;
  }

  if (Math.abs(amount) >= 10_000) {
    return `${Math.round(amount / 10_000).toLocaleString("ja-JP")}万円`;
  }

  return `${Math.round(amount).toLocaleString("ja-JP")}円`;
}

export function formatYenPerTsubo(value?: number): string {
  if (!Number.isFinite(value ?? NaN)) {
    return "-";
  }

  return `${((value ?? 0) / 10_000).toLocaleString("ja-JP", {
    maximumFractionDigits: 1
  })}万円/坪`;
}

export function formatYenPerM2(value?: number): string {
  if (!Number.isFinite(value ?? NaN)) {
    return "-";
  }

  return `${Math.round(value ?? 0).toLocaleString("ja-JP")}円/㎡`;
}

export function formatTsubo(value?: number): string {
  if (!Number.isFinite(value ?? NaN)) {
    return "-";
  }

  return `${(value ?? 0).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}坪`;
}

export function formatM2(value?: number): string {
  if (!Number.isFinite(value ?? NaN)) {
    return "-";
  }

  return `${(value ?? 0).toLocaleString("ja-JP", { maximumFractionDigits: 2 })}㎡`;
}

export function formatPercent(value?: number): string {
  if (!Number.isFinite(value ?? NaN)) {
    return "-";
  }

  return `${(value ?? 0).toLocaleString("ja-JP", {
    maximumFractionDigits: 1
  })}%`;
}

