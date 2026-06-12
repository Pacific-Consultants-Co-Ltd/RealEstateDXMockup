"use client";

import dynamic from "next/dynamic";
import { Activity, BadgeJapaneseYen, CheckCircle2, DatabaseZap, FileSpreadsheet, Ruler } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import CalculationPanel from "@/components/CalculationPanel";
import CaseDetailDrawer from "@/components/CaseDetailDrawer";
import ComparableTable from "@/components/ComparableTable";
import ErrorFallbackBanner from "@/components/ErrorFallbackBanner";
import Header from "@/components/Header";
import LoadingState from "@/components/LoadingState";
import MarketTrendChart from "@/components/MarketTrendChart";
import SearchInputPanel from "@/components/SearchInputPanel";
import { formatPercent, formatYen, formatYenPerTsubo } from "@/lib/formatters";
import { targetLocation } from "@/lib/mockData";
import { deriveOsakaCoordinates } from "@/lib/normalizers";
import { averageGrowthRate, calculateValuation } from "@/lib/valuation";
import type {
  CaseSortState,
  CaseTableFilters,
  ComparableCase,
  InformationType,
  PublicLandPricePoint,
  SourceToggles,
  TargetLocation
} from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <LoadingState label="地図を初期化しています" />
});

const initialFilters: CaseTableFilters = {
  source: "all",
  zoning: "",
  priceMin: "",
  priceMax: "",
  areaMin: "",
  areaMax: "",
  walkMax: "",
  dateKeyword: ""
};

const initialSourceToggles: SourceToggles = {
  csv: true,
  mlit_transaction: true,
  mlit_land_price: true,
  manual: false
};

interface CsvResponse {
  cases: ComparableCase[];
  warnings?: string[];
  fallback?: boolean;
}

interface TransactionResponse {
  cases: ComparableCase[];
  warning?: string;
  fallback?: boolean;
}

interface LandPriceResponse {
  points: PublicLandPricePoint[];
  warning?: string;
  fallback?: boolean;
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();

  if (!response.ok) {
    const message = Array.isArray(payload?.warnings) ? payload.warnings.join(" ") : "データ取得に失敗しました。";
    throw new Error(message);
  }

  return payload as T;
}

function mergeWarnings(...groups: Array<Array<string | undefined> | undefined>): string[] {
  return Array.from(new Set(groups.flatMap((group) => group ?? []).filter((message): message is string => Boolean(message))));
}

function currentTarget(address: string): TargetLocation {
  if (address === targetLocation.address) {
    return targetLocation;
  }

  return {
    address,
    ...deriveOsakaCoordinates(address, 0)
  };
}

