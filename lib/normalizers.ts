import type { ComparableCase, PublicLandPricePoint } from "./types";

export const M2_PER_TSUBO = 3.305785;

type CsvRow = Record<string, unknown>;

function textValue(value: unknown): string {
  return String(value ?? "").trim();
}

function getValue(row: CsvRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (textValue(value)) {
      return textValue(value);
    }
  }

  return "";
}

export function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = textValue(value)
    .replace(/,/g, "")
    .replace(/[％%]/g, "")
    .replace(/㎡|m2|m²/g, "")
    .replace(/円/g, "")
    .trim();
  const number = Number.parseFloat(text);

  return Number.isFinite(number) ? number : undefined;
}

export function parseJapaneseMoney(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = textValue(value).replace(/,/g, "").replace(/\s+/g, "");
  if (!text) {
    return undefined;
  }

  let amount = 0;
  const okuMatch = text.match(/([0-9.]+)億/);
  const manMatch = text.match(/([0-9.]+)万/);
  const senMatch = text.match(/([0-9.]+)千/);

  if (okuMatch) {
    amount += Number.parseFloat(okuMatch[1]) * 100_000_000;
  }

  if (manMatch) {
    amount += Number.parseFloat(manMatch[1]) * 10_000;
  }

  if (senMatch && !manMatch) {
    amount += Number.parseFloat(senMatch[1]) * 1_000;
  }

  if (amount > 0) {
    return Math.round(amount);
  }

  return parseNumber(text);
}

export function parsePercent(value: unknown): number | undefined {
  return parseNumber(value);
}

function hashText(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function stableIdHash(parts: unknown[]): string {
  return hashText(parts.map(textValue).join("|")).toString(36);
}

export function deriveOsakaCoordinates(address: string, index = 0): { latitude: number; longitude: number } {
  const bases = [
    { test: /都島|野江|内代/, latitude: 34.7086, longitude: 135.5324 },
    { test: /滝井|守口|八重中/, latitude: 34.724, longitude: 135.5561 },
    { test: /豊崎|中津|北区/, latitude: 34.7138, longitude: 135.5002 }
  ];
  const base = bases.find((candidate) => candidate.test.test(address)) ?? {
    latitude: 34.7115,
    longitude: 135.535
  };
  const hash = hashText(`${address}-${index}`);
  const latOffset = (((hash % 1000) / 1000) - 0.5) * 0.008 + index * 0.00005;
  const lngOffset = ((((hash >>> 10) % 1000) / 1000) - 0.5) * 0.01 - index * 0.00004;

  return {
    latitude: Number((base.latitude + latOffset).toFixed(6)),
    longitude: Number((base.longitude + lngOffset).toFixed(6))
  };
}

export function normalizeCsvRows(rows: CsvRow[]): ComparableCase[] {
  const defaultSelectedIndexes = new Set([1, 2, 4, 6]);

  return rows.map((row, index) => {
    const propertyNumber = getValue(row, ["物件番号"]);
    const address = getValue(row, ["所在地"]);
    const landAreaM2 = parseNumber(getValue(row, ["土地面積"]));
    const landAreaTsubo = landAreaM2 ? landAreaM2 / M2_PER_TSUBO : undefined;
    const priceText = getValue(row, ["価格"]);
    const priceTotalYen = parseJapaneseMoney(priceText);
    const unitPricePerM2 = parseJapaneseMoney(getValue(row, ["m2単価", "㎡単価"]));
    const unitPricePerTsubo =
      parseJapaneseMoney(getValue(row, ["坪単価"])) ??
      (priceTotalYen && landAreaTsubo ? priceTotalYen / landAreaTsubo : undefined);
    const roadCondition = [getValue(row, ["接道状況"]), getValue(row, ["-"]), getValue(row, ["接道1"])]
      .filter(Boolean)
      .join(" / ");
    const coords = deriveOsakaCoordinates(address, index);

    return {
      id: `csv-${propertyNumber || index + 1}`,
      source: "csv",
      propertyNumber,
      propertyType: getValue(row, ["物件種目"]),
      address,
      latitude: coords.latitude,
      longitude: coords.longitude,
      landAreaM2,
      landAreaTsubo,
      priceTotalYen,
      priceTotalDisplay: priceText,
      unitPricePerM2,
      unitPricePerTsubo,
      zoning: getValue(row, ["用途地域"]),
      nearestStation: getValue(row, ["沿線駅", "浴線駅"]),
      access: getValue(row, ["交通"]),
      buildingCoverageRatio: parsePercent(getValue(row, ["建ぺい率"])),
      floorAreaRatio: parsePercent(getValue(row, ["容積率"])),
      roadCondition,
      transactionDate: getValue(row, ["成約年月日"]),
      selected: defaultSelectedIndexes.has(index),
      externalLink: "#",
      raw: row
    };
  });
}

function extractRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const container = payload as Record<string, unknown>;
  for (const key of ["data", "result", "results", "items"]) {
    const value = container[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
    }
  }

  const features = container.features;
  if (Array.isArray(features)) {
    return features
      .map((feature) => {
        if (feature && typeof feature === "object") {
          return (feature as Record<string, unknown>).properties;
        }

        return undefined;
      })
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  }

  return [];
}

