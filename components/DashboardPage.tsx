"use client";

import dynamic from "next/dynamic";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useEffect, useMemo, useState } from "react";

import ErrorFallbackBanner from "@/components/ErrorFallbackBanner";
import LoadingState from "@/components/LoadingState";
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
import type { ComparableCase, InformationType, PublicLandPricePoint, TargetLocation } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <LoadingState label="地図を初期化しています" />
});

const reportAreas = ["都島本通5丁目", "滝井元町3丁目", "豊崎6丁目"];
const radius = "1km";

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
  point: string;
  price: number;
  growth: number;
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

function withDefaultSelection(items: ComparableCase[]): ComparableCase[] {
  if (items.some((item) => item.selected)) {
    return items;
  }

  const selectedIds = new Set(items.slice(0, 4).map((item) => item.id));
  return items.map((item) => (selectedIds.has(item.id) ? { ...item, selected: true } : item));
}

function buildHistoryRows(points: PublicLandPricePoint[]): HistoryRow[] {
  const byYear = new Map<number, HistoryRow>();

  for (const point of points) {
    if (!Number.isFinite(point.year) || !Number.isFinite(point.pricePerM2)) {
      continue;
    }

    const existing = byYear.get(point.year);
    if (existing) {
      existing.price = Math.round((existing.price + point.pricePerM2) / 2);
      existing.growth = Number(((existing.growth + point.yearOnYearChangeRate) / 2).toFixed(1));
      continue;
    }

    byYear.set(point.year, {
      year: point.year,
      point: point.standardLotNumber || point.pointId,
      price: point.pricePerM2,
      growth: point.yearOnYearChangeRate
    });
  }

  return Array.from(byYear.values()).sort((a, b) => b.year - a.year);
}

function formatEraYear(year: number): string {
  if (year >= 2019) {
    return `令和${year - 2018}年`;
  }

  return `${year}年`;
}

function compactAddress(address: string): string {
  return address.replace(/^大阪府/, "").replace(/^大阪市/, "");
}

function stationLabel(comparable: ComparableCase): string {
  const station = comparable.nearestStation?.split(/[ 　]/).filter(Boolean).at(-1);
  return station || comparable.nearestStation || "-";
}

function caseRows(cases: ComparableCase[], offset = 0): ComparableCase[] {
  const sorted = [...cases].sort((left, right) => {
    if (left.selected !== right.selected) {
      return left.selected ? -1 : 1;
    }

    return (right.unitPricePerTsubo ?? 0) - (left.unitPricePerTsubo ?? 0);
  });

  return sorted.slice(offset, offset + 8);
}

