import { NextRequest, NextResponse } from "next/server";

import { fetchLandPricePoints } from "@/lib/reinfolibClient";

export const dynamic = "force-dynamic";

function uniquePoints(points: Awaited<ReturnType<typeof fetchLandPricePoints>>["data"]) {
  const byPointYear = new Map<string, (typeof points)[number]>();

  for (const point of points) {
    byPointYear.set(`${point.pointId}-${point.year}`, point);
  }

  return Array.from(byPointYear.values()).sort((left, right) => {
    if (left.pointId !== right.pointId) {
      return left.pointId.localeCompare(right.pointId, "ja");
    }

    return left.year - right.year;
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const baseParams = {
    response_format: "geojson",
    z: params.get("z") ?? "14",
    x: params.get("x") ?? "14360",
    y: params.get("y") ?? "6505",
    priceClassification: params.get("priceClassification") ?? "0",
    useCategoryCode: params.get("useCategoryCode") ?? "00"
  };
  const requestedYear = params.get("year");
  const years = requestedYear
    ? [Number(requestedYear)]
    : Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - index);
  const results = await Promise.all(
    years.map((year) =>
      fetchLandPricePoints({
        ...baseParams,
        year
      })
    )
  );
  const warnings = Array.from(new Set(results.map((result) => result.warning).filter((warning): warning is string => Boolean(warning))));

  return NextResponse.json({
    points: uniquePoints(results.flatMap((result) => result.data)),
    warning: warnings.join(" "),
    fallback: results.every((result) => result.fallback)
  });
}
