import { mockLandPricePoints, mockTransactionCases } from "./mockData";
import { normalizeLandPricePoints, normalizeMlitTransactions } from "./normalizers";
import type { ComparableCase, PublicLandPricePoint } from "./types";

type QueryParams = Record<string, string | number | undefined>;

interface ApiResult<T> {
  data: T;
  warning?: string;
  fallback: boolean;
}

const BASE_URL = process.env.REINFOLIB_API_BASE_URL ?? "https://www.reinfolib.mlit.go.jp/ex-api/external";

function withDefaults(params: QueryParams): URLSearchParams {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  return searchParams;
}

async function fetchJson(endpoint: "XIT001" | "XPT002", params: QueryParams): Promise<unknown> {
  const apiKey = process.env.REINFOLIB_API_KEY;
  if (!apiKey) {
    throw new Error("REINFOLIB_API_KEY is not configured.");
  }

  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.search = withDefaults(params).toString();

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`Real Estate Information Library API failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function fetchTransactions(params: QueryParams): Promise<ApiResult<ComparableCase[]>> {
  try {
    const payload = await fetchJson("XIT001", {
      language: "ja",
      ...params
    });
    const cases = normalizeMlitTransactions(payload);

    if (cases.length === 0) {
      return {
        data: mockTransactionCases,
        warning: "取引事例を確認できなかったため、保存済みの周辺事例を表示しています。",
        fallback: true
      };
    }

    return { data: cases, fallback: false };
  } catch (error) {
    return {
      data: mockTransactionCases,
      warning: "取引事例を取得できなかったため、保存済みの周辺事例を表示しています。",
      fallback: true
    };
  }
}

export async function fetchLandPricePoints(params: QueryParams): Promise<ApiResult<PublicLandPricePoint[]>> {
  try {
    const payload = await fetchJson("XPT002", {
      response_format: "geojson",
      useCategoryCode: "00",
      ...params
    });
    const points = normalizeLandPricePoints(payload).filter((point) => point.pricePerM2 > 0);

    if (points.length === 0) {
      return {
        data: mockLandPricePoints,
        warning: "公示地価を確認できなかったため、保存済みの地価情報を表示しています。",
        fallback: true
      };
    }

    return { data: points, fallback: false };
  } catch (error) {
    return {
      data: mockLandPricePoints,
      warning: "公示地価を取得できなかったため、保存済みの地価情報を表示しています。",
      fallback: true
    };
  }
}
