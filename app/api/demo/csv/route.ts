import path from "path";

import { NextResponse } from "next/server";

import { parseComparableCsv } from "@/lib/csvParser";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const csvPath = path.join(process.cwd(), "csv_ocr_fudousan_result_page1.csv");
    const { cases, warnings } = await parseComparableCsv(csvPath);

    return NextResponse.json({
      cases,
      warnings: warnings.length > 0 ? ["自社データの一部を読み取れなかったため、読み取れた情報のみ表示しています。"] : [],
      fallback: false
    });
  } catch (error) {
    return NextResponse.json(
      {
        cases: [],
        warnings: ["自社データを読み込めませんでした。"],
        fallback: true
      },
      { status: 500 }
    );
  }
}
