"use client";

import dynamic from "next/dynamic";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useEffect, useMemo, useState } from "react";

import ErrorFallbackBanner from "@/components/ErrorFallbackBanner";
import LoadingState from "@/components/LoadingState";
import type { MapArea } from "@/components/MapView";
import { areaKeyFromAddress, areaLabelFromAddress, normalizeAddress } from "@/lib/areaKeys";
import {
  formatM2,
  formatPercent,
  formatTsubo,
  formatYen,
  formatYenPerM2,
  formatYenPerTsubo
} from "@/lib/formatters";
import { targetLocation } from "@/lib/mockData";
import { deriveOsakaCoordinates } from "@/lib/normalizers";
import { averageGrowthRate, calculateValuation } from "@/lib/valuation";
import type { ComparableCase, InformationType, PublicLandPricePoint, TargetLocation, ValuationResult } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <LoadingState label="地図を初期化しています" />
});

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

interface HistoryRow {
  year: number;
  price: number;
  growth: number;
}

interface AreaSourceItem {
  address: string;
  latitude: number;
  longitude: number;
}

const emptyValuation = calculateValuation({
  selectedCases: [],
  landTsubo: 100,
  growthRatePercent: 0,
  adjustmentPercent: 0
});

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

function withDefaultSelection(items: ComparableCase[]): ComparableCase[] {
  if (items.some((item) => item.selected)) {
    return items;
  }

  const selectedIds = new Set(items.slice(0, 4).map((item) => item.id));
  return items.map((item) => (selectedIds.has(item.id) ? { ...item, selected: true } : item));
}

function buildAreaOptions(items: AreaSourceItem[]): MapArea[] {
  const grouped = new Map<string, { label: string; latitude: number; longitude: number; count: number }>();

  for (const item of items) {
    if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) {
      continue;
    }

    const key = areaKeyFromAddress(item.address);
    const label = areaLabelFromAddress(item.address);
    const current = grouped.get(key);
    if (current) {
      current.latitude += item.latitude;
      current.longitude += item.longitude;
      current.count += 1;
    } else {
      grouped.set(key, { label, latitude: item.latitude, longitude: item.longitude, count: 1 });
    }
  }

  return Array.from(grouped.entries())
    .map(([key, value]) => ({
      key,
      label: value.label,
      latitude: value.latitude / value.count,
      longitude: value.longitude / value.count,
      count: value.count
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "ja"));
}

function caseSourceMatchesInformationType(comparable: ComparableCase, informationType: InformationType): boolean {
  if (informationType === "取引事例") {
    return comparable.source === "mlit_transaction";
  }

  if (informationType === "成約事例" || informationType === "自社データ") {
    return comparable.source === "csv";
  }

  return false;
}

function isCaseInformationType(informationType: InformationType): boolean {
  return informationType !== "公示地価";
}

function informationTypeNotice(informationType: InformationType): string | undefined {
  if (informationType === "成約事例") {
    return "成約事例データは現在デモデータで表示しています。";
  }

  return undefined;
}

