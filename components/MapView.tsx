"use client";

import L, { type LatLngBoundsExpression, type LeafletMouseEvent, type PathOptions } from "leaflet";
import { Layers, ListChecks, MapPin } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import {
  CircleMarker,
  GeoJSON as GeoJSONLayer,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
  ZoomControl
} from "react-leaflet";

import type { TargetLocation } from "@/lib/types";

export interface MapArea {
  key: string;
  label: string;
  latitude: number;
  longitude: number;
  count: number;
}

export interface CaseMapMarker {
  id: string;
  label: string;
  subtitle: string;
  valueLabel: string;
  detailLabel: string;
  latitude: number;
  longitude: number;
  selected: boolean;
}

export interface LandPriceMapMarker {
  pointId: string;
  label: string;
  subtitle: string;
  valueLabel: string;
  detailLabel: string;
  latitude: number;
  longitude: number;
  selected: boolean;
}

export type MapMarkerMode = "cases" | "land-price";

interface MapViewProps {
  areas: MapArea[];
  caseMarkers: CaseMapMarker[];
  landPriceMarkers: LandPriceMapMarker[];
  markerMode: MapMarkerMode;
  selectedAreaKeys: string[];
  target: TargetLocation;
  onToggleCase: (id: string) => void;
  onToggleArea: (areaKey: string) => void;
  onToggleLandPoint: (pointId: string) => void;
}

type BoundaryProperties = {
  areaKey?: string;
  areaLabel?: string;
  CITY_NAME?: string;
  S_NAME?: string;
};

type BoundaryFeature = Feature<Geometry, BoundaryProperties>;
type BoundaryFeatureCollection = FeatureCollection<Geometry, BoundaryProperties>;
type BoundaryLayerFilter = "all" | "market-data";

const OSAKA_MAP_BOUNDS: LatLngBoundsExpression = [
  [34.271799, 135.091699],
  [35.051394, 135.746794]
];

const boundaryLayerFilterOptions: { value: BoundaryLayerFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "market-data", label: "市場データのみ" }
];

const targetMarkerStyle: PathOptions = {
  className: "map-marker map-marker-target",
  color: "#142235",
  fillColor: "#ffffff",
  fillOpacity: 0.95,
  opacity: 1,
  weight: 3
};

const selectedCaseMarkerStyle: PathOptions = {
  className: "map-marker map-marker-case is-selected",
  color: "#c8322a",
  fillColor: "#c8322a",
  fillOpacity: 0.88,
  opacity: 1,
  weight: 3
};

const caseMarkerStyle: PathOptions = {
  className: "map-marker map-marker-case",
  color: "#005bac",
  fillColor: "#ffffff",
  fillOpacity: 0.92,
  opacity: 1,
  weight: 2.5
};

const selectedLandMarkerStyle: PathOptions = {
  className: "map-marker map-marker-land is-selected",
  color: "#c8322a",
  fillColor: "#1f7564",
  fillOpacity: 0.9,
  opacity: 1,
  weight: 3
};

const landMarkerStyle: PathOptions = {
  className: "map-marker map-marker-land",
  color: "#1f7564",
  fillColor: "#ffffff",
  fillOpacity: 0.95,
  opacity: 1,
  weight: 2.5
};

function stopMapClick(event: LeafletMouseEvent) {
  L.DomEvent.stopPropagation(event.originalEvent);
}

function featureHasMarketData(feature: BoundaryFeature, availableAreaSet: ReadonlySet<string>) {
  return availableAreaSet.has(feature.properties?.areaKey ?? "");
}

function boundaryStyleForSelection(
  feature: BoundaryFeature | undefined,
  selectedAreaSet: ReadonlySet<string>,
  availableAreaSet: ReadonlySet<string>
): PathOptions {
  const areaKey = feature?.properties?.areaKey ?? "";
  const selected = selectedAreaSet.has(areaKey);
  const hasMarketData = availableAreaSet.has(areaKey);

  if (!hasMarketData) {
    return {
      color: "#5d7087",
      fillColor: "#768ca5",
      fillOpacity: 0.035,
      opacity: 0.48,
      weight: 0.95
    };
  }

  return {
    color: selected ? "#c8322a" : "#005bac",
    fillColor: selected ? "#c8322a" : "#4f91cc",
    fillOpacity: selected ? 0.24 : 0.12,
    opacity: selected ? 1 : 0.95,
    weight: selected ? 3 : 2
  };
}

