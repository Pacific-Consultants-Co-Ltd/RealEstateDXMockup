"use client";

import L, { type LatLngBoundsExpression, type LeafletMouseEvent, type PathOptions } from "leaflet";
import { Layers, ListChecks, MapPin } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import {
  CircleMarker,
  GeoJSON as GeoJSONLayer,
  MapContainer,
  Pane,
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

export interface TargetPickLocation {
  latitude: number;
  longitude: number;
}

export interface CaseMapMarker {
  areaKey: string;
  id: string;
  label: string;
  subtitle: string;
  valueLabel: string;
  detailLabel: string;
  latitude: number;
  longitude: number;
  selected: boolean;
  snapToAreaCentroid: boolean;
}

export interface LandPriceMapMarker {
  areaKey: string;
  pointId: string;
  label: string;
  subtitle: string;
  valueLabel: string;
  detailLabel: string;
  latitude: number;
  longitude: number;
  selected: boolean;
  snapToAreaCentroid: boolean;
}

export type MapMarkerMode = "cases" | "land-price";

interface MapViewProps {
  areas: MapArea[];
  caseMarkers: CaseMapMarker[];
  landPriceMarkers: LandPriceMapMarker[];
  markerMode: MapMarkerMode;
  selectedAreaKeys: string[];
  target: TargetLocation;
  targetPlacementActive: boolean;
  onPickTarget: (location: TargetPickLocation) => void;
  onToggleCase: (id: string) => void;
  onToggleArea: (areaKey: string) => void;
  onToggleLandPoint: (pointId: string) => void;
}

type BoundaryProperties = {
  areaBaseKey?: string;
  areaBaseLabel?: string;
  areaKey?: string;
  areaLabel?: string;
  CITY_NAME?: string;
  S_NAME?: string;
  X_CODE?: number | string;
  Y_CODE?: number | string;
};

type BoundaryFeature = Feature<Geometry, BoundaryProperties>;
type BoundaryFeatureCollection = FeatureCollection<Geometry, BoundaryProperties>;
type BoundaryLayerFilter = "all" | "market-data";

const OSAKA_MAP_BOUNDS: LatLngBoundsExpression = [
  [34.271799, 135.091699],
  [35.051394, 135.746794]
];
const MAP_TOOLTIP_PANE = "map-tooltip-pane";
const SELECTION_ACCENT = "#006f7d";

const boundaryLayerFilterOptions: { value: BoundaryLayerFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "market-data", label: "市場データのみ" }
];

interface MapCoordinate {
  latitude: number;
  longitude: number;
}

interface BoundarySpatialIndexItem {
  centroid: MapCoordinate;
  geometry: Geometry;
}

type SnappableMarker = {
  areaKey: string;
  latitude: number;
  longitude: number;
  snapToAreaCentroid: boolean;
};

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
  color: SELECTION_ACCENT,
  fillColor: SELECTION_ACCENT,
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
  color: SELECTION_ACCENT,
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

function selectableFeatureAreaKey(feature: BoundaryFeature | undefined, availableAreaSet: ReadonlySet<string>): string {
  const areaKey = feature?.properties?.areaKey ?? "";
  const areaBaseKey = feature?.properties?.areaBaseKey ?? "";

  if (areaKey && availableAreaSet.has(areaKey)) {
    return areaKey;
  }

  if (areaBaseKey && availableAreaSet.has(areaBaseKey)) {
    return areaBaseKey;
  }

  return "";
}

function featureHasMarketData(feature: BoundaryFeature, availableAreaSet: ReadonlySet<string>) {
  return Boolean(selectableFeatureAreaKey(feature, availableAreaSet));
}