export function normalizeMlitTransactions(payload: unknown): ComparableCase[] {
  return extractRecords(payload).map((record, index) => {
    const address = [record.Prefecture, record.Municipality, record.DistrictName]
      .map(textValue)
      .filter(Boolean)
      .join("");
    const fallbackAddress = address || textValue(record.location) || textValue(record.address) || "大阪府大阪市都島区";
    const area = parseNumber(record.Area);
    const landAreaTsubo = area ? area / M2_PER_TSUBO : undefined;
    const price = parseJapaneseMoney(record.TradePrice);
    const unitM2 =
      parseJapaneseMoney(record.UnitPrice) ??
      parseJapaneseMoney(record.PricePerUnit) ??
      (price && area ? price / area : undefined);
    const unitTsubo = unitM2 ? unitM2 * M2_PER_TSUBO : price && landAreaTsubo ? price / landAreaTsubo : undefined;
    const coords = deriveOsakaCoordinates(fallbackAddress, index + 20);
    const recordId = stableIdHash([
      record.TradePrice,
      record.PricePerUnit,
      record.Area,
      record.Type,
      record.Region,
      record.MunicipalityCode,
      record.DistrictCode,
      record.DistrictName,
      record.Period,
      index
    ]);

    return {
      id: `mlit-tx-${recordId}`,
      source: "mlit_transaction",
      propertyNumber: textValue(record.DistrictCode) || textValue(record.MunicipalityCode) || undefined,
      propertyType: textValue(record.Type) || textValue(record.Classification) || "取引事例",
      address: fallbackAddress,
      latitude: coords.latitude,
      longitude: coords.longitude,
      landAreaM2: area,
      landAreaTsubo,
      priceTotalYen: price,
      priceTotalDisplay: price ? `${Math.round(price / 10_000).toLocaleString("ja-JP")}万円` : undefined,
      unitPricePerM2: unitM2,
      unitPricePerTsubo: unitTsubo,
      zoning: textValue(record.CityPlanning) || textValue(record.Classification) || undefined,
      nearestStation: textValue(record.Station) || undefined,
      access: textValue(record.Distance) || undefined,
      buildingCoverageRatio: parsePercent(record.CoverageRatio),
      floorAreaRatio: parsePercent(record.FloorAreaRatio),
      roadCondition: [record.Direction, record.Breadth].map(textValue).filter(Boolean).join(" "),
      transactionDate: textValue(record.Period) || textValue(record.PriceCategory) || undefined,
      selected: false,
      externalLink: "https://www.reinfolib.mlit.go.jp/",
      raw: record
    };
  });
}

function featureCoordinates(feature: Record<string, unknown>, fallbackIndex: number): { latitude: number; longitude: number } {
  const geometry = feature.geometry as Record<string, unknown> | undefined;
  const coordinates = geometry?.coordinates;

  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  return deriveOsakaCoordinates(textValue((feature.properties as Record<string, unknown> | undefined)?.location), fallbackIndex);
}

export function normalizeLandPricePoints(payload: unknown): PublicLandPricePoint[] {
  const featureRecords =
    payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).features)
      ? ((payload as Record<string, unknown>).features as Record<string, unknown>[])
      : extractRecords(payload).map((properties) => ({ properties }));

  return featureRecords.map((feature, index) => {
    const properties = (((feature as Record<string, unknown>).properties as Record<string, unknown> | undefined) ??
      feature) as Record<string, unknown>;
    const coords = featureCoordinates(feature, index + 40);
    const pointId = textValue(properties.point_id) || textValue(properties.id) || `land-${index}`;
    const year =
      parseNumber(properties.target_year_name_ja) ??
      parseNumber(properties.year) ??
      new Date().getFullYear();

    return {
      id: `land-${pointId}-${year}`,
      source: "mlit_land_price",
      pointId,
      year,
      standardLotNumber: textValue(properties.standard_lot_number_ja) || undefined,
      address: textValue(properties.location) || textValue(properties.address) || "大阪府大阪市都島区",
      latitude: coords.latitude,
      longitude: coords.longitude,
      pricePerM2:
        parseJapaneseMoney(properties.u_current_years_price_ja) ??
        parseJapaneseMoney(properties.current_years_price) ??
        0,
      previousYearPricePerM2: parseJapaneseMoney(properties.last_years_price),
      yearOnYearChangeRate: parsePercent(properties.year_on_year_change_rate) ?? 0,
      cadastral: textValue(properties.u_cadastral_ja) || undefined,
      nearestStation: textValue(properties.nearest_station_name_ja) || undefined,
      distanceToStation: textValue(properties.u_road_distance_to_nearest_station_name_ja) || undefined,
      useCategory: textValue(properties.regulations_use_category_name_ja) || undefined,
      buildingCoverageRatio: parsePercent(properties.u_regulations_building_coverage_ratio_ja),
      floorAreaRatio: parsePercent(properties.u_regulations_floor_area_ratio_ja),
      raw: properties
    };
  });
}
