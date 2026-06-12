import { NextRequest, NextResponse } from "next/server";

import { fetchTransactions } from "@/lib/reinfolibClient";

export const dynamic = "force-dynamic";

function defaultTransactionYear() {
  return String(new Date().getFullYear() - 1);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const result = await fetchTransactions({
    year: params.get("year") ?? defaultTransactionYear(),
    quarter: params.get("quarter") ?? "4",
    area: params.get("area") ?? "27",
    city: params.get("city") ?? "27102",
    priceClassification: params.get("priceClassification") ?? "01",
    language: "ja"
  });

  return NextResponse.json({
    cases: result.data,
    warning: result.warning,
    fallback: result.fallback
  });
}