function boundaryStyleForSelection(
  feature: BoundaryFeature | undefined,
  selectedAreaSet: ReadonlySet<string>,
  availableAreaSet: ReadonlySet<string>
): PathOptions {
  const selectableAreaKey = selectableFeatureAreaKey(feature, availableAreaSet);
  const selected = selectedAreaSet.has(selectableAreaKey);
  const hasMarketData = Boolean(selectableAreaKey);

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
    color: selected ? SELECTION_ACCENT : "#005bac",
    fillColor: selected ? SELECTION_ACCENT : "#4f91cc",
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

function ringCentroid(ring: number[][]): { area: number; latitude: number; longitude: number } | undefined {
  if (ring.length < 3) {
    return undefined;
  }

  let twiceArea = 0;
  let longitudeSum = 0;
  let latitudeSum = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const cross = current[0] * next[1] - next[0] * current[1];

    twiceArea += cross;
    longitudeSum += (current[0] + next[0]) * cross;
    latitudeSum += (current[1] + next[1]) * cross;
  }

  if (Math.abs(twiceArea) < 1e-12) {
    const totals = ring.reduce(
      (sum, coordinate) => ({
        latitude: sum.latitude + coordinate[1],
        longitude: sum.longitude + coordinate[0]
      }),
      { latitude: 0, longitude: 0 }
    );

    return {
      area: 0,
      latitude: totals.latitude / ring.length,
      longitude: totals.longitude / ring.length
    };
  }

  return {
    area: twiceArea / 2,
    latitude: latitudeSum / (3 * twiceArea),
    longitude: longitudeSum / (3 * twiceArea)
  };
}

function polygonCentroid(polygon: number[][][]): { area: number; centroid: MapCoordinate } | undefined {
  const outerRing = polygon[0];
  const centroid = outerRing ? ringCentroid(outerRing) : undefined;

  if (!centroid) {
    return undefined;
  }

  return {
    area: Math.abs(centroid.area),
    centroid: {
      latitude: centroid.latitude,
      longitude: centroid.longitude
    }
  };
}

function geometryCentroid(geometry: Geometry): MapCoordinate | undefined {
  if (geometry.type === "Polygon") {
    return polygonCentroid(geometry.coordinates)?.centroid;
  }

  if (geometry.type === "MultiPolygon") {
    const largestPolygon = geometry.coordinates
      .map(polygonCentroid)
      .filter((item): item is { area: number; centroid: MapCoordinate } => Boolean(item))
      .sort((left, right) => right.area - left.area)[0];

    return largestPolygon?.centroid;
  }

  if (geometry.type === "Point") {
    const [longitude, latitude] = geometry.coordinates;
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : undefined;
  }

  return undefined;
}

function propertiesCentroid(properties: BoundaryProperties): MapCoordinate | undefined {
  const longitude = Number(properties.X_CODE);
  const latitude = Number(properties.Y_CODE);

  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : undefined;
}

function pointInRing(point: MapCoordinate, ring: number[][]): boolean {
  let inside = false;
  let previousIndex = ring.length - 1;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const previous = ring[previousIndex];
    const currentLongitude = current[0];
    const currentLatitude = current[1];
    const previousLongitude = previous[0];
    const previousLatitude = previous[1];
    const intersects =
      currentLatitude > point.latitude !== previousLatitude > point.latitude &&
      point.longitude <
        ((previousLongitude - currentLongitude) * (point.latitude - currentLatitude)) /
          (previousLatitude - currentLatitude) +
          currentLongitude;

    if (intersects) {
      inside = !inside;
    }

    previousIndex = index;
  }

  return inside;
}

function pointInPolygon(point: MapCoordinate, polygon: number[][][]): boolean {
  const [outerRing, ...holes] = polygon;

  if (!outerRing || !pointInRing(point, outerRing)) {
    return false;
  }

  return !holes.some((hole) => pointInRing(point, hole));
}

function pointInGeometry(point: MapCoordinate, geometry: Geometry): boolean {
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }

  return false;
}

function coordinateDistanceSquared(left: MapCoordinate, right: MapCoordinate): number {
  const latitudeDistance = left.latitude - right.latitude;
  const longitudeDistance = left.longitude - right.longitude;
  return latitudeDistance * latitudeDistance + longitudeDistance * longitudeDistance;
}

