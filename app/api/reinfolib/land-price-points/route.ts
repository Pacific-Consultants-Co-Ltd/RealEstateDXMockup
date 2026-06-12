import { NextRequest, NextResponse } from "next/server";

import { fetchLandPricePoints } from "@/lib/reinfolibClient";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const result = await fetchLandPricePoints({
    response_format: "geojson",
    z: params.get("z") ?? "14",
    x: params.get("x") ?? "14360",
    y: params.get("y") ?? "6505",
    year: params.get("year") ?? new Date().getFullYear(),
    priceClassification: params.get("priceClassification") ?? "0",
    useCategoryCode: params.get("useCategoryCode") ?? "00"
  });

  return NextResponse.json({
    points: result.data,
    warning: result.warning,
    fallback: result.fallback
  });
}
