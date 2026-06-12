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
      warnings,
      fallback: false
    });
  } catch (error) {
    return NextResponse.json(
      {
        cases: [],
        warnings: [error instanceof Error ? error.message : "CSV読み込みに失敗しました。"],
        fallback: true
      },
      { status: 500 }
    );
  }
}

