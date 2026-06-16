"use client";

import L, { type LeafletMouseEvent } from "leaflet";
import { useMemo } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";

import { formatM2, formatPercent, formatTsubo, formatYenPerM2, formatYenPerTsubo } from "@/lib/formatters";
import type { ComparableCase, PublicLandPricePoint, TargetLocation } from "@/lib/types";

export interface MapArea {
  key: string;
  label: string;
  latitude: number;
  longitude: number;
  count: number;
}

interface MapViewProps {
  areas: MapArea[];
  cases: ComparableCase[];
  landPricePoints: PublicLandPricePoint[];
  selectedAreaKeys: string[];
  selectedLandPointIds: string[];
  target: TargetLocation;
  onMapAreaClick: (latitude: number, longitude: number) => void;
  onToggleCase: (id: string) => void;
  onToggleLandPoint: (pointId: string) => void;
}

function comparableIcon(comparable: ComparableCase) {
  return L.divIcon({
    className: "marker-shell",
    html: `<span class="case-marker ${comparable.selected ? "selected" : ""} source-${comparable.source}"></span>`,
    iconAnchor: [12, 12],
    iconSize: [24, 24]
  });
}

function landPriceIcon(selected: boolean) {
  return L.divIcon({
    className: "marker-shell",
    html: `<span class="land-price-marker ${selected ? "selected" : ""}"></span>`,
    iconAnchor: [10, 10],
    iconSize: [20, 20]
  });
}

function targetIcon() {
  return L.divIcon({
    className: "marker-shell",
    html: `<span class="target-marker"></span>`,
    iconAnchor: [15, 30],
    iconSize: [30, 30]
  });
}

function stopMapClick(event: LeafletMouseEvent) {
  L.DomEvent.stopPropagation(event.originalEvent);
}

function MapClickHandler({ onMapAreaClick }: { onMapAreaClick: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onMapAreaClick(event.latlng.lat, event.latlng.lng);
    }
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
            <i className="legend-symbol legend-target" aria-hidden="true" />
            対象地
          </span>
          <span className="map-legend-item">
            <i className="legend-symbol legend-case-csv" aria-hidden="true" />
            CSV事例
          </span>
          <span className="map-legend-item">
            <i className="legend-symbol legend-case-mlit" aria-hidden="true" />
            取引価格情報
          </span>
          <span className="map-legend-item">
            <i className="legend-symbol legend-case-selected" aria-hidden="true" />
            選択事例
          </span>
          <span className="map-legend-item">
            <i className="legend-symbol legend-land" aria-hidden="true" />
            公示地価
          </span>
          <span className="map-legend-item">
            <i className="legend-symbol legend-land-selected" aria-hidden="true" />
            選択地価
          </span>
          <span className="map-legend-item">
            <i className="legend-symbol legend-radius" aria-hidden="true" />
            1km圏
          </span>
          <span className="map-legend-item">
            <i className="legend-symbol legend-area" aria-hidden="true" />
            選択町丁目
          </span>
        </div>
      </details>
    </div>
  );
}

export default function MapView({
  areas,
  cases,
  landPricePoints,
  selectedAreaKeys,
  selectedLandPointIds,
  target,
  onMapAreaClick,
  onToggleCase,
  onToggleLandPoint
}: MapViewProps) {
  const latestLandPoints = useMemo(() => {
    const byPoint = new Map<string, PublicLandPricePoint>();
    for (const point of landPricePoints) {
      const current = byPoint.get(point.pointId);
      if (!current || current.year < point.year) {
        byPoint.set(point.pointId, point);
      }
    }

    return Array.from(byPoint.values());
  }, [landPricePoints]);

  const selectedAreas = areas.filter((area) => selectedAreaKeys.includes(area.key));

  return (
    <section className="map-panel">
      <div className="map-frame">
        <MapContainer center={[target.latitude, target.longitude]} scrollWheelZoom zoom={13}>
          <MapClickHandler onMapAreaClick={onMapAreaClick} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Circle
            center={[target.latitude, target.longitude]}
            pathOptions={{ color: "#375f96", fillColor: "#5b8fc7", fillOpacity: 0.06, weight: 1.5 }}
            radius={1000}
          />
          {selectedAreas.map((area) => (
            <Circle
              center={[area.latitude, area.longitude]}
              key={area.key}
              pathOptions={{ color: "#d71920", fillColor: "#d71920", fillOpacity: 0.12, weight: 2 }}
              radius={460}
            />
          ))}
          <Marker icon={targetIcon()} position={[target.latitude, target.longitude]}>
            <Popup>
              <div className="map-popup">
                <strong>対象地</strong>
                <p>{target.address}</p>
              </div>
            </Popup>
          </Marker>

          {cases.map((comparable) => (
            <Marker
              eventHandlers={{
                click: (event) => {
                  stopMapClick(event);
                  onToggleCase(comparable.id);
                }
              }}
              icon={comparableIcon(comparable)}
              key={comparable.id}
              position={[comparable.latitude, comparable.longitude]}
            >
              <Popup>
                <div className="map-popup">
                  <strong>{comparable.address}</strong>
                  <dl>
                    <div>
                      <dt>価格</dt>
                      <dd>{comparable.priceTotalDisplay || "-"}</dd>
                    </div>
                    <div>
                      <dt>土地面積</dt>
                      <dd>
                        {formatTsubo(comparable.landAreaTsubo)} / {formatM2(comparable.landAreaM2)}
                      </dd>
                    </div>
                    <div>
                      <dt>坪単価</dt>
                      <dd>{formatYenPerTsubo(comparable.unitPricePerTsubo)}</dd>
                    </div>
                    <div>
                      <dt>用途地域</dt>
                      <dd>{comparable.zoning || "-"}</dd>
                    </div>
                    <div>
                      <dt>取引時期</dt>
                      <dd>{comparable.transactionDate || "-"}</dd>
                    </div>
                  </dl>
                  <button className="popup-button" type="button" onClick={() => onToggleCase(comparable.id)}>
                    {comparable.selected ? "選択解除" : "選択"}
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}

          {latestLandPoints.map((point) => {
            const selected = selectedLandPointIds.includes(point.pointId);

            return (
              <Marker
                eventHandlers={{
                  click: (event) => {
                    stopMapClick(event);
                    onToggleLandPoint(point.pointId);
                  }
                }}
                icon={landPriceIcon(selected)}
                key={point.id}
                position={[point.latitude, point.longitude]}
              >
                <Popup>
                  <div className="map-popup">
                    <strong>{point.standardLotNumber || point.pointId}</strong>
                    <p>{point.address}</p>
                    <dl>
                      <div>
                        <dt>価格</dt>
                        <dd>{formatYenPerM2(point.pricePerM2)}</dd>
                      </div>
                      <div>
                        <dt>前年比</dt>
                        <dd>{formatPercent(point.yearOnYearChangeRate)}</dd>
                      </div>
                      <div>
                        <dt>最寄駅</dt>
                        <dd>{point.nearestStation || "-"}</dd>
                      </div>
                    </dl>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
        <MapLegend />
      </div>
    </section>
  );
}
