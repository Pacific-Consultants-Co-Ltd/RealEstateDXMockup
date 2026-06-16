export type ComparableCaseSource = "csv" | "mlit_transaction" | "mlit_land_price" | "manual";

export type InformationType = "取引事例" | "成約事例" | "公示地価" | "自社データ";

export interface ComparableCase {
  id: string;
  source: ComparableCaseSource;
  propertyNumber?: string;
  propertyType?: string;
  address: string;
  latitude: number;
  longitude: number;
  landAreaM2?: number;
  landAreaTsubo?: number;
  priceTotalYen?: number;
  priceTotalDisplay?: string;
  unitPricePerM2?: number;
  unitPricePerTsubo?: number;
  zoning?: string;
  nearestStation?: string;
  access?: string;
  buildingCoverageRatio?: number;
  floorAreaRatio?: number;
  roadCondition?: string;
  transactionDate?: string;
  selected: boolean;
  externalLink?: string;
  raw: Record<string, unknown>;
}

export interface PublicLandPricePoint {
  id: string;
  source: "mlit_land_price";
  pointId: string;
  year: number;
  standardLotNumber?: string;
  address: string;
  latitude: number;
  longitude: number;
  pricePerM2: number;
  previousYearPricePerM2?: number;
  yearOnYearChangeRate: number;
  cadastral?: string;
  nearestStation?: string;
  distanceToStation?: string;
  useCategory?: string;
  buildingCoverageRatio?: number;
  floorAreaRatio?: number;
  raw: Record<string, unknown>;
}

export interface ValuationInput {
  selectedCases: ComparableCase[];
  landTsubo: number;
  growthRatePercent: number;
  adjustmentPercent: number;
}

export interface ValuationResult {
  selectedCount: number;
  averageTsuboUnitPrice: number;
  grossMarketPrice: number;
  growthMultiplier: number;
  appraisalAmount: number;
  adjustmentAmount: number;
  bidAmount: number;
}

export interface SourceToggles {
  csv: boolean;
  mlit_transaction: boolean;
  mlit_land_price: boolean;
  manual: boolean;
}

export interface TargetLocation {
  address: string;
  latitude: number;
  longitude: number;
}

export interface CaseTableFilters {
  source: "all" | ComparableCaseSource;
  zoning: string;
  priceMin: string;
  priceMax: string;
  areaMin: string;
  areaMax: string;
  walkMax: string;
  dateKeyword: string;
}

export type CaseSortKey =
  | "source"
  | "address"
  | "landAreaTsubo"
  | "priceTotalYen"
  | "unitPricePerTsubo"
  | "transactionDate";

export interface CaseSortState {
  key: CaseSortKey;
  direction: "asc" | "desc";
}
