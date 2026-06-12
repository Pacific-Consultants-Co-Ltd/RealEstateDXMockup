import { promises as fs } from "fs";

import iconv from "iconv-lite";
import Papa from "papaparse";

import { normalizeCsvRows } from "./normalizers";
import type { ComparableCase } from "./types";

interface CsvParseResult {
  cases: ComparableCase[];
  warnings: string[];
}

export async function parseComparableCsv(filePath: string): Promise<CsvParseResult> {
  const file = await fs.readFile(filePath);
  const text = iconv.decode(file, "cp932");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });
  const warnings = parsed.errors.map((error) => `${error.code}: ${error.message}`);

  return {
    cases: normalizeCsvRows(parsed.data),
    warnings
  };
}