function distanceMeters(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }): number {
  const earthRadius = 6_371_000;
  const leftLat = (left.latitude * Math.PI) / 180;
  const rightLat = (right.latitude * Math.PI) / 180;
  const deltaLat = ((right.latitude - left.latitude) * Math.PI) / 180;
  const deltaLng = ((right.longitude - left.longitude) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function latestLandPoints(points: PublicLandPricePoint[]): PublicLandPricePoint[] {
  const byPoint = new Map<string, PublicLandPricePoint>();

  for (const point of points) {
    const current = byPoint.get(point.pointId);
    if (!current || current.year < point.year) {
      byPoint.set(point.pointId, point);
    }
  }

  return Array.from(byPoint.values()).sort((left, right) => {
    const latestYear = right.year - left.year;
    if (latestYear !== 0) {
      return latestYear;
    }

    const distance =
      distanceMeters(targetLocation, { latitude: left.latitude, longitude: left.longitude }) -
      distanceMeters(targetLocation, { latitude: right.latitude, longitude: right.longitude });
    if (Math.abs(distance) > 1) {
      return distance;
    }

    return left.pointId.localeCompare(right.pointId, "ja");
  });
}

function buildHistoryRows(points: PublicLandPricePoint[]): HistoryRow[] {
  const byYear = new Map<number, { price: number; growth: number; count: number }>();

  for (const point of points) {
    if (!Number.isFinite(point.year) || !Number.isFinite(point.pricePerM2)) {
      continue;
    }

    const existing = byYear.get(point.year);
    if (existing) {
      existing.price += point.pricePerM2;
      existing.growth += point.yearOnYearChangeRate;
      existing.count += 1;
    } else {
      byYear.set(point.year, {
        price: point.pricePerM2,
        growth: point.yearOnYearChangeRate,
        count: 1
      });
    }
  }

  return Array.from(byYear.entries())
    .map(([year, value]) => ({
      year,
      price: Math.round(value.price / value.count),
      growth: Number((value.growth / value.count).toFixed(1))
    }))
    .sort((left, right) => right.year - left.year)
    .slice(0, 5)
    .reverse();
}

function stationLabel(comparable: ComparableCase): string {
  const station = comparable.nearestStation?.split(/[ 　]/).filter(Boolean).at(-1);
  return station || comparable.nearestStation || "-";
}

function compactAddress(address: string): string {
  return normalizeAddress(address).replace(/^大阪市/, "");
}

function formatMultiplier(growthRatePercent: number): string {
  return `${formatPercent(growthRatePercent)} / ${(1 + growthRatePercent / 100).toFixed(3)}倍`;
}

export default function DashboardPage() {
  const [informationType, setInformationType] = useState<InformationType>("取引事例");
  const [address, setAddress] = useState(targetLocation.address);
  const [landTsubo, setLandTsubo] = useState(100);
  const [adjustmentPercent, setAdjustmentPercent] = useState(0);
  const [showAllProperties, setShowAllProperties] = useState(true);
  const [selectedAreaKeys, setSelectedAreaKeys] = useState<string[]>([]);
  const [selectedLandPointIds, setSelectedLandPointIds] = useState<string[]>([]);
  const [cases, setCases] = useState<ComparableCase[]>([]);
  const [landPricePoints, setLandPricePoints] = useState<PublicLandPricePoint[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [valuation, setValuation] = useState<ValuationResult>(emptyValuation);
  const [calculationDirty, setCalculationDirty] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);

  async function loadAllData() {
    setLoading(true);

    try {
      const [csv, transactions, landPrices] = await Promise.all([
        requestJson<CsvResponse>("/api/demo/csv"),
        requestJson<TransactionResponse>("/api/reinfolib/transactions"),
        requestJson<LandPriceResponse>("/api/reinfolib/land-price-points")
      ]);

      const nextCsvCases = withDefaultSelection(csv.cases ?? []);
      const nextTransactionCases = withDefaultSelection(transactions.cases ?? []);
      const nextCases = [...nextCsvCases, ...nextTransactionCases];
      const nextLandPricePoints = landPrices.points ?? [];
      const initialLandPointIds = latestLandPoints(nextLandPricePoints)
        .slice(0, 1)
        .map((point) => point.pointId);
      const initialGrowthRate = averageGrowthRate(nextLandPricePoints.filter((point) => initialLandPointIds.includes(point.pointId)));

      setCases(nextCases);
      setLandPricePoints(nextLandPricePoints);
      setSelectedLandPointIds(initialLandPointIds);
      setValuation(
        calculateValuation({
          selectedCases: nextTransactionCases.filter((item) => item.selected),
          landTsubo: 100,
          growthRatePercent: initialGrowthRate,
          adjustmentPercent: 0
        })
      );
      setWarnings(mergeWarnings(csv.warnings, [transactions.warning], [landPrices.warning]));
      setCalculationDirty(false);
    } catch (error) {
      setWarnings([error instanceof Error ? error.message : "初期データ取得に失敗しました。"]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAllData();
  }, []);

  useEffect(() => {
    function handleScroll() {
      setHeaderScrolled(window.scrollY > 0);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function markDirty() {
    setCalculationDirty(true);
  }

  function handleInformationTypeChange(nextInformationType: InformationType) {
    const nextSelectedCases = isCaseInformationType(nextInformationType)
      ? cases.filter((item) => caseSourceMatchesInformationType(item, nextInformationType) && item.selected)
      : [];
    const nextGrowthRatePercent = averageGrowthRate(
      landPricePoints.filter((point) => selectedLandPointIds.includes(point.pointId))
    );

    setInformationType(nextInformationType);
    setShowAllProperties(true);
    setSelectedAreaKeys([]);
    setValuation(
      calculateValuation({
        selectedCases: nextSelectedCases,
        landTsubo,
        growthRatePercent: nextGrowthRatePercent,
        adjustmentPercent
      })
    );
    setCalculationDirty(false);
  }

  function handleToggleCase(id: string) {
    setCases((current) => current.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item)));
    markDirty();
  }

  function handleToggleLandPoint(pointId: string) {
    setSelectedLandPointIds((current) =>
      current.includes(pointId) ? current.filter((id) => id !== pointId) : [...current, pointId]
    );
    markDirty();
  }

  function handleToggleAllProperties() {
    setShowAllProperties((current) => !current);
    setSelectedAreaKeys([]);
    markDirty();
  }

  function handleToggleMapArea(areaKey: string) {
    if (!selectableAreaKeys.has(areaKey)) {
      return;
    }

    setShowAllProperties(false);
    setSelectedAreaKeys((current) =>
      current.includes(areaKey) ? current.filter((key) => key !== areaKey) : [...current, areaKey]
    );
    markDirty();
  }

  function handleRecalculate() {
    setValuation(
      calculateValuation({
        selectedCases: selectedVisibleCases,
        landTsubo,
        growthRatePercent,
        adjustmentPercent
      })
    );
    setCalculationDirty(false);
  }

  const target = useMemo(() => currentTarget(address), [address]);
  const latestPoints = useMemo(() => latestLandPoints(landPricePoints), [landPricePoints]);
  const activeCases = useMemo(
    () => cases.filter((item) => caseSourceMatchesInformationType(item, informationType)),
    [cases, informationType]
  );
  const areaOptions = useMemo(
    () => buildAreaOptions(informationType === "公示地価" ? latestPoints : activeCases),
    [activeCases, informationType, latestPoints]
  );
  const selectableAreaKeys = useMemo(() => new Set(areaOptions.map((area) => area.key)), [areaOptions]);
  const modeNotice = useMemo(() => informationTypeNotice(informationType), [informationType]);
  const visibleCases = useMemo(
    () =>
      isCaseInformationType(informationType)
        ? showAllProperties
          ? activeCases
          : activeCases.filter((item) => selectedAreaKeys.includes(areaKeyFromAddress(item.address)))
        : [],
    [activeCases, informationType, selectedAreaKeys, showAllProperties]
  );
  const selectedVisibleCases = useMemo(() => visibleCases.filter((item) => item.selected), [visibleCases]);
  const visibleLatestPoints = useMemo(
    () =>
      informationType === "公示地価" && !showAllProperties
        ? latestPoints.filter((point) => selectedAreaKeys.includes(areaKeyFromAddress(point.address)))
        : latestPoints,
    [informationType, latestPoints, selectedAreaKeys, showAllProperties]
  );
  const visibleSelectedLandPointIds = useMemo(
    () => new Set(visibleLatestPoints.filter((point) => selectedLandPointIds.includes(point.pointId)).map((point) => point.pointId)),
    [selectedLandPointIds, visibleLatestPoints]
  );
  const selectedLandSeries = useMemo(
    () => landPricePoints.filter((point) => visibleSelectedLandPointIds.has(point.pointId)),
    [landPricePoints, visibleSelectedLandPointIds]
  );
  const growthRatePercent = useMemo(() => averageGrowthRate(selectedLandSeries), [selectedLandSeries]);
  const draftValuation = useMemo(
    () =>
      calculateValuation({
        selectedCases: selectedVisibleCases,
        landTsubo,
        growthRatePercent,
        adjustmentPercent
      }),
    [adjustmentPercent, growthRatePercent, landTsubo, selectedVisibleCases]
  );
  const historyRows = useMemo(() => buildHistoryRows(selectedLandSeries), [selectedLandSeries]);
  const selectedLandPointCount = visibleSelectedLandPointIds.size;
  const allItemsLabel = informationType === "公示地価" ? "全地点表示" : "全物件表示";
  const hideAllItemsLabel = informationType === "公示地価" ? "全地点非表示" : "全物件非表示";
  const draftUnitPriceLabel = selectedVisibleCases.length > 0 ? formatYenPerTsubo(draftValuation.averageTsuboUnitPrice) : "-";
  const appraisalAmountLabel = valuation.selectedCount > 0 ? formatYen(valuation.appraisalAmount) : "-";
  const bidAmountLabel = valuation.selectedCount > 0 ? formatYen(valuation.bidAmount) : "-";

  return (
    <main className="report-app">
      <section className="report-sheet" aria-label="用地取得査定">
        <header className="report-header">
          <div className={`report-masthead${headerScrolled ? " is-scrolled" : ""}`}>
            <img
              className="brand-bar"
              src="/logo_panasonichomes.png"
              alt="Panasonic Homes"
            />
          </div>

          <div className="report-header-grid">
            <div className="labeled-block input-block">
              <SectionLabel label="査定条件" />
              <div className="report-info-table" aria-label="査定条件">
                <label className="report-info-row">
                  <span>情報種別</span>
                  <select value={informationType} onChange={(event) => handleInformationTypeChange(event.target.value as InformationType)}>
                    <option>取引事例</option>
                    <option>成約事例</option>
                    <option>公示地価</option>
                    <option>自社データ</option>
                  </select>
                </label>
                <label className="report-info-row">
                  <span>所在地</span>
                  <input value={address} onChange={(event) => setAddress(event.target.value)} />
                </label>
                <label className="report-info-row">
                  <span>敷地面積</span>
                  <input
                    inputMode="decimal"
                    type="number"
                    value={landTsubo}
                    onChange={(event) => {
                      setLandTsubo(Number(event.target.value) || 0);
                      markDirty();
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="brand-panel">
              <SectionLabel label="査定結果" />
              <div className="valuation-strip" aria-label="査定結果">
                <MetricBox label="単価相場" value={draftUnitPriceLabel} />
                <MetricBox label="上昇率" value={formatPercent(growthRatePercent)} />
                <MetricBox label="査定金額" value={appraisalAmountLabel} />
                <MetricBox label="入札額" value={bidAmountLabel} strong />
              </div>
            </div>
          </div>
        </header>

        <ErrorFallbackBanner messages={warnings} />
        {modeNotice ? <div className="mode-notice">{modeNotice}</div> : null}

        <section className="evidence-grid" aria-label="周辺資料">
          <div className="report-map">
            <div className="section-toolbar">
              <SectionLabel label="エリア" />
              <VisibilityToggleButton
                allItemsLabel={allItemsLabel}
                hideAllItemsLabel={hideAllItemsLabel}
                showAllProperties={showAllProperties}
                onToggle={handleToggleAllProperties}
              />
            </div>
            <div className="report-map-body">
              {loading && cases.length === 0 ? (
                <LoadingState label="市場データを読み込んでいます" />
              ) : (
                <MapView
                  areas={areaOptions}
                  selectedAreaKeys={selectedAreaKeys}
                  target={target}
                  onToggleArea={handleToggleMapArea}
                />
              )}
            </div>
          </div>

          <section className="report-chart" aria-label="公示地価推移">
            <SectionLabel label="地価推移" />
            {historyRows.length === 0 ? (
              <LoadingState label="地価地点を選択" />
            ) : (
              <ResponsiveContainer height="100%" width="100%">
                <BarChart barCategoryGap="18%" data={historyRows} margin={{ top: 10, right: 4, bottom: 2, left: 0 }}>
                  <CartesianGrid stroke="#e6e8ec" vertical={false} />
                  <XAxis dataKey="year" fontSize={10} interval={0} minTickGap={0} tickLine={false} tickMargin={6} />
                  <YAxis fontSize={10} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}千`} width={34} />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === "価格") {
                        return [formatYenPerM2(Number(value)), name];
                      }

                      return [formatPercent(Number(value)), name];
                    }}
                    labelFormatter={(label) => `${label}年`}
                  />
                  <Bar dataKey="price" fill="#b42318" maxBarSize={24} name="価格" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          <aside className="history-panel">
            <div className="history-title">公示地価</div>
            <LandPointTable
              emptyLabel={informationType === "公示地価" && !showAllProperties ? "選択エリア内の地価地点なし" : "地価地点なし"}
              points={visibleLatestPoints}
              selectedPointIds={selectedLandPointIds}
              onToggle={handleToggleLandPoint}
            />
            <HistoryTable rows={historyRows} />
          </aside>
        </section>

        <CalculationFlow
          adjustmentPercent={adjustmentPercent}
          dirty={calculationDirty}
          draftValuation={draftValuation}
          growthRatePercent={growthRatePercent}
          landTsubo={landTsubo}
          selectedCaseCount={selectedVisibleCases.length}
          selectedLandPointCount={selectedLandPointCount}
          valuation={valuation}
          onAdjustmentPercentChange={(value) => {
            setAdjustmentPercent(value);
            markDirty();
          }}
          onRecalculate={handleRecalculate}
        />

        {isCaseInformationType(informationType) ? (
          <>
            <SelectedCaseTable cases={selectedVisibleCases} informationType={informationType} />
            <PropertyTable
              cases={visibleCases}
              informationType={informationType}
              selectedCount={selectedVisibleCases.length}
              onToggleCase={handleToggleCase}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <div className="section-label">{label}</div>;
}

function MetricBox({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`metric-box ${strong ? "strong" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function VisibilityToggleButton({
  allItemsLabel,
  hideAllItemsLabel,
  showAllProperties,
  onToggle
}: {
  allItemsLabel: string;
  hideAllItemsLabel: string;
  showAllProperties: boolean;
  onToggle: () => void;
}) {
  const activeLabel = showAllProperties ? hideAllItemsLabel : allItemsLabel;

  return (
    <button aria-label={activeLabel} className="report-toggle-button" type="button" translate="no" onClick={onToggle}>
      <span aria-hidden="true" className="report-toggle-icon">
        <span hidden={!showAllProperties}>
          <EyeOff size={14} />
        </span>
        <span hidden={showAllProperties}>
          <Eye size={14} />
        </span>
      </span>
      <span className="report-toggle-label" hidden={!showAllProperties}>
        {hideAllItemsLabel}
      </span>
      <span className="report-toggle-label" hidden={showAllProperties}>
        {allItemsLabel}
      </span>
    </button>
  );
}

function CalculationFlow({
  adjustmentPercent,
  dirty,
  draftValuation,
  growthRatePercent,
  landTsubo,
  selectedCaseCount,
  selectedLandPointCount,
  valuation,
  onAdjustmentPercentChange,
  onRecalculate
}: {
  adjustmentPercent: number;
  dirty: boolean;
  draftValuation: ValuationResult;
  growthRatePercent: number;
  landTsubo: number;
  selectedCaseCount: number;
  selectedLandPointCount: number;
  valuation: ValuationResult;
  onAdjustmentPercentChange: (value: number) => void;
  onRecalculate: () => void;
}) {
  return (
    <section className="calculation-panel">
      <div className="panel-heading compact">
        <div>
          <h2>計算</h2>
          <p>
            物件 {selectedCaseCount}件 / 地価 {selectedLandPointCount}地点
          </p>
        </div>
        {dirty ? <strong className="dirty-label">未再計算</strong> : null}
      </div>

      <div className="formula-row">
        <FormulaValue label="用地坪数" value={formatTsubo(landTsubo)} />
        <Operator value="×" />
        <FormulaValue label="坪単価相場" value={selectedCaseCount > 0 ? formatYenPerTsubo(draftValuation.averageTsuboUnitPrice) : "-"} />
        <Operator value="×" />
        <FormulaValue label="地価上昇率" value={formatMultiplier(growthRatePercent)} />
        <Operator value="=" />
        <FormulaValue label="査定額" value={valuation.selectedCount > 0 ? formatYen(valuation.appraisalAmount) : "-"} strong />
        <Operator value="→" />
        <label className="formula-cell input-cell suffix-cell">
          <span>補正係数</span>
          <input
            inputMode="decimal"
            type="number"
            value={adjustmentPercent}
            onChange={(event) => onAdjustmentPercentChange(Number(event.target.value) || 0)}
          />
          <small>%</small>
        </label>
        <Operator value="=" />
        <FormulaValue label="入札額" value={valuation.selectedCount > 0 ? formatYen(valuation.bidAmount) : "-"} accent />
        <button className="recalculate-button" type="button" onClick={onRecalculate}>
          <RefreshCw aria-hidden="true" size={16} />
          再計算
        </button>
      </div>
    </section>
  );
}

function FormulaValue({ label, value, accent = false, strong = false }: { label: string; value: string; accent?: boolean; strong?: boolean }) {
  return (
    <div className={`formula-cell ${accent ? "accent" : ""} ${strong ? "strong" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Operator({ value }: { value: string }) {
  return <div className="formula-operator">{value}</div>;
}

function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  return (
    <div className="history-table-wrap">
      <table className="history-table">
        <thead>
          <tr>
            <th>年</th>
            <th>価格(円/㎡)</th>
            <th>変動率</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3}>地価推移なし</td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={row.year}>
              <td>{row.year}年</td>
              <td>{Math.round(row.price).toLocaleString("ja-JP")}</td>
              <td>{row.growth.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LandPointTable({
  emptyLabel,
  points,
  selectedPointIds,
  onToggle
}: {
  emptyLabel: string;
  points: PublicLandPricePoint[];
  selectedPointIds: string[];
  onToggle: (pointId: string) => void;
}) {
  return (
    <div className="land-table-wrap">
      <table className="land-table">
        <thead>
          <tr>
            <th>選択</th>
            <th>地点</th>
            <th>価格</th>
            <th>変動率</th>
          </tr>
        </thead>
        <tbody>
          {points.length === 0 ? (
            <tr>
              <td colSpan={4}>{emptyLabel}</td>
            </tr>
          ) : null}
          {points.map((point) => (
            <tr className={selectedPointIds.includes(point.pointId) ? "active-row" : ""} key={point.id}>
              <td>
                <input
                  aria-label={`${point.standardLotNumber || point.pointId}を選択`}
                  checked={selectedPointIds.includes(point.pointId)}
                  type="checkbox"
                  onChange={() => onToggle(point.pointId)}
                />
              </td>
              <td>
                <strong>{point.standardLotNumber || point.pointId}</strong>
                <span>{point.nearestStation || "-"}</span>
              </td>
              <td>{formatYenPerM2(point.pricePerM2)}</td>
              <td>{formatPercent(point.yearOnYearChangeRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SelectedCaseTable({ cases, informationType }: { cases: ComparableCase[]; informationType: InformationType }) {
  return (
    <section className="selected-case-panel">
      <div className="panel-heading compact selected-case-heading">
        <h2>選択中の{informationType}</h2>
        <p className="property-count">計算対象 {cases.length}件</p>
      </div>
      <div className="selected-case-table-wrap">
        <table className="selected-case-table">
          <thead>
            <tr>
              <th>町丁目</th>
              <th>所在地</th>
              <th>土地</th>
              <th>取引総額</th>
              <th>坪単価</th>
              <th>取引時期</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 ? (
              <tr>
                <td colSpan={6}>選択なし</td>
              </tr>
            ) : null}
            {cases.map((comparable) => (
              <tr key={comparable.id}>
                <td>{areaLabelFromAddress(comparable.address)}</td>
                <td>{compactAddress(comparable.address)}</td>
                <td>
                  {formatTsubo(comparable.landAreaTsubo)}
                  <span>{formatM2(comparable.landAreaM2)}</span>
                </td>
                <td>{comparable.priceTotalDisplay || formatYen(comparable.priceTotalYen)}</td>
                <td>{formatYenPerTsubo(comparable.unitPricePerTsubo)}</td>
                <td>{comparable.transactionDate || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PropertyTable({
  cases,
  informationType,
  selectedCount,
  onToggleCase
}: {
  cases: ComparableCase[];
  informationType: InformationType;
  selectedCount: number;
  onToggleCase: (id: string) => void;
}) {
  return (
    <section className="property-panel">
      <div className="panel-heading compact property-heading">
        <h2>{informationType}</h2>
        <p className="property-count">
          表示中の全事例 {cases.length}件 / 選択 {selectedCount}件
        </p>
      </div>
      <div className="property-table-wrap">
        <table className="property-table">
          <thead>
            <tr>
              <th>選択</th>
              <th>町丁目</th>
              <th>所在地</th>
              <th>最寄駅</th>
              <th>土地</th>
              <th>取引総額</th>
              <th>坪単価</th>
              <th>前面道路</th>
              <th>取引時期</th>
            </tr>
          </thead>
          <tbody>
          {cases.length === 0 ? (
            <tr>
              <td colSpan={9}>表示対象なし</td>
            </tr>
          ) : null}
            {cases.map((comparable) => (
              <tr className={comparable.selected ? "active-row" : ""} key={comparable.id}>
                <td>
                  <input
                    aria-label={`${comparable.address}を選択`}
                    checked={comparable.selected}
                    type="checkbox"
                    onChange={() => onToggleCase(comparable.id)}
                  />
                </td>
                <td>{areaLabelFromAddress(comparable.address)}</td>
                <td>{compactAddress(comparable.address)}</td>
                <td>
                  <strong>{stationLabel(comparable)}</strong>
                  <span>{comparable.access || "-"}</span>
                </td>
                <td>
                  {formatTsubo(comparable.landAreaTsubo)}
                  <span>{formatM2(comparable.landAreaM2)}</span>
                </td>
                <td>{comparable.priceTotalDisplay || formatYen(comparable.priceTotalYen)}</td>
                <td>{formatYenPerTsubo(comparable.unitPricePerTsubo)}</td>
                <td>{comparable.roadCondition || "-"}</td>
                <td>{comparable.transactionDate || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