function boundsToBbox(bounds: L.LatLngBounds): string {
  const latPadding = Math.max((bounds.getNorth() - bounds.getSouth()) * 0.12, 0.004);
  const lngPadding = Math.max((bounds.getEast() - bounds.getWest()) * 0.12, 0.004);
  const west = bounds.getWest() - lngPadding;
  const south = bounds.getSouth() - latPadding;
  const east = bounds.getEast() + lngPadding;
  const north = bounds.getNorth() + latPadding;

  return [west, south, east, north].map((value) => value.toFixed(6)).join(",");
}

function BoundaryViewport({ onBboxChange }: { onBboxChange: (bbox: string) => void }) {
  const map = useMap();
  const updateBbox = useCallback(() => {
    onBboxChange(boundsToBbox(map.getBounds()));
  }, [map, onBboxChange]);

  useEffect(() => {
    updateBbox();
  }, [updateBbox]);

  useMapEvents({
    moveend: updateBbox,
    zoomend: updateBbox
  });

  return null;
}

function TargetViewport({ target }: { target: TargetLocation }) {
  const map = useMap();

  useEffect(() => {
    map.panTo([target.latitude, target.longitude], { animate: true });
  }, [map, target.latitude, target.longitude]);

  return null;
}

function MapLegend() {
  return (
    <details
      aria-label="地図凡例"
      className="map-legend"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <summary>
        <ListChecks aria-hidden="true" className="map-control-icon" size={14} strokeWidth={2.6} />
        <span>凡例</span>
        <span className="legend-toggle-icon" aria-hidden="true" />
      </summary>
      <div className="map-legend-grid">
        <span className="map-legend-item">
          <i className="legend-symbol legend-area" aria-hidden="true" />
          市場データあり
        </span>
        <span className="map-legend-item">
          <i className="legend-symbol legend-area-selected" aria-hidden="true" />
          選択中
        </span>
        <span className="map-legend-item">
          <i className="legend-symbol legend-area-no-data" aria-hidden="true" />
          データなし
        </span>
        <span className="map-legend-item">
          <i className="legend-symbol legend-target" aria-hidden="true" />
          査定地
        </span>
        <span className="map-legend-item">
          <i className="legend-symbol legend-case" aria-hidden="true" />
          事例
        </span>
        <span className="map-legend-item">
          <i className="legend-symbol legend-case-selected" aria-hidden="true" />
          選択事例
        </span>
        <span className="map-legend-item">
          <i className="legend-symbol legend-land-price" aria-hidden="true" />
          公示地価
        </span>
        <span className="map-legend-item">
          <i className="legend-symbol legend-land-price-selected" aria-hidden="true" />
          選択地価
        </span>
      </div>
    </details>
  );
}

function MarkerTooltip({
  detailLabel,
  selected,
  subtitle,
  title,
  valueLabel
}: {
  detailLabel: string;
  selected: boolean;
  subtitle: string;
  title: string;
  valueLabel: string;
}) {
  return (
    <Tooltip className="map-point-tooltip" direction="top" offset={[0, -6]}>
      <strong>{title}</strong>
      <span>{subtitle}</span>
      <em>
        {valueLabel}
        {detailLabel ? ` / ${detailLabel}` : ""}
      </em>
      <small>{selected ? "選択中" : "クリックで選択"}</small>
    </Tooltip>
  );
}

