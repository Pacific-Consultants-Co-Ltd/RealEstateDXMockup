"use client";

import L from "leaflet";
import { useMemo } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import { formatM2, formatPercent, formatTsubo, formatYenPerM2, formatYenPerTsubo } from "@/lib/formatters";
import type { ComparableCase, PublicLandPricePoint, TargetLocation } from "@/lib/types";

interface MapViewProps {
  cases: ComparableCase[];
  landPricePoints: PublicLandPricePoint[];
  target: TargetLocation;
  radius: string;
  selectedAreas: string[];
  onToggleCase: (id: string) => void;
}

function radiusToMeters(radius: string): number {
  if (radius.endsWith("km")) {
    return Number.parseFloat(radius) * 1000;
  }

  return Number.parseFloat(radius) || 1000;
}

function comparableIcon(comparable: ComparableCase) {
  return L.divIcon({
    className: "marker-shell",
    html: `<span class="case-marker ${comparable.selected ? "selected" : ""} source-${comparable.source}"></span>`,
    iconAnchor: [12, 12],
    iconSize: [24, 24]
  });
}

function landPriceIcon() {
  return L.divIcon({
    className: "marker-shell",
    html: `<span class="land-price-marker"></span>`,
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

export default function MapView({ cases, landPricePoints, target, radius, selectedAreas, onToggleCase }: MapViewProps) {
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

  return (
    <section className="panel map-panel">
      <div className="map-title-row">
        <div className="section-heading">
          <span>周辺取引・地価マップ</span>
          <small>{selectedAreas.join(" / ")}</small>
        </div>
        <div className="map-legend">
          <span>
            <i className="legend-case" /> 事例
          </span>
          <span>
            <i className="legend-selected" /> 選択
          </span>
          <span>
            <i className="legend-land" /> 公示地価
          </span>
          <span>
            <i className="legend-target" /> 対象地
          </span>
        </div>
      </div>

      <div className="map-frame">
        <MapContainer center={[target.latitude, target.longitude]} scrollWheelZoom zoom={13}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Circle
            center={[target.latitude, target.longitude]}
            pathOptions={{ color: "#1f5f8b", fillColor: "#2f86c5", fillOpacity: 0.08, weight: 2 }}
            radius={radiusToMeters(radius)}
          />
          <Marker icon={targetIcon()} position={[target.latitude, target.longitude]}>
            <Popup>
              <div className="map-popup">
                <strong>対象地</strong>
                <p>{target.address}</p>
                <small>検索半径: {radius}</small>
              </div>
            </Popup>
          </Marker>

          {cases.map((comparable) => (
            <Marker
              eventHandlers={{
                click: () => onToggleCase(comparable.id)
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
                      <dt>成約日</dt>
                      <dd>{comparable.transactionDate || "-"}</dd>
                    </div>
                  </dl>
                  <button className="popup-button" type="button" onClick={() => onToggleCase(comparable.id)}>
                    {comparable.selected ? "選択解除" : "選択する"}
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}

          {latestLandPoints.map((point) => (
            <Marker icon={landPriceIcon()} key={point.id} position={[point.latitude, point.longitude]}>
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
          ))}
        </MapContainer>
      </div>
    </section>
  );
}
