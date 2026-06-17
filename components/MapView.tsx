"use client";

import L, { type LeafletMouseEvent, type PathOptions } from "leaflet";
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

function stopMapClick(event: LeafletMouseEvent) {
  L.DomEvent.stopPropagation(event.originalEvent);
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
      color: "#708090",
      fillColor: "#708090",
      fillOpacity: 0.012,
      opacity: 0.28,
      weight: 0.7
    };
  }

  return {
    color: selected ? "#d71920" : "#375f96",
    fillColor: selected ? "#d71920" : "#5b8fc7",
    fillOpacity: selected ? 0.18 : 0.055,
    opacity: selected ? 0.95 : 0.72,
    weight: selected ? 2.4 : 1.2
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
    <div className="map-legend-overlay">
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
            町丁目境界
          </span>
          <span className="map-legend-item">
            <i className="legend-symbol legend-area-selected" aria-hidden="true" />
            選択町丁目
          </span>
        </div>
      </details>
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
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);

  const areaByKey = useMemo(() => new Map(areas.map((area) => [area.key, area])), [areas]);
  const availableAreaSet = useMemo(() => new Set(areas.map((area) => area.key)), [areas]);
  const selectedAreaSet = useMemo(() => new Set(selectedAreaKeys), [selectedAreaKeys]);
  const availableAreaSetRef = useRef(availableAreaSet);
  const selectedAreaSetRef = useRef(selectedAreaSet);
  const boundaryLayerKey = useMemo(() => `boundaries-${boundaryBbox}`, [boundaryBbox]);
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
  }, [boundaryData, boundaryStyle]);

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
            fillOpacity: selected ? 0.24 : 0.12,
            weight: selected ? 2.8 : 1.8
          });
        }
      }
    });
  }

  return (
    <section className="map-panel">
      <div className="map-frame">
        <MapContainer attributionControl={false} center={[target.latitude, target.longitude]} scrollWheelZoom zoom={13}>
          <BoundaryViewport onBboxChange={handleBboxChange} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {boundaryData ? (
            <GeoJSONLayer
              data={boundaryData}
              key={boundaryLayerKey}
              ref={boundaryLayerRef}
              onEachFeature={onEachBoundaryFeature}
              style={boundaryStyle}
            />
          ) : null}
        </MapContainer>
        <MapLegend />
        {boundaryError ? <div className="map-boundary-status">境界データを読み込めませんでした</div> : null}
      </div>
    </section>
  );
}