function MapLayerFilter({
  value,
  onChange
}: {
  value: BoundaryLayerFilter;
  onChange: (value: BoundaryLayerFilter) => void;
}) {
  return (
    <details
      aria-label="表示レイヤー"
      className="map-legend map-layer-filter"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <summary>
        <Layers aria-hidden="true" className="map-control-icon" size={14} strokeWidth={2.6} />
        <span>表示</span>
        <span className="legend-toggle-icon" aria-hidden="true" />
      </summary>
      <div className="map-layer-filter-body">
        <div className="map-layer-segmented" role="group" aria-label="表示する境界">
          {boundaryLayerFilterOptions.map((option) => (
            <button
              aria-pressed={value === option.value}
              className={`map-layer-option${value === option.value ? " is-active" : ""}`}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}

function MapContextPanel({
  areaCount,
  primaryMarkerLabel,
  selectedAreaCount,
  selectedMarkerCount,
  target,
  visibleMarkerCount
}: {
  areaCount: number;
  primaryMarkerLabel: string;
  selectedAreaCount: number;
  selectedMarkerCount: number;
  target: TargetLocation;
  visibleMarkerCount: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <details
      aria-label="地図表示状況"
      className="map-context-card"
      open={expanded}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="map-context-summary">
        <span className="map-context-pin" aria-hidden="true">
          <MapPin size={15} strokeWidth={2.7} />
        </span>
        <div>
          <span>査定地</span>
          <strong>{target.address}</strong>
        </div>
        <span className="map-context-toggle-icon" aria-hidden="true" />
      </summary>
      <dl className="map-context-stats">
        <div>
          <dt>{primaryMarkerLabel}</dt>
          <dd>{visibleMarkerCount.toLocaleString("ja-JP")}</dd>
        </div>
        <div>
          <dt>選択</dt>
          <dd>{selectedMarkerCount.toLocaleString("ja-JP")}</dd>
        </div>
        <div>
          <dt>エリア</dt>
          <dd>
            {selectedAreaCount > 0
              ? `${selectedAreaCount.toLocaleString("ja-JP")}/${areaCount.toLocaleString("ja-JP")}`
              : areaCount.toLocaleString("ja-JP")}
          </dd>
        </div>
      </dl>
    </details>
  );
}

function MapControls({
  layerFilter,
  onLayerFilterChange
}: {
  layerFilter: BoundaryLayerFilter;
  onLayerFilterChange: (value: BoundaryLayerFilter) => void;
}) {
  return (
    <div className="map-legend-overlay">
      <MapLegend />
      <MapLayerFilter value={layerFilter} onChange={onLayerFilterChange} />
    </div>
  );
}

export default function MapView({
  areas,
  caseMarkers,
  landPriceMarkers,
  markerMode,
  selectedAreaKeys,
  target,
  onToggleArea,
  onToggleCase,
  onToggleLandPoint
}: MapViewProps) {
  const [boundaryData, setBoundaryData] = useState<BoundaryFeatureCollection | null>(null);
  const [boundaryError, setBoundaryError] = useState(false);
  const [boundaryBbox, setBoundaryBbox] = useState("");
  const [boundaryLayerFilter, setBoundaryLayerFilter] = useState<BoundaryLayerFilter>("all");
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);

  const areaByKey = useMemo(() => new Map(areas.map((area) => [area.key, area])), [areas]);
  const availableAreaSet = useMemo(() => new Set(areas.map((area) => area.key)), [areas]);
  const selectedAreaSet = useMemo(() => new Set(selectedAreaKeys), [selectedAreaKeys]);
  const availableAreaSetRef = useRef(availableAreaSet);
  const selectedAreaSetRef = useRef(selectedAreaSet);
  const boundaryLayerKey = useMemo(() => `boundaries-${boundaryBbox}-${boundaryLayerFilter}`, [
    boundaryBbox,
    boundaryLayerFilter
  ]);
  const visibleBoundaryData = useMemo(() => {
    if (!boundaryData || boundaryLayerFilter === "all") {
      return boundaryData;
    }

    return {
      ...boundaryData,
      features: boundaryData.features.filter((feature) => featureHasMarketData(feature, availableAreaSet))
    };
  }, [availableAreaSet, boundaryData, boundaryLayerFilter]);
  const activeCaseMarkers = markerMode === "cases" ? caseMarkers : [];
  const activeLandPriceMarkers = landPriceMarkers;
  const handleBboxChange = useCallback((bbox: string) => {
    setBoundaryBbox((current) => (current === bbox ? current : bbox));
  }, []);
  const boundaryStyle = useCallback(
    (feature?: BoundaryFeature) => boundaryStyleForSelection(feature, selectedAreaSet, availableAreaSet),
    [availableAreaSet, selectedAreaSet]
  );
  const primaryMarkerLabel = markerMode === "cases" ? "事例" : "地価地点";
  const visiblePrimaryMarkerCount = markerMode === "cases" ? activeCaseMarkers.length : activeLandPriceMarkers.length;
  const selectedPrimaryMarkerCount =
    markerMode === "cases"
      ? activeCaseMarkers.filter((marker) => marker.selected).length
      : activeLandPriceMarkers.filter((marker) => marker.selected).length;

  useEffect(() => {
    availableAreaSetRef.current = availableAreaSet;
    selectedAreaSetRef.current = selectedAreaSet;
  }, [availableAreaSet, selectedAreaSet]);

  useEffect(() => {
    if (!boundaryBbox) {
      setBoundaryData(null);
      setBoundaryError(false);
      return;
    }

    const controller = new AbortController();

    async function loadBoundaries() {
      try {
        const params = new URLSearchParams();
        params.set("bbox", boundaryBbox);

        const response = await fetch(`/api/boundaries/osaka?${params.toString()}`, {
          cache: "force-cache",
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error("Boundary request failed.");
        }

        const payload = (await response.json()) as BoundaryFeatureCollection;
        setBoundaryData(payload);
        setBoundaryError(false);
      } catch (error) {
        if (!controller.signal.aborted) {
          setBoundaryData(null);
          setBoundaryError(true);
        }
      }
    }

    void loadBoundaries();

    return () => controller.abort();
  }, [boundaryBbox]);

  useEffect(() => {
    boundaryLayerRef.current?.eachLayer((layer) => {
      const feature = (layer as L.Layer & { feature?: BoundaryFeature }).feature;

      if (feature && layer instanceof L.Path) {
        layer.setStyle(boundaryStyle(feature));
      }
    });
  }, [boundaryStyle, visibleBoundaryData]);

  function onEachBoundaryFeature(feature: BoundaryFeature, layer: L.Layer) {
    const areaKey = feature.properties?.areaKey;

    if (!areaKey) {
      return;
    }

    const area = areaByKey.get(areaKey);
    if (!area) {
      return;
    }

    const label = area.label ?? feature.properties?.areaLabel ?? areaKey;
    const countLabel = ` (${area.count})`;
    layer.bindTooltip(`${label}${countLabel}`, { direction: "top", sticky: true });
    layer.on({
      click: (event: LeafletMouseEvent) => {
        stopMapClick(event);
        onToggleArea(areaKey);
      },
      mouseout: () => {
        if (layer instanceof L.Path) {
          layer.setStyle(boundaryStyleForSelection(feature, selectedAreaSetRef.current, availableAreaSetRef.current));
        }
      },
      mouseover: () => {
        if (layer instanceof L.Path) {
          const selected = selectedAreaSetRef.current.has(areaKey);
          layer.setStyle({
            fillOpacity: selected ? 0.32 : 0.18,
            weight: selected ? 3.1 : 2
          });
        }
      }
    });
  }

  return (
    <section className="map-panel">
      <div className="map-frame">
        <MapContainer
          attributionControl={false}
          center={[target.latitude, target.longitude]}
          maxBounds={OSAKA_MAP_BOUNDS}
          maxBoundsViscosity={1}
          minZoom={9}
          scrollWheelZoom
          zoom={13}
          zoomControl={false}
        >
          <BoundaryViewport onBboxChange={handleBboxChange} />
          <TargetViewport target={target} />
          <ZoomControl position="bottomright" />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {visibleBoundaryData ? (
            <GeoJSONLayer
              data={visibleBoundaryData}
              key={boundaryLayerKey}
              ref={boundaryLayerRef}
              onEachFeature={onEachBoundaryFeature}
              style={boundaryStyle}
            />
          ) : null}
          <CircleMarker center={[target.latitude, target.longitude]} pathOptions={targetMarkerStyle} radius={7}>
            <Tooltip className="map-point-tooltip" direction="top" offset={[0, -6]}>
              <strong>査定地</strong>
              <span>{target.address}</span>
            </Tooltip>
          </CircleMarker>
          {activeCaseMarkers.map((marker) => (
            <CircleMarker
              center={[marker.latitude, marker.longitude]}
              eventHandlers={{
                click: (event) => {
                  stopMapClick(event);
                  onToggleCase(marker.id);
                }
              }}
              key={marker.id}
              pathOptions={marker.selected ? selectedCaseMarkerStyle : caseMarkerStyle}
              radius={marker.selected ? 8 : 6}
            >
              <MarkerTooltip
                detailLabel={marker.detailLabel}
                selected={marker.selected}
                subtitle={marker.subtitle}
                title={marker.label}
                valueLabel={marker.valueLabel}
              />
            </CircleMarker>
          ))}
          {activeLandPriceMarkers.map((marker) => (
            <CircleMarker
              center={[marker.latitude, marker.longitude]}
              eventHandlers={{
                click: (event) => {
                  stopMapClick(event);
                  onToggleLandPoint(marker.pointId);
                }
              }}
              key={marker.pointId}
              pathOptions={marker.selected ? selectedLandMarkerStyle : landMarkerStyle}
              radius={marker.selected ? 8 : 6}
            >
              <MarkerTooltip
                detailLabel={marker.detailLabel}
                selected={marker.selected}
                subtitle={marker.subtitle}
                title={marker.label}
                valueLabel={marker.valueLabel}
              />
            </CircleMarker>
          ))}
        </MapContainer>
        <MapContextPanel
          areaCount={areas.length}
          primaryMarkerLabel={primaryMarkerLabel}
          selectedAreaCount={selectedAreaKeys.length}
          selectedMarkerCount={selectedPrimaryMarkerCount}
          target={target}
          visibleMarkerCount={visiblePrimaryMarkerCount}
        />
        <MapControls layerFilter={boundaryLayerFilter} onLayerFilterChange={setBoundaryLayerFilter} />
        {boundaryError ? <div className="map-boundary-status">境界データを読み込めませんでした</div> : null}
      </div>
    </section>
  );
}
