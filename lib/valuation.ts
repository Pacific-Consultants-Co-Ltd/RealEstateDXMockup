import type { ValuationInput, ValuationResult } from "./types";

function average(values: number[]): number {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0);
  if (usable.length === 0) {
    return 0;
  }

  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

export function calculateValuation({
  selectedCases,
  landTsubo,
  growthRatePercent,
  adjustmentPercent
}: ValuationInput): ValuationResult {
  const selectedUnitPrices = selectedCases
    .map((comparable) => comparable.unitPricePerTsubo ?? 0)
    .filter((value) => value > 0);
  const averageTsuboUnitPrice = average(selectedUnitPrices);
  const grossMarketPrice = Math.max(landTsubo, 0) * averageTsuboUnitPrice;
  const growthMultiplier = 1 + growthRatePercent / 100;
  const appraisalAmount = grossMarketPrice * growthMultiplier;
  const bidAmount = appraisalAmount * (1 + adjustmentPercent / 100);

  return {
    selectedCount: selectedUnitPrices.length,
    averageTsuboUnitPrice,
    grossMarketPrice,
    growthMultiplier,
    appraisalAmount,
    adjustmentAmount: bidAmount - appraisalAmount,
    bidAmount
  };
}

export function averageGrowthRate(points: { yearOnYearChangeRate: number; year: number }[]): number {
  const byRecentYear = [...points]
    .filter((point) => Number.isFinite(point.yearOnYearChangeRate))
    .sort((a, b) => b.year - a.year)
    .slice(0, 5);

  if (byRecentYear.length === 0) {
    return 0;
  }

  return byRecentYear.reduce((sum, point) => sum + point.yearOnYearChangeRate, 0) / byRecentYear.length;
}