export default function DashboardPage() {
  const [informationType, setInformationType] = useState<InformationType>("取引事例");
  const [address, setAddress] = useState(targetLocation.address);
  const [landTsubo, setLandTsubo] = useState(100);
  const [adjustmentPercent, setAdjustmentPercent] = useState(0);
  const [cases, setCases] = useState<ComparableCase[]>([]);
  const [landPricePoints, setLandPricePoints] = useState<PublicLandPricePoint[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAllData() {
    setLoading(true);

    try {
      const [csv, transactions, landPrices] = await Promise.all([
        requestJson<CsvResponse>("/api/demo/csv"),
        requestJson<TransactionResponse>("/api/reinfolib/transactions"),
        requestJson<LandPriceResponse>("/api/reinfolib/land-price-points")
      ]);

      setCases(withDefaultSelection([...(csv.cases ?? []), ...(transactions.cases ?? [])]));
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

  function handleToggleCase(id: string) {
    setCases((current) => current.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item)));
  }

  const target = useMemo(() => currentTarget(address), [address]);
  const selectedCases = useMemo(() => cases.filter((item) => item.selected), [cases]);
  const growthRatePercent = useMemo(() => averageGrowthRate(landPricePoints), [landPricePoints]);
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
  const historyRows = useMemo(() => buildHistoryRows(landPricePoints), [landPricePoints]);
  const primaryRows = useMemo(() => caseRows(cases), [cases]);
  const secondaryRows = useMemo(() => caseRows(cases, 8), [cases]);

  return (
    <main className="report-app">
      <section className="report-sheet" aria-label="不動産査定レポート">
        <header className="report-header-grid">
          <div className="report-info-table" aria-label="査定条件">
            <label className="report-info-row">
              <span>情報種別</span>
              <select value={informationType} onChange={(event) => setInformationType(event.target.value as InformationType)}>
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
                value={landTsubo}
                onChange={(event) => setLandTsubo(Number(event.target.value) || 0)}
              />
            </label>
          </div>

          <div className="brand-panel">
            <div className="brand-bar">Panasonic Homes</div>
            <div className="valuation-strip" aria-label="査定結果">
              <MetricBox label="グロス相場" value={formatYen(valuation.grossMarketPrice)} />
              <MetricBox label="単価相場" value={formatYenPerTsubo(valuation.averageTsuboUnitPrice)} />
              <MetricBox label="上昇率" value={formatPercent(growthRatePercent)} />
              <label className="metric-box editable">
                <span>要因調整</span>
                <input
                  inputMode="decimal"
                  value={adjustmentPercent}
                  onChange={(event) => setAdjustmentPercent(Number(event.target.value) || 0)}
                />
              </label>
              <MetricBox label="査定金額" value={formatYen(valuation.appraisalAmount)} />
              <MetricBox label="入札額" value={formatYen(valuation.bidAmount)} strong />
            </div>
          </div>
        </header>

        <ErrorFallbackBanner messages={warnings} />

        <section className="evidence-grid" aria-label="周辺資料">
          <div className="report-map">
            {loading && cases.length === 0 ? (
              <LoadingState label="市場データを読み込んでいます" />
            ) : (
              <MapView
                cases={cases}
                landPricePoints={landPricePoints}
                radius={radius}
                selectedAreas={reportAreas}
                target={target}
                onToggleCase={handleToggleCase}
              />
            )}
          </div>

          <ReportTrendChart rows={historyRows} />
          <HistoryTable rows={historyRows} />
        </section>

        <section className="report-table-stack" aria-label="取引事例一覧">
          <ReportCaseTable
            cases={primaryRows}
            title={`周辺取引事例一覧（選択 ${selectedCases.length}件 / 表示 ${cases.length}件）`}
            onToggleCase={handleToggleCase}
          />
          <ReportCaseTable
            cases={secondaryRows.length > 0 ? secondaryRows : primaryRows}
            title="近隣成約・補完事例一覧"
            onToggleCase={handleToggleCase}
          />
        </section>
      </section>
    </main>
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

function ReportTrendChart({ rows }: { rows: HistoryRow[] }) {
  const chartRows = [...rows].reverse();

  return (
    <section className="report-chart" aria-label="公示地価推移">
      <div className="small-section-title">公示地価推移</div>
      {chartRows.length === 0 ? (
        <LoadingState label="地価データなし" />
      ) : (
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={chartRows} margin={{ top: 18, right: 10, bottom: 18, left: 4 }}>
            <CartesianGrid stroke="#e5e5e5" vertical={false} />
            <XAxis dataKey="year" fontSize={10} interval={0} tickLine={false} />
            <YAxis fontSize={10} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}千`} width={38} />
            <Tooltip
              formatter={(value) => [formatYenPerM2(Number(value)), "価格"]}
              labelFormatter={(label) => `${label}年`}
            />
            <Bar dataKey="price" fill="#ff1616" maxBarSize={16} name="価格" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  return (
    <section className="history-panel" aria-label="過去の地価、対前年変動一覧">
      <div className="history-title">過去の地価、対前年変動一覧</div>
      <table className="history-table">
        <thead>
          <tr>
            <th>年</th>
            <th>標準地番号</th>
            <th>価格(円/㎡)</th>
            <th>対前年変動率(%)</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4}>地価データなし</td>
            </tr>
          ) : null}
          {rows.slice(0, 7).map((row) => (
            <tr key={row.year}>
              <td>{formatEraYear(row.year)}</td>
              <td>{row.point}</td>
              <td>{Math.round(row.price).toLocaleString("ja-JP")}</td>
              <td>{row.growth.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ReportCaseTable({
  cases,
  title,
  onToggleCase
}: {
  cases: ComparableCase[];
  title: string;
  onToggleCase: (id: string) => void;
}) {
  return (
    <section className="report-case-section">
      <div className="report-table-title">{title}</div>
      <table className="case-table">
        <thead>
          <tr>
            <th>最寄駅</th>
            <th>取引総額</th>
            <th>土地</th>
            <th>単価</th>
            <th>地形</th>
            <th>前面道路</th>
            <th>用途</th>
            <th>建蔽率</th>
            <th>容積率</th>
            <th>取引時期</th>
            <th>選</th>
          </tr>
        </thead>
        <tbody>
          {cases.length === 0 ? (
            <tr>
              <td colSpan={11}>表示できる事例がありません。</td>
            </tr>
          ) : null}
          {cases.map((comparable) => (
            <tr key={comparable.id}>
              <td>
                <strong>{stationLabel(comparable)}</strong>
                <span>{comparable.access || "-"}</span>
              </td>
              <td>{comparable.priceTotalDisplay || formatYen(comparable.priceTotalYen)}</td>
              <td>
                {formatTsubo(comparable.landAreaTsubo)}
                <span>{formatM2(comparable.landAreaM2)}</span>
              </td>
              <td>{formatYenPerTsubo(comparable.unitPricePerTsubo)}</td>
              <td>{comparable.propertyType || "長方形"}</td>
              <td>{comparable.roadCondition || "-"}</td>
              <td>{comparable.zoning || compactAddress(comparable.address)}</td>
              <td>{comparable.buildingCoverageRatio ? `${comparable.buildingCoverageRatio}%` : "-"}</td>
              <td>{comparable.floorAreaRatio ? `${comparable.floorAreaRatio}%` : "-"}</td>
              <td>{comparable.transactionDate || "-"}</td>
              <td>
                <input
                  aria-label={`${comparable.address}を選択`}
                  checked={comparable.selected}
                  type="checkbox"
                  onChange={() => onToggleCase(comparable.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
