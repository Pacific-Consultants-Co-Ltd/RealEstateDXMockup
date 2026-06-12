"use client";

import { ArrowUpDown, ExternalLink, SlidersHorizontal } from "lucide-react";
import { useMemo } from "react";

import DataSourceBadge from "@/components/DataSourceBadge";
import { formatM2, formatTsubo, formatYen, formatYenPerTsubo } from "@/lib/formatters";
import type { CaseSortKey, CaseSortState, CaseTableFilters, ComparableCase, ComparableCaseSource } from "@/lib/types";

interface ComparableTableProps {
  cases: ComparableCase[];
  filters: CaseTableFilters;
  sort: CaseSortState;
  onFiltersChange: (filters: CaseTableFilters) => void;
  onSortChange: (sort: CaseSortState) => void;
  onToggleCase: (id: string) => void;
  onOpenDetails: (comparable: ComparableCase) => void;
}

const sourceOptions: Array<{ value: "all" | ComparableCaseSource; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "csv", label: "自社CSV" },
  { value: "mlit_transaction", label: "API取引" },
  { value: "manual", label: "自社事例" }
];

const sortableHeaders: Array<{ key: CaseSortKey; label: string }> = [
  { key: "source", label: "source" },
  { key: "address", label: "address" },
  { key: "landAreaTsubo", label: "landAreaTsubo" },
  { key: "priceTotalYen", label: "priceTotalYen" },
  { key: "unitPricePerTsubo", label: "unitPricePerTsubo" },
  { key: "transactionDate", label: "transactionDate" }
];

function parseWalkMinutes(access?: string): number | undefined {
  const match = access?.match(/(\d+)\s*分/);
  if (!match) {
    return undefined;
  }

  return Number(match[1]);
}

function numericFilter(value: number | undefined, min: string, max: string): boolean {
  const minimum = min ? Number(min) : undefined;
  const maximum = max ? Number(max) : undefined;

  if (minimum !== undefined && Number.isFinite(minimum) && (value ?? 0) < minimum) {
    return false;
  }

  if (maximum !== undefined && Number.isFinite(maximum) && (value ?? 0) > maximum) {
    return false;
  }

  return true;
}

function sortValue(comparable: ComparableCase, key: CaseSortKey): string | number {
  if (key === "source") {
    return comparable.source;
  }

  if (key === "address") {
    return comparable.address;
  }

  if (key === "transactionDate") {
    return comparable.transactionDate ?? "";
  }

  return comparable[key] ?? 0;
}

