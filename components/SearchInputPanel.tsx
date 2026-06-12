"use client";

import { Calculator, Database, FileUp, Search } from "lucide-react";

import type { InformationType, SourceToggles } from "@/lib/types";

const informationTypes: InformationType[] = ["取引事例", "成約事例", "公示地価", "自社CSV"];
const searchAreaOptions = ["都島本通5丁目", "滝井元町3丁目", "豊崎6丁目", "八重中町1丁目"];
const radiusOptions = ["500m", "1km", "2km", "5km"];
const sourceLabels: Array<{ key: keyof SourceToggles; label: string }> = [
  { key: "csv", label: "CSV" },
  { key: "mlit_transaction", label: "不動産情報ライブラリ API" },
  { key: "mlit_land_price", label: "公示地価" },
  { key: "manual", label: "自社事例" }
];

interface SearchInputPanelProps {
  informationType: InformationType;
  address: string;
  selectedAreas: string[];
  radius: string;
  landTsubo: number;
  adjustmentPercent: number;
  sourceToggles: SourceToggles;
  loading: boolean;
  onInformationTypeChange: (value: InformationType) => void;
  onAddressChange: (value: string) => void;
  onToggleArea: (area: string) => void;
  onRadiusChange: (value: string) => void;
  onLandTsuboChange: (value: number) => void;
  onAdjustmentPercentChange: (value: number) => void;
  onSourceToggle: (source: keyof SourceToggles) => void;
  onFetchNearby: () => void;
  onLoadCsv: () => void;
  onRecalculate: () => void;
}

export default function SearchInputPanel({
  informationType,
  address,
  selectedAreas,
  radius,
  landTsubo,
  adjustmentPercent,
  sourceToggles,
  loading,
  onInformationTypeChange,
  onAddressChange,
  onToggleArea,
  onRadiusChange,
  onLandTsuboChange,
  onAdjustmentPercentChange,
  onSourceToggle,
  onFetchNearby,
  onLoadCsv,
  onRecalculate
}: SearchInputPanelProps) {
  return (
    <aside className="panel sidebar-panel">
      <div className="section-heading">
        <span>入力部分</span>
      </div>

      <label className="field">
        <span>情報種別</span>
        <select value={informationType} onChange={(event) => onInformationTypeChange(event.target.value as InformationType)}>
          {informationTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>所在地</span>
        <input value={address} onChange={(event) => onAddressChange(event.target.value)} />
      </label>

      <div className="field">
        <span>検索エリア</span>
        <div className="chip-list">
          {searchAreaOptions.map((area) => {
            const active = selectedAreas.includes(area);
            return (
              <button
                className={`chip ${active ? "active" : ""}`}
                key={area}
                type="button"
                onClick={() => onToggleArea(area)}
              >
                {area}
              </button>
            );
          })}
        </div>
      </div>

      <label className="field">
        <span>検索半径</span>
        <select value={radius} onChange={(event) => onRadiusChange(event.target.value)}>
          {radiusOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <div className="split-fields">
        <label className="field">
          <span>用地坪数</span>
          <input
            min={1}
            type="number"
            value={landTsubo}
            onChange={(event) => onLandTsuboChange(Number(event.target.value))}
          />
        </label>

        <label className="field">
          <span>格差修正 / 買い上がり等調整</span>
          <input
            step={0.5}
            type="number"
            value={adjustmentPercent}
            onChange={(event) => onAdjustmentPercentChange(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="field">
        <span>データソース</span>
        <div className="toggle-list">
          {sourceLabels.map((source) => (
            <label className="toggle-row" key={source.key}>
              <input checked={sourceToggles[source.key]} type="checkbox" onChange={() => onSourceToggle(source.key)} />
              <span>{source.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="button-stack">
        <button className="primary-button" disabled={loading} type="button" onClick={onFetchNearby}>
          <Search aria-hidden="true" size={17} />
          周辺情報を取得
        </button>
        <button className="secondary-button" disabled={loading} type="button" onClick={onLoadCsv}>
          <FileUp aria-hidden="true" size={17} />
          CSVを読み込む
        </button>
        <button className="secondary-button" disabled={loading} type="button" onClick={onRecalculate}>
          <Calculator aria-hidden="true" size={17} />
          査定を再計算
        </button>
      </div>

      <div className="ops-note">
        <Database aria-hidden="true" size={16} />
        <span>Login ID / password authentication planned. SSL/TLS required. AWS deployment assumed.</span>
      </div>
    </aside>
  );
}