function snapMarkerToBoundary(
  marker: SnappableMarker,
  boundaryIndex: ReadonlyMap<string, BoundarySpatialIndexItem[]>
): MapCoordinate {
  const original = { latitude: marker.latitude, longitude: marker.longitude };
  const boundaries = marker.snapToAreaCentroid ? boundaryIndex.get(marker.areaKey) ?? [] : [];

  if (boundaries.length === 0) {
    return original;
  }

  const containingBoundary = boundaries.find((boundary) => pointInGeometry(original, boundary.geometry));

  if (containingBoundary) {
    return original;
  }

  const boundary = boundaries.reduce((nearest, current) =>
    coordinateDistanceSquared(current.centroid, original) < coordinateDistanceSquared(nearest.centroid, original) ? current : nearest
  );

  if (pointInGeometry(original, boundary.geometry)) {
    return original;
  }

  const snapScales = [0.2, 0.14, 0.08, 0.03, 0];

  for (const scale of snapScales) {
    const candidate = {
      latitude: boundary.centroid.latitude + (original.latitude - boundary.centroid.latitude) * scale,
      longitude: boundary.centroid.longitude + (original.longitude - boundary.centroid.longitude) * scale
    };

    if (scale === 0 || pointInGeometry(candidate, boundary.geometry)) {
      return candidate;
    }
  }

  return boundary.centroid;
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

function TargetPlacementEvents({
  active,
  onPickTarget
}: {
  active: boolean;
  onPickTarget: (location: TargetPickLocation) => void;
}) {
  useMapEvents({
    click: (event) => {
      if (!active) {
        return;
      }

      onPickTarget({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng
      });
    }
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
    <Tooltip className="map-point-tooltip" direction="top" offset={[0, -6]} pane={MAP_TOOLTIP_PANE}>
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
  targetPlacementActive,
  onPickTarget,
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
  const requestedBoundaryKeys = useMemo(() => Array.from(availableAreaSet).sort((left, right) => left.localeCompare(right, "ja")), [
    availableAreaSet
  ]);
  const selectedAreaSet = useMemo(() => new Set(selectedAreaKeys), [selectedAreaKeys]);
  const availableAreaSetRef = useRef(availableAreaSet);
  const onPickTargetRef = useRef(onPickTarget);
  const selectedAreaSetRef = useRef(selectedAreaSet);
  const targetPlacementActiveRef = useRef(targetPlacementActive);
  const boundaryKeySignature = requestedBoundaryKeys.join(",");
  const boundaryLayerKey = useMemo(() => `boundaries-${boundaryBbox}-${boundaryLayerFilter}-${boundaryKeySignature}`, [
    boundaryBbox,
    boundaryKeySignature,
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
  const boundarySpatialIndex = useMemo(() => {
    const index = new Map<string, BoundarySpatialIndexItem[]>();

    for (const feature of boundaryData?.features ?? []) {
      const areaKey = feature.properties?.areaKey;
      const areaBaseKey = feature.properties?.areaBaseKey;
      const centroid = geometryCentroid(feature.geometry) ?? propertiesCentroid(feature.properties);

      if (!centroid) {
        continue;
      }

      const item = {
        centroid,
        geometry: feature.geometry
      };

      for (const key of new Set([areaKey, areaBaseKey].filter((value): value is string => Boolean(value)))) {
        const items = index.get(key);
        if (items) {
          items.push(item);
        } else {
          index.set(key, [item]);
        }
      }
    }

    return index;
  }, [boundaryData]);
  const activeCaseMarkers = markerMode === "cases" ? caseMarkers : [];
  const activeLandPriceMarkers = markerMode === "land-price" ? landPriceMarkers : [];
  const renderableCaseMarkers = useMemo(
    () => activeCaseMarkers.filter((marker) => !marker.snapToAreaCentroid || boundarySpatialIndex.has(marker.areaKey)),
    [activeCaseMarkers, boundarySpatialIndex]
  );
  const renderableLandPriceMarkers = useMemo(
    () => activeLandPriceMarkers.filter((marker) => !marker.snapToAreaCentroid || boundarySpatialIndex.has(marker.areaKey)),
    [activeLandPriceMarkers, boundarySpatialIndex]
  );
  const handleBboxChange = useCallback((bbox: string) => {
    setBoundaryBbox((current) => (current === bbox ? current : bbox));
  }, []);
  const closeBoundaryTooltips = useCallback(() => {
    boundaryLayerRef.current?.eachLayer((layer) => {
      layer.closeTooltip();
    });
  }, []);
  const boundaryStyle = useCallback(
    (feature?: BoundaryFeature) => boundaryStyleForSelection(feature, selectedAreaSet, availableAreaSet),
    [availableAreaSet, selectedAreaSet]
  );
  const primaryMarkerLabel = markerMode === "cases" ? "事例" : "地価地点";
  const visiblePrimaryMarkerCount = markerMode === "cases" ? renderableCaseMarkers.length : renderableLandPriceMarkers.length;
  const selectedPrimaryMarkerCount =
    markerMode === "cases"
      ? renderableCaseMarkers.filter((marker) => marker.selected).length
      : renderableLandPriceMarkers.filter((marker) => marker.selected).length;

  useEffect(() => {
    availableAreaSetRef.current = availableAreaSet;
    onPickTargetRef.current = onPickTarget;
    selectedAreaSetRef.current = selectedAreaSet;
    targetPlacementActiveRef.current = targetPlacementActive;
  }, [availableAreaSet, onPickTarget, selectedAreaSet, targetPlacementActive]);

  useEffect(() => {
    if (!boundaryBbox && requestedBoundaryKeys.length === 0) {
      setBoundaryData(null);
      setBoundaryError(false);
      return;
    }

    const controller = new AbortController();

    async function loadBoundaries() {
      try {
        const params = new URLSearchParams();
        if (boundaryBbox) {
          params.set("bbox", boundaryBbox);
        }

        for (const key of requestedBoundaryKeys) {
          params.append("key", key);
        }

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
  }, [boundaryBbox, requestedBoundaryKeys]);

  useEffect(() => {
    boundaryLayerRef.current?.eachLayer((layer) => {
      const feature = (layer as L.Layer & { feature?: BoundaryFeature }).feature;

      if (feature && layer instanceof L.Path) {
        layer.setStyle(boundaryStyle(feature));
      }
    });
  }, [boundaryStyle, visibleBoundaryData]);

  function onEachBoundaryFeature(feature: BoundaryFeature, layer: L.Layer) {
    const areaKey = selectableFeatureAreaKey(feature, availableAreaSet);

    if (!areaKey) {
      return;
    }

    const area = areaByKey.get(areaKey);
    if (!area) {
      return;
    }

    const label = area.label ?? feature.properties?.areaBaseLabel ?? feature.properties?.areaLabel ?? areaKey;
    const countLabel = ` (${area.count})`;
    layer.bindTooltip(`${label}${countLabel}`, { direction: "top", pane: MAP_TOOLTIP_PANE, sticky: true });
    layer.on({
      click: (event: LeafletMouseEvent) => {
        stopMapClick(event);
        if (targetPlacementActiveRef.current) {
          onPickTargetRef.current({
            latitude: event.latlng.lat,
            longitude: event.latlng.lng
          });
          return;
        }

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
      <div className={`map-frame${targetPlacementActive ? " is-target-placement-active" : ""}`}>
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
          <TargetPlacementEvents active={targetPlacementActive} onPickTarget={onPickTarget} />
          <TargetViewport target={target} />
          <ZoomControl position="bottomright" />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Pane name={MAP_TOOLTIP_PANE} style={{ zIndex: 760, pointerEvents: "none" }} />
          <Pane name="boundary-pane" style={{ zIndex: 410 }}>
            {visibleBoundaryData ? (
              <GeoJSONLayer
                data={visibleBoundaryData}
                key={boundaryLayerKey}
                ref={boundaryLayerRef}
                onEachFeature={onEachBoundaryFeature}
                style={boundaryStyle}
              />
            ) : null}
          </Pane>
          <Pane name="point-pane" style={{ zIndex: 430 }}>
            <CircleMarker center={[target.latitude, target.longitude]} pathOptions={targetMarkerStyle} radius={7}>
              <Tooltip className="map-point-tooltip" direction="top" offset={[0, -6]} pane={MAP_TOOLTIP_PANE}>
                <strong>査定地</strong>
                <span>{target.address}</span>
              </Tooltip>
            </CircleMarker>
            {renderableCaseMarkers.map((marker) => {
              const position = snapMarkerToBoundary(marker, boundarySpatialIndex);

              return (
                <CircleMarker
                  center={[position.latitude, position.longitude]}
                  eventHandlers={{
                    click: (event) => {
                      stopMapClick(event);
                      if (targetPlacementActive) {
                        onPickTarget({
                          latitude: event.latlng.lat,
                          longitude: event.latlng.lng
                        });
                        return;
                      }

                      onToggleCase(marker.id);
                    },
                    mousemove: closeBoundaryTooltips,
                    mouseover: closeBoundaryTooltips
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
              );
            })}
            {renderableLandPriceMarkers.map((marker) => {
              const position = snapMarkerToBoundary(marker, boundarySpatialIndex);

              return (
                <CircleMarker
                  center={[position.latitude, position.longitude]}
                  eventHandlers={{
                    click: (event) => {
                      stopMapClick(event);
                      if (targetPlacementActive) {
                        onPickTarget({
                          latitude: event.latlng.lat,
                          longitude: event.latlng.lng
                        });
                        return;
                      }

                      onToggleLandPoint(marker.pointId);
                    },
                    mousemove: closeBoundaryTooltips,
                    mouseover: closeBoundaryTooltips
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
              );
            })}
          </Pane>
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