export default function DashboardPage() {
  const [informationType, setInformationType] = useState<InformationType>("取引事例");
  const [address, setAddress] = useState(targetLocation.address);
  const [selectedAreas, setSelectedAreas] = useState(["都島本通5丁目", "滝井元町3丁目", "豊崎6丁目"]);
  const [radius, setRadius] = useState("1km");
  const [landTsubo, setLandTsubo] = useState(100);
  const [adjustmentPercent, setAdjustmentPercent] = useState(0);
  const [sourceToggles, setSourceToggles] = useState(initialSourceToggles);
  const [cases, setCases] = useState<ComparableCase[]>([]);
  const [landPricePoints, setLandPricePoints] = useState<PublicLandPricePoint[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CaseTableFilters>(initialFilters);
  const [sort, setSort] = useState<CaseSortState>({ key: "unitPricePerTsubo", direction: "desc" });
  const [detailCase, setDetailCase] = useState<ComparableCase | null>(null);
  const [lastCalculatedAt, setLastCalculatedAt] = useState("初期表示");

  async function loadAllData() {
    setLoading(true);

    try {
      const [csv, transactions, landPrices] = await Promise.all([
        requestJson<CsvResponse>("/api/demo/csv"),
        requestJson<TransactionResponse>("/api/reinfolib/transactions"),
        requestJson<LandPriceResponse>("/api/reinfolib/land-price-points")
      ]);

      setCases([...(csv.cases ?? []), ...(transactions.cases ?? [])]);
      setLandPricePoints(landPrices.points ?? []);
      setWarnings(mergeWarnings(csv.warnings, [transactions.warning], [landPrices.warning]));
    } catch (error) {
      setWarnings([error instanceof Error ? error.message : "初期データ取得に失敗しました。"]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAllData();
  }, []);

  async function handleLoadCsv() {
    setLoading(true);
    try {
      const csv = await requestJson<CsvResponse>("/api/demo/csv");
      setCases((current) => [...(csv.cases ?? []), ...current.filter((comparable) => comparable.source !== "csv")]);
      setWarnings((current) => mergeWarnings(current, csv.warnings));
    } catch (error) {
      setWarnings((current) => mergeWarnings(current, [error instanceof Error ? error.message : "CSV読み込みに失敗しました。"]));
    } finally {
      setLoading(false);
    }
  }

  async function handleFetchNearby() {
    setLoading(true);
    try {
      const [transactions, landPrices] = await Promise.all([
        requestJson<TransactionResponse>("/api/reinfolib/transactions"),
        requestJson<LandPriceResponse>("/api/reinfolib/land-price-points")
      ]);

      setCases((current) => [
        ...current.filter((comparable) => comparable.source !== "mlit_transaction"),
        ...(transactions.cases ?? [])
      ]);
      setLandPricePoints(landPrices.points ?? []);
      setWarnings((current) => mergeWarnings(current, [transactions.warning], [landPrices.warning]));
    } catch (error) {
      setWarnings((current) =>
        mergeWarnings(current, [error instanceof Error ? error.message : "周辺情報の取得に失敗しました。"])
      );
    } finally {
      setLoading(false);
    }
  }

  function handleRecalculate() {
    setLastCalculatedAt(new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
  }

  function handleToggleCase(id: string) {
    setCases((current) =>
      current.map((comparable) => (comparable.id === id ? { ...comparable, selected: !comparable.selected } : comparable))
    );
  }

  function handleToggleArea(area: string) {
    setSelectedAreas((current) =>
      current.includes(area) ? current.filter((item) => item !== area) : [...current, area]
    );
  }

  function handleSourceToggle(source: keyof SourceToggles) {
    setSourceToggles((current) => ({
      ...current,
      [source]: !current[source]
    }));
  }

  const target = useMemo(() => currentTarget(address), [address]);
  const visibleCases = useMemo(
    () => cases.filter((comparable) => sourceToggles[comparable.source]),
    [cases, sourceToggles]
  );
  const visibleLandPricePoints = sourceToggles.mlit_land_price ? landPricePoints : [];
  const selectedCases = useMemo(() => visibleCases.filter((comparable) => comparable.selected), [visibleCases]);
  const growthRatePercent = useMemo(() => averageGrowthRate(visibleLandPricePoints), [visibleLandPricePoints]);
  const valuation = useMemo(
    () =>
      calculateValuation({
        selectedCases,
        landTsubo,
        growthRatePercent,
        adjustmentPercent
      }),
    [adjustmentPercent, growthRatePercent, landTsubo, selectedCases]
  );

  return (
    <main className="app-shell">
      <Header />
      <ErrorFallbackBanner messages={warnings} />

      <div className="deal-brief">
        <div className="deal-primary">
          <span className="deal-kicker">現在の査定対象</span>
          <strong>{address}</strong>
          <small>
            {selectedAreas.join(" / ")} ・ 半径 {radius}
          </small>
        </div>
        <div className="deal-value">
          <span>概算入札額</span>
          <strong>{formatYen(valuation.bidAmount)}</strong>
          <small>査定額 {formatYen(valuation.appraisalAmount)}</small>
        </div>
        <div className="metric-card metric-accent">
          <BadgeJapaneseYen aria-hidden="true" size={18} />
          <div>
            <span>坪単価相場</span>
            <strong>{formatYenPerTsubo(valuation.averageTsuboUnitPrice)}</strong>
          </div>
        </div>
        <div className="metric-card">
          <FileSpreadsheet aria-hidden="true" size={18} />
          <div>
            <span>CSV</span>
            <strong>{cases.filter((comparable) => comparable.source === "csv").length}件</strong>
          </div>
        </div>
        <div className="metric-card">
          <DatabaseZap aria-hidden="true" size={18} />
          <div>
            <span>API取引</span>
            <strong>{cases.filter((comparable) => comparable.source === "mlit_transaction").length}件</strong>
          </div>
        </div>
        <div className="metric-card">
          <CheckCircle2 aria-hidden="true" size={18} />
          <div>
            <span>選択</span>
            <strong>{selectedCases.length}件</strong>
          </div>
        </div>
        <div className="metric-card">
          <Ruler aria-hidden="true" size={18} />
          <div>
            <span>用地坪数</span>
            <strong>{landTsubo}坪</strong>
          </div>
        </div>
        <div className="metric-card">
          <Activity aria-hidden="true" size={18} />
          <div>
            <span>上昇率</span>
            <strong>{formatPercent(growthRatePercent)}</strong>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <SearchInputPanel
          adjustmentPercent={adjustmentPercent}
          address={address}
          informationType={informationType}
          landTsubo={landTsubo}
          loading={loading}
          radius={radius}
          selectedAreas={selectedAreas}
          sourceToggles={sourceToggles}
          onAddressChange={setAddress}
          onAdjustmentPercentChange={setAdjustmentPercent}
          onFetchNearby={handleFetchNearby}
          onInformationTypeChange={setInformationType}
          onLandTsuboChange={setLandTsubo}
          onLoadCsv={handleLoadCsv}
          onRadiusChange={setRadius}
          onRecalculate={handleRecalculate}
          onSourceToggle={handleSourceToggle}
          onToggleArea={handleToggleArea}
        />

        <div className="center-column">
          {loading && cases.length === 0 ? (
            <section className="panel map-panel">
              <LoadingState label="市場データを読み込んでいます" />
            </section>
          ) : (
            <MapView
              cases={visibleCases}
              landPricePoints={visibleLandPricePoints}
              radius={radius}
              selectedAreas={selectedAreas}
              target={target}
              onToggleCase={handleToggleCase}
            />
          )}

          <div className="selected-case-strip">
            <span>
              <CheckCircle2 aria-hidden="true" size={16} />
              選択中
            </span>
            <div>
              {selectedCases.length === 0 ? (
                <strong>未選択</strong>
              ) : (
                selectedCases.map((comparable) => <strong key={comparable.id}>{comparable.address}</strong>)
              )}
            </div>
          </div>
        </div>

        <div className="right-column">
          <CalculationPanel
            adjustmentPercent={adjustmentPercent}
            growthRatePercent={growthRatePercent}
            result={valuation}
          />
          <MarketTrendChart points={visibleLandPricePoints} />
          <section className="panel production-note">
            <div className="section-heading">
              <span>運用前提</span>
              <small>最終再計算 {lastCalculatedAt}</small>
            </div>
            <p>99.9% availability target / RTO within 30 minutes / 24-365 monitoring in production.</p>
            <p>Temporary domain under まちしるべ domain assumed.</p>
          </section>
        </div>
      </div>

      <ComparableTable
        cases={visibleCases}
        filters={filters}
        sort={sort}
        onFiltersChange={setFilters}
        onOpenDetails={setDetailCase}
        onSortChange={setSort}
        onToggleCase={handleToggleCase}
      />

      <CaseDetailDrawer comparable={detailCase} onClose={() => setDetailCase(null)} />
    </main>
  );
}
