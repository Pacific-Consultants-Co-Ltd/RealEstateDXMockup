"use client";

import dynamic from "next/dynamic";
import { MapPin, MapPinOff, SquareX } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import ErrorFallbackBanner from "@/components/ErrorFallbackBanner";
import LoadingState from "@/components/LoadingState";
import type { CaseMapMarker, LandPriceMapMarker, MapArea, MapMarkerMode, TargetPickLocation } from "@/components/MapView";
import {
  areaBaseKeyFromAddress,
  areaBaseLabelFromAddress,
  areaKeyFromAddress,
  areaLabelFromAddress,
  normalizeAddress
} from "@/lib/areaKeys";
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

interface ReverseGeocodeResponse {
  address: string;
  latitude: number;
  longitude: number;
  warning?: string;
}

interface HistoryRow {
  year: number;
  price: number;
  growth: number;
}

interface AreaSourceItem {
  address: string;
  areaKey?: string;
  areaLabel?: string;
  latitude: number;
  longitude: number;
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

function clearCaseSelection(items: ComparableCase[]): ComparableCase[] {
  return items.map((item) => ({ ...item, selected: false }));
}

function buildAreaOptions(items: AreaSourceItem[]): MapArea[] {
  const grouped = new Map<string, { label: string; latitude: number; longitude: number; count: number }>();

  for (const item of items) {
    if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) {
      continue;
    }

    const key = item.areaKey ?? areaKeyFromAddress(item.address);
    const label = item.areaLabel ?? areaLabelFromAddress(item.address);
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

function areaKeyForInformationType(address: string, informationType: InformationType): string {
  return informationType === "公示地価" ? areaKeyFromAddress(address) : areaBaseKeyFromAddress(address);
}

function areaLabelForInformationType(address: string, informationType: InformationType): string {
  return informationType === "公示地価" ? areaLabelFromAddress(address) : areaBaseLabelFromAddress(address);
}

function caseSourceMatchesInformationType(comparable: ComparableCase, informationType: InformationType): boolean {
  if (informationType === "全事例") {
    return comparable.source === "mlit_transaction" || comparable.source === "csv";
  }

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

function coordinateAddress({ latitude, longitude }: TargetPickLocation): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export default function DashboardPage() {
  const [informationType, setInformationType] = useState<InformationType>("取引事例");
  const [address, setAddress] = useState(targetLocation.address);
  const [targetOverride, setTargetOverride] = useState<TargetLocation | undefined>();
  const [targetPlacementActive, setTargetPlacementActive] = useState(false);
  const [targetPlacementBaseAddress, setTargetPlacementBaseAddress] = useState<string | undefined>();
  const [targetLookupWarning, setTargetLookupWarning] = useState<string | undefined>();
  const [targetLookupInProgress, setTargetLookupInProgress] = useState(false);
  const [landTsubo, setLandTsubo] = useState(100);
  const [adjustmentPercent, setAdjustmentPercent] = useState(0);
  const [selectedAreaKeys, setSelectedAreaKeys] = useState<string[]>([]);
  const [selectedLandPointIds, setSelectedLandPointIds] = useState<string[]>([]);
  const [cases, setCases] = useState<ComparableCase[]>([]);
  const [landPricePoints, setLandPricePoints] = useState<PublicLandPricePoint[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const targetLookupRequestIdRef = useRef(0);

  async function loadAllData() {
    setLoading(true);

    try {
      const [csv, transactions, landPrices] = await Promise.all([
        requestJson<CsvResponse>("/api/demo/csv"),
        requestJson<TransactionResponse>("/api/reinfolib/transactions"),
        requestJson<LandPriceResponse>("/api/reinfolib/land-price-points")
      ]);

      const nextCsvCases = clearCaseSelection(csv.cases ?? []);
      const nextTransactionCases = clearCaseSelection(transactions.cases ?? []);
      const nextCases = [...nextCsvCases, ...nextTransactionCases];
      const nextLandPricePoints = landPrices.points ?? [];
      const defaultLandPointIds = latestLandPoints(nextLandPricePoints).map((point) => point.pointId);

      setCases(nextCases);
      setLandPricePoints(nextLandPricePoints);
      setSelectedLandPointIds(defaultLandPointIds);
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

  useEffect(() => {
    function handleScroll() {
      setHeaderScrolled(window.scrollY > 0);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function handleInformationTypeChange(nextInformationType: InformationType) {
    setInformationType(nextInformationType);
    setSelectedAreaKeys([]);
  }

  function handleAddressChange(nextAddress: string) {
    targetLookupRequestIdRef.current += 1;
    setAddress(nextAddress);
    setTargetOverride(undefined);
    setTargetPlacementBaseAddress(undefined);
    setTargetPlacementActive(false);
    setTargetLookupWarning(undefined);
    setTargetLookupInProgress(false);
  }

  function handleTargetPlacementToggle() {
    setTargetPlacementActive((current) => {
      if (current) {
        if (!targetOverride) {
          setTargetPlacementBaseAddress(undefined);
        }

        return false;
      }

      setTargetPlacementBaseAddress((currentBaseAddress) => (targetOverride ? currentBaseAddress : address));
      return true;
    });
  }

  function handleClearTargetPin() {
    targetLookupRequestIdRef.current += 1;
    setTargetPlacementActive(false);
    setTargetLookupInProgress(false);
    setTargetLookupWarning(undefined);
    setTargetOverride(undefined);
    setAddress(targetPlacementBaseAddress ?? targetLocation.address);
    setTargetPlacementBaseAddress(undefined);
  }

  async function handlePickTarget(location: TargetPickLocation) {
    const requestId = targetLookupRequestIdRef.current + 1;
    targetLookupRequestIdRef.current = requestId;
    const fallbackAddress = coordinateAddress(location);
    setTargetPlacementActive(false);
    setTargetLookupInProgress(true);
    setTargetLookupWarning(undefined);
    setAddress(fallbackAddress);
    setTargetOverride({
      address: fallbackAddress,
      latitude: location.latitude,
      longitude: location.longitude
    });

    try {
      const params = new URLSearchParams({
        lat: String(location.latitude),
        lng: String(location.longitude)
      });
      const payload = await requestJson<ReverseGeocodeResponse>(`/api/geocode/reverse?${params.toString()}`);
      const nextAddress = payload.address || fallbackAddress;

      if (targetLookupRequestIdRef.current !== requestId) {
        return;
      }

      setAddress(nextAddress);
      setTargetOverride({
        address: nextAddress,
        latitude: location.latitude,
        longitude: location.longitude
      });
      setTargetLookupWarning(payload.warning);
    } catch (error) {
      if (targetLookupRequestIdRef.current !== requestId) {
        return;
      }

      setTargetLookupWarning(error instanceof Error ? error.message : "住所を取得できなかったため、座標を表示しています。");
    } finally {
      if (targetLookupRequestIdRef.current === requestId) {
        setTargetLookupInProgress(false);
      }
    }
  }

  function handleToggleCase(id: string) {
    setCases((current) => current.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item)));
  }

  function handleSetCaseSelection(ids: string[], selected: boolean) {
    const targetIds = new Set(ids);
    setCases((current) => current.map((item) => (targetIds.has(item.id) ? { ...item, selected } : item)));
  }

  function handleToggleLandPoint(pointId: string) {
    setSelectedLandPointIds((current) =>
      current.includes(pointId) ? current.filter((id) => id !== pointId) : [...current, pointId]
    );
  }

  function handleSetLandPointSelection(pointIds: string[], selected: boolean) {
    const targetPointIds = new Set(pointIds);
    setSelectedLandPointIds((current) => {
      if (selected) {
        return Array.from(new Set([...current, ...targetPointIds]));
      }

      return current.filter((pointId) => !targetPointIds.has(pointId));
    });
  }

  function handleToggleMapArea(areaKey: string) {
    if (!selectableAreaKeys.has(areaKey)) {
      return;
    }

    setSelectedAreaKeys((current) => {
      return current.includes(areaKey) ? current.filter((key) => key !== areaKey) : [...current, areaKey];
    });
  }

  function handleClearAreaFilter() {
    setSelectedAreaKeys([]);
  }

  const target = useMemo(
    () => (targetOverride && targetOverride.address === address ? targetOverride : currentTarget(address)),
    [address, targetOverride]
  );
  const latestPoints = useMemo(() => latestLandPoints(landPricePoints), [landPricePoints]);
  const activeCases = useMemo(
    () => cases.filter((item) => caseSourceMatchesInformationType(item, informationType)),
    [cases, informationType]
  );
  const areaSourceItems = useMemo<AreaSourceItem[]>(
    () =>
      (informationType === "公示地価" ? latestPoints : activeCases).map((item) => ({
        address: item.address,
        areaKey: areaKeyForInformationType(item.address, informationType),
        areaLabel: areaLabelForInformationType(item.address, informationType),
        latitude: item.latitude,
        longitude: item.longitude
      })),
    [activeCases, informationType, latestPoints]
  );
  const areaOptions = useMemo(
    () => buildAreaOptions(areaSourceItems),
    [areaSourceItems]
  );
  const selectableAreaKeys = useMemo(() => new Set(areaOptions.map((area) => area.key)), [areaOptions]);
  const modeNotice = useMemo(() => informationTypeNotice(informationType), [informationType]);
  const visibleCases = useMemo(
    () =>
      isCaseInformationType(informationType)
        ? selectedAreaKeys.length === 0
          ? activeCases
          : activeCases.filter((item) => selectedAreaKeys.includes(areaKeyForInformationType(item.address, informationType)))
        : [],
    [activeCases, informationType, selectedAreaKeys]
  );
  const selectedVisibleCases = useMemo(() => visibleCases.filter((item) => item.selected), [visibleCases]);
  const visibleLatestPoints = useMemo(
    () =>
      informationType === "公示地価" && selectedAreaKeys.length > 0
        ? latestPoints.filter((point) => selectedAreaKeys.includes(areaKeyFromAddress(point.address)))
        : latestPoints,
    [informationType, latestPoints, selectedAreaKeys]
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
  const valuation = useMemo(
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
  const mapMarkerMode: MapMarkerMode = informationType === "公示地価" ? "land-price" : "cases";
  const hasSelectedAreas = selectedAreaKeys.length > 0;
  const selectedAreaSummary = useMemo(() => {
    const labelByKey = new Map(areaOptions.map((area) => [area.key, area.label]));
    const labels = selectedAreaKeys
      .map((key) => labelByKey.get(key))
      .filter((label): label is string => Boolean(label));

    if (labels.length === 0) {
      return "全エリア";
    }

    return labels.length === 1 ? labels[0] : `${labels[0]} 他${labels.length - 1}件`;
  }, [areaOptions, selectedAreaKeys]);
  const caseMapMarkers = useMemo<CaseMapMarker[]>(
    () =>
      visibleCases
        .filter((comparable) => Number.isFinite(comparable.latitude) && Number.isFinite(comparable.longitude))
        .map((comparable) => ({
          areaKey: areaBaseKeyFromAddress(comparable.address),
          id: comparable.id,
          label: areaBaseLabelFromAddress(comparable.address),
          subtitle: compactAddress(comparable.address),
          valueLabel: comparable.priceTotalDisplay || formatYen(comparable.priceTotalYen),
          detailLabel: formatYenPerTsubo(comparable.unitPricePerTsubo),
          latitude: comparable.latitude,
          longitude: comparable.longitude,
          selected: comparable.selected,
          snapToAreaCentroid: true
        })),
    [visibleCases]
  );
  const landPriceMapMarkers = useMemo<LandPriceMapMarker[]>(
    () =>
      visibleLatestPoints
        .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
        .map((point) => ({
          areaKey: areaKeyFromAddress(point.address),
          pointId: point.pointId,
          label: point.standardLotNumber || point.pointId,
          subtitle: [point.nearestStation, point.distanceToStation].filter(Boolean).join(" ") || compactAddress(point.address),
          valueLabel: formatYenPerM2(point.pricePerM2),
          detailLabel: formatPercent(point.yearOnYearChangeRate),
          latitude: point.latitude,
          longitude: point.longitude,
          selected: visibleSelectedLandPointIds.has(point.pointId),
          snapToAreaCentroid: point.raw.fallback === true
        })),
    [visibleLatestPoints, visibleSelectedLandPointIds]
  );
  const draftUnitPriceLabel = selectedVisibleCases.length > 0 ? formatYenPerTsubo(valuation.averageTsuboUnitPrice) : "-";
  const appraisalAmountLabel = valuation.selectedCount > 0 ? formatYen(valuation.appraisalAmount) : "-";
  const bidAmountLabel = valuation.selectedCount > 0 ? formatYen(valuation.bidAmount) : "-";

  return (
    <main className="report-app">
      <section className="report-sheet" aria-label="用地取得査定">
        <header className="report-header">
          <div className={`report-masthead${headerScrolled ? " is-scrolled" : ""}`}>
            <div className="brand-bar" aria-label="まちしるべPRO（仮）">
              <span>まちしるべPRO</span>
              <small>（仮）</small>
            </div>
          </div>

          <div className="report-header-grid">
            <div className="labeled-block input-block">
              <SectionLabel label="査定条件" />
              <div className="report-info-table" aria-label="査定条件">
                <label className="report-info-row">
                  <span>情報種別</span>
                  <select value={informationType} onChange={(event) => handleInformationTypeChange(event.target.value as InformationType)}>
                    <option>取引事例</option>
                    <option>全事例</option>
                    <option>成約事例</option>
                    <option>公示地価</option>
                    <option>自社データ</option>
                  </select>
                </label>
                <label className="report-info-row">
                  <span>所在地</span>
                  <input value={address} onChange={(event) => handleAddressChange(event.target.value)} />
                </label>
                <label className="report-info-row">
                  <span>敷地面積</span>
                  <input
                    inputMode="decimal"
                    type="number"
                    value={landTsubo}
                    onChange={(event) => {
                      setLandTsubo(Number(event.target.value) || 0);
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

        <ErrorFallbackBanner messages={mergeWarnings(warnings, [targetLookupWarning])} />
        {modeNotice ? <div className="mode-notice">{modeNotice}</div> : null}

        <section className="evidence-grid" aria-label="周辺資料">
          <div className="report-map">
            <div className="section-toolbar">
              <SectionLabel label="周辺エリア" />
              <AreaFilterStatus active={hasSelectedAreas} label={selectedAreaSummary} onClear={handleClearAreaFilter} />
              <TargetPlacementButton
                active={targetPlacementActive}
                busy={targetLookupInProgress}
                onToggle={handleTargetPlacementToggle}
              />
              {targetOverride ? <TargetPinClearButton onClear={handleClearTargetPin} /> : null}
            </div>
            <div className="report-map-body">
              {loading && cases.length === 0 ? (
                <LoadingState label="市場データを読み込んでいます" />
              ) : (
                <MapView
                  areas={areaOptions}
                  caseMarkers={caseMapMarkers}
                  landPriceMarkers={landPriceMapMarkers}
                  markerMode={mapMarkerMode}
                  selectedAreaKeys={selectedAreaKeys}
                  target={target}
                  targetPlacementActive={targetPlacementActive}
                  onToggleArea={handleToggleMapArea}
                  onPickTarget={handlePickTarget}
                />
              )}
            </div>
          </div>

          <section className="report-chart" aria-label="公示地価推移">
            <SectionLabel label="地価推移" />
            {loading && landPricePoints.length === 0 ? (
              <LoadingState label="地価地点を読み込んでいます" />
            ) : historyRows.length === 0 ? (
              <EmptyPanelState label={visibleLatestPoints.length === 0 ? "地価地点なし" : "計算対象の地価地点を選択"} />
            ) : (
              <ResponsiveContainer height="100%" width="100%">
                <BarChart barCategoryGap="18%" data={historyRows} margin={{ top: 10, right: 4, bottom: 2, left: 0 }}>
                  <CartesianGrid stroke="#c1d0df" vertical={false} />
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
                  <Bar dataKey="price" fill="#005bac" maxBarSize={24} name="価格" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          <aside className="history-panel">
            <div className="history-title">公示地価</div>
            <LandPointTable
              emptyLabel={informationType === "公示地価" && hasSelectedAreas ? "選択エリア内の地価地点なし" : "地価地点なし"}
              points={visibleLatestPoints}
              selectedPointIds={selectedLandPointIds}
              onSetPointSelection={handleSetLandPointSelection}
              onToggle={handleToggleLandPoint}
            />
            <HistoryTable rows={historyRows} />
          </aside>
        </section>

        <CalculationFlow
          adjustmentPercent={adjustmentPercent}
          growthRatePercent={growthRatePercent}
          landTsubo={landTsubo}
          selectedCaseCount={selectedVisibleCases.length}
          selectedLandPointCount={selectedLandPointCount}
          valuation={valuation}
          onAdjustmentPercentChange={(value) => {
            setAdjustmentPercent(value);
          }}
        >
          {isCaseInformationType(informationType) ? (
            <SelectedCaseTable
              cases={selectedVisibleCases}
              informationType={informationType}
            />
          ) : null}
        </CalculationFlow>

        {isCaseInformationType(informationType) ? (
          <>
            <PropertyTable
              cases={visibleCases}
              informationType={informationType}
              selectedCount={selectedVisibleCases.length}
              onSetCaseSelection={handleSetCaseSelection}
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

function EmptyPanelState({ label }: { label: string }) {
  return (
    <div className="empty-panel-state">
      <span>{label}</span>
    </div>
  );
}

function MetricBox({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`metric-box ${strong ? "strong" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AreaFilterStatus({ active, label, onClear }: { active: boolean; label: string; onClear: () => void }) {
  return (
    <div aria-label={`表示範囲: ${label}`} className={`area-filter-status${active ? " is-active" : ""}`}>
      <span className="area-filter-label">{active ? "絞込中" : "表示範囲"}</span>
      <span className="area-filter-value" title={label}>
        {label}
      </span>
      {active ? (
        <button aria-label="エリア絞込を解除" className="area-filter-clear-button" title="エリア絞込を解除" type="button" onClick={onClear}>
          <SquareX aria-hidden="true" size={13} strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}

function TargetPlacementButton({
  active,
  busy,
  onToggle
}: {
  active: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const label = busy ? "住所取得中" : active ? "査定地指定中" : "査定地指定";

  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`target-placement-button${active ? " is-active" : ""}`}
      disabled={busy}
      title={active ? "地図をクリックして査定地を指定" : "査定地を地図で指定"}
      type="button"
      onClick={onToggle}
    >
      <MapPin aria-hidden="true" size={14} strokeWidth={2.5} />
      <span>{label}</span>
    </button>
  );
}

function TargetPinClearButton({ onClear }: { onClear: () => void }) {
  const label = "指定した査定地を解除";

  return (
    <button aria-label={label} className="target-clear-button" title={label} type="button" onClick={onClear}>
      <MapPinOff aria-hidden="true" size={14} strokeWidth={2.5} />
    </button>
  );
}

function CalculationFlow({
  adjustmentPercent,
  children,
  growthRatePercent,
  landTsubo,
  selectedCaseCount,
  selectedLandPointCount,
  valuation,
  onAdjustmentPercentChange
}: {
  adjustmentPercent: number;
  children?: ReactNode;
  growthRatePercent: number;
  landTsubo: number;
  selectedCaseCount: number;
  selectedLandPointCount: number;
  valuation: ValuationResult;
  onAdjustmentPercentChange: (value: number) => void;
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
      </div>

      <div className="formula-row">
        <FormulaValue label="用地坪数" value={formatTsubo(landTsubo)} />
        <Operator value="×" />
        <FormulaValue label="坪単価相場" value={selectedCaseCount > 0 ? formatYenPerTsubo(valuation.averageTsuboUnitPrice) : "-"} />
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
      </div>
      {children}
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
  onSetPointSelection,
  onToggle
}: {
  emptyLabel: string;
  points: PublicLandPricePoint[];
  selectedPointIds: string[];
  onSetPointSelection: (pointIds: string[], selected: boolean) => void;
  onToggle: (pointId: string) => void;
}) {
  const selectedPointCount = points.filter((point) => selectedPointIds.includes(point.pointId)).length;
  const allPointsSelected = points.length > 0 && selectedPointCount === points.length;

  return (
    <div className="land-table-wrap">
      <table className="land-table">
        <thead>
          <tr>
            <th>
              <SelectAllRowsCheckbox
                checked={allPointsSelected}
                disabled={points.length === 0}
                indeterminate={selectedPointCount > 0 && selectedPointCount < points.length}
                label="表示中の公示地価をすべて計算対象にする、または外す"
                onToggle={() => onSetPointSelection(points.map((point) => point.pointId), !allPointsSelected)}
              />
            </th>
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
                  aria-label={`${point.standardLotNumber || point.pointId}を計算対象にする`}
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

function SelectAllRowsCheckbox({
  checked,
  disabled,
  indeterminate,
  label,
  onToggle
}: {
  checked: boolean;
  disabled: boolean;
  indeterminate: boolean;
  label: string;
  onToggle: () => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={checkboxRef}
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      checked={checked}
      disabled={disabled}
      title={label}
      type="checkbox"
      onChange={onToggle}
    />
  );
}

function SelectedCaseTable({
  cases,
  informationType
}: {
  cases: ComparableCase[];
  informationType: InformationType;
}) {
  return (
    <section className="selected-case-panel">
      <div className="panel-heading compact selected-case-heading">
        <h2>計算対象の{informationType}</h2>
        <p className="property-count">
          計算対象 {cases.length}件
        </p>
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
                <td colSpan={6}>対象なし</td>
              </tr>
            ) : null}
            {cases.map((comparable) => (
              <tr className={comparable.selected ? "active-row" : ""} key={comparable.id}>
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
  onSetCaseSelection,
  onToggleCase
}: {
  cases: ComparableCase[];
  informationType: InformationType;
  selectedCount: number;
  onSetCaseSelection: (ids: string[], selected: boolean) => void;
  onToggleCase: (id: string) => void;
}) {
  const allRowsSelected = cases.length > 0 && selectedCount === cases.length;

  return (
    <section className="property-panel">
      <div className="panel-heading compact property-heading">
        <h2>{informationType}</h2>
        <p className="property-count">
          表示中の全事例 {cases.length}件 / 対象 {selectedCount}件
        </p>
      </div>
      <div className="property-table-wrap">
        <table className="property-table">
          <thead>
            <tr>
              <th>
                <SelectAllRowsCheckbox
                  checked={allRowsSelected}
                  disabled={cases.length === 0}
                  indeterminate={selectedCount > 0 && selectedCount < cases.length}
                  label={`表示中の${informationType}をすべて計算対象にする、または外す`}
                  onToggle={() => onSetCaseSelection(cases.map((comparable) => comparable.id), !allRowsSelected)}
                />
              </th>
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
                    aria-label={`${comparable.address}を計算対象にする`}
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
