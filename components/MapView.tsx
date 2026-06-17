"use client";

import L, { type LatLngBoundsExpression, type LeafletMouseEvent, type PathOptions } from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { GeoJSON as GeoJSONLayer, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";

import type { TargetLocation } from "@/lib/types";

export interface MapArea {
  key: string;
  label: string;
  latitude: number;
  longitude: number;
  count: number;
}

interface MapViewProps {
  areas: MapArea[];
  selectedAreaKeys: string[];
  target: TargetLocation;
  onToggleArea: (areaKey: string) => void;
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
      color: "#5f6f80",
      fillColor: "#708090",
      fillOpacity: 0.035,
      opacity: 0.48,
      weight: 0.95
    };
  }

  return {
    color: selected ? "#b42318" : "#175cd3",
    fillColor: selected ? "#b42318" : "#528bdb",
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

function MapLegend() {
  return (
    <details
      aria-label="地図凡例"
      className="map-legend"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <summary>
        <span className="legend-toggle-icon" aria-hidden="true" />
        凡例
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
      </div>
    </details>
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
        <span className="legend-toggle-icon" aria-hidden="true" />
        表示
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
  selectedAreaKeys,
  target,
  onToggleArea
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
  const handleBboxChange = useCallback((bbox: string) => {
    setBoundaryBbox((current) => (current === bbox ? current : bbox));
  }, []);
  const boundaryStyle = useCallback(
    (feature?: BoundaryFeature) => boundaryStyleForSelection(feature, selectedAreaSet, availableAreaSet),
    [availableAreaSet, selectedAreaSet]
  );

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
        >
          <BoundaryViewport onBboxChange={handleBboxChange} />
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
        </MapContainer>
        <MapControls layerFilter={boundaryLayerFilter} onLayerFilterChange={setBoundaryLayerFilter} />
        {boundaryError ? <div className="map-boundary-status">境界データを読み込めませんでした</div> : null}
      </div>
    </section>
  );
}
