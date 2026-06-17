import { readFile } from "fs/promises";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { areaKeyFromBoundary, normalizeAreaKey } from "@/lib/areaKeys";

export const dynamic = "force-dynamic";

interface BoundaryProperties {
  CITY_NAME?: string;
  S_NAME?: string;
  X_CODE?: number;
  Y_CODE?: number;
  [key: string]: unknown;
}

interface BoundaryFeature {
  type: "Feature";
  geometry: unknown;
  properties: BoundaryProperties;
}

interface BoundaryFeatureCollection {
  type: "FeatureCollection";
  features: BoundaryFeature[];
}

let cachedBoundaries: Promise<BoundaryFeatureCollection> | undefined;

interface BoundaryBbox {
  east: number;
  north: number;
  south: number;
  west: number;
}

function loadBoundaries() {
  cachedBoundaries ??= readFile(path.join(process.cwd(), "public", "boundaries", "osaka.geojson"), "utf8").then(
    (content) => JSON.parse(content) as BoundaryFeatureCollection
  );

  return cachedBoundaries;
}

function parseBbox(value: string | null): BoundaryBbox | undefined {
  if (!value) {
    return undefined;
  }

  const [west, south, east, north] = value.split(",").map((item) => Number(item));

  if (![west, south, east, north].every(Number.isFinite) || west >= east || south >= north) {
    return undefined;
  }

  return { east, north, south, west };
}

function featureMatchesBbox(feature: BoundaryFeature, bbox: BoundaryBbox): boolean {
  const longitude = Number(feature.properties.X_CODE);
  const latitude = Number(feature.properties.Y_CODE);

  return longitude >= bbox.west && longitude <= bbox.east && latitude >= bbox.south && latitude <= bbox.north;
}

export async function GET(request: NextRequest) {
  const requestedKeys = new Set(request.nextUrl.searchParams.getAll("key").filter(Boolean));
  const bbox = parseBbox(request.nextUrl.searchParams.get("bbox"));

  if (requestedKeys.size === 0 && !bbox) {
    return NextResponse.json({ type: "FeatureCollection", features: [] });
  }

  const boundaries = await loadBoundaries();
  const features: BoundaryFeature[] = [];

  for (const feature of boundaries.features) {
    const cityName = typeof feature.properties.CITY_NAME === "string" ? feature.properties.CITY_NAME : "";
    const sName = typeof feature.properties.S_NAME === "string" ? feature.properties.S_NAME : "";
    const areaKey = areaKeyFromBoundary(cityName, sName);
    const townOnlyKey = normalizeAreaKey(sName);
    const matchesRequestedKey = requestedKeys.has(areaKey) || requestedKeys.has(townOnlyKey);
    const matchesViewport = bbox ? featureMatchesBbox(feature, bbox) : false;

    if (!areaKey || (!matchesRequestedKey && !matchesViewport)) {
      continue;
    }

    features.push({
      ...feature,
      properties: {
        ...feature.properties,
        areaKey,
        areaLabel: townOnlyKey
      }
    });
  }

  return NextResponse.json(
    {
      type: "FeatureCollection",
      features
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600"
      }
    }
  );
}