export default function ComparableTable({
  cases,
  filters,
  sort,
  onFiltersChange,
  onSortChange,
  onToggleCase,
  onOpenDetails
}: ComparableTableProps) {
  const zoningOptions = useMemo(
    () => Array.from(new Set(cases.map((comparable) => comparable.zoning).filter(Boolean))).sort(),
    [cases]
  );

  const filteredCases = useMemo(() => {
    const next = cases.filter((comparable) => {
      if (filters.source !== "all" && comparable.source !== filters.source) {
        return false;
      }

      if (filters.zoning && comparable.zoning !== filters.zoning) {
        return false;
      }

      if (!numericFilter(comparable.priceTotalYen ? comparable.priceTotalYen / 10_000 : undefined, filters.priceMin, filters.priceMax)) {
        return false;
      }

      if (!numericFilter(comparable.landAreaTsubo, filters.areaMin, filters.areaMax)) {
        return false;
      }

      const walkMax = filters.walkMax ? Number(filters.walkMax) : undefined;
      const walkMinutes = parseWalkMinutes(comparable.access);
      if (walkMax !== undefined && Number.isFinite(walkMax) && walkMinutes !== undefined && walkMinutes > walkMax) {
        return false;
      }

      if (
        filters.dateKeyword &&
        !(comparable.transactionDate ?? "").toLowerCase().includes(filters.dateKeyword.toLowerCase())
      ) {
        return false;
      }

      return true;
    });

    next.sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      const direction = sort.direction === "asc" ? 1 : -1;

      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * direction;
      }

      return String(left).localeCompare(String(right), "ja") * direction;
    });

    return next;
  }, [cases, filters, sort]);

  function updateFilter<K extends keyof CaseTableFilters>(key: K, value: CaseTableFilters[K]) {
    onFiltersChange({ ...filters, [key]: value });
  }

  function toggleSort(key: CaseSortKey) {
    onSortChange({
      key,
      direction: sort.key === key && sort.direction === "desc" ? "asc" : "desc"
    });
  }

  return (
    <section className="panel table-panel">
      <div className="table-title-row">
        <div className="section-heading">
          <span>市場情報</span>
          <small>選択された事例の表示</small>
        </div>
        <div className="table-count">
          {filteredCases.length} / {cases.length} 件
        </div>
      </div>

      <div className="table-filters">
        <SlidersHorizontal aria-hidden="true" size={17} />
        <select value={filters.source} onChange={(event) => updateFilter("source", event.target.value as CaseTableFilters["source"])}>
          {sourceOptions.map((source) => (
            <option key={source.value} value={source.value}>
              {source.label}
            </option>
          ))}
        </select>
        <select value={filters.zoning} onChange={(event) => updateFilter("zoning", event.target.value)}>
          <option value="">用途地域</option>
          {zoningOptions.map((zoning) => (
            <option key={zoning} value={zoning}>
              {zoning}
            </option>
          ))}
        </select>
        <input
          inputMode="numeric"
          placeholder="価格下限(万円)"
          value={filters.priceMin}
          onChange={(event) => updateFilter("priceMin", event.target.value)}
        />
        <input
          inputMode="numeric"
          placeholder="価格上限(万円)"
          value={filters.priceMax}
          onChange={(event) => updateFilter("priceMax", event.target.value)}
        />
        <input
          inputMode="numeric"
          placeholder="坪数下限"
          value={filters.areaMin}
          onChange={(event) => updateFilter("areaMin", event.target.value)}
        />
        <input
          inputMode="numeric"
          placeholder="坪数上限"
          value={filters.areaMax}
          onChange={(event) => updateFilter("areaMax", event.target.value)}
        />
        <input
          inputMode="numeric"
          placeholder="徒歩上限(分)"
          value={filters.walkMax}
          onChange={(event) => updateFilter("walkMax", event.target.value)}
        />
        <input
          placeholder="成約年月"
          value={filters.dateKeyword}
          onChange={(event) => updateFilter("dateKeyword", event.target.value)}
        />
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>選択</th>
              <th>
                <SortButton active={sort.key === "source"} label="source" onClick={() => toggleSort("source")} />
              </th>
              <th>
                <SortButton active={sort.key === "address"} label="所在地" onClick={() => toggleSort("address")} />
              </th>
              <th>沿線駅</th>
              <th>交通</th>
              <th>
                <SortButton active={sort.key === "landAreaTsubo"} label="土地面積" onClick={() => toggleSort("landAreaTsubo")} />
              </th>
              <th>
                <SortButton active={sort.key === "priceTotalYen"} label="価格" onClick={() => toggleSort("priceTotalYen")} />
              </th>
              <th>
                <SortButton
                  active={sort.key === "unitPricePerTsubo"}
                  label="坪単価"
                  onClick={() => toggleSort("unitPricePerTsubo")}
                />
              </th>
              <th>用途地域</th>
              <th>前面道路</th>
              <th>建ぺい率</th>
              <th>容積率</th>
              <th>
                <SortButton
                  active={sort.key === "transactionDate"}
                  label="成約年月日"
                  onClick={() => toggleSort("transactionDate")}
                />
              </th>
              <th>リンク</th>
              <th>詳細</th>
            </tr>
          </thead>
          <tbody>
            {filteredCases.map((comparable) => (
              <tr className={comparable.selected ? "selected-row" : ""} key={comparable.id}>
                <td>
                  <input
                    aria-label={`${comparable.address}を選択`}
                    checked={comparable.selected}
                    type="checkbox"
                    onChange={() => onToggleCase(comparable.id)}
                  />
                </td>
                <td>
                  <DataSourceBadge source={comparable.source} />
                </td>
                <td className="address-cell">{comparable.address}</td>
                <td>{comparable.nearestStation || "-"}</td>
                <td>{comparable.access || "-"}</td>
                <td>
                  {formatTsubo(comparable.landAreaTsubo)}
                  <small>{formatM2(comparable.landAreaM2)}</small>
                </td>
                <td>{comparable.priceTotalDisplay || formatYen(comparable.priceTotalYen)}</td>
                <td>{formatYenPerTsubo(comparable.unitPricePerTsubo)}</td>
                <td>{comparable.zoning || "-"}</td>
                <td>{comparable.roadCondition || "-"}</td>
                <td>{comparable.buildingCoverageRatio ? `${comparable.buildingCoverageRatio}%` : "-"}</td>
                <td>{comparable.floorAreaRatio ? `${comparable.floorAreaRatio}%` : "-"}</td>
                <td>{comparable.transactionDate || "-"}</td>
                <td>
                  <a
                    aria-label="外部リンク"
                    className="icon-link"
                    href={comparable.externalLink || "#"}
                    rel="noreferrer"
                    target={comparable.externalLink && comparable.externalLink !== "#" ? "_blank" : undefined}
                  >
                    <ExternalLink aria-hidden="true" size={16} />
                  </a>
                </td>
                <td>
                  <button className="text-button" type="button" onClick={() => onOpenDetails(comparable)}>
                    詳細
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SortButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`sort-button ${active ? "active" : ""}`} type="button" onClick={onClick}>
      <span>{label}</span>
      <ArrowUpDown aria-hidden="true" size={14} />
    </button>
  );
}

export { sortableHeaders };
