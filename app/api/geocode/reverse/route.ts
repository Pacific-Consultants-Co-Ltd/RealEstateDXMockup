import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface NominatimAddress {
  borough?: string;
  city?: string;
  city_district?: string;
  country?: string;
  house_number?: string;
  neighbourhood?: string;
  province?: string;
  quarter?: string;
  road?: string;
  state?: string;
  suburb?: string;
  town?: string;
  village?: string;
  ward?: string;
}

interface NominatimReverseResponse {
  address?: NominatimAddress;
  display_name?: string;
}

function coordinateLabel(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function compactDisplayName(displayName: string | undefined): string {
  if (!displayName) {
    return "";
  }

  const parts = displayName
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && part !== "日本" && !/^\d{3}-?\d{4}$/.test(part));

  return parts.reverse().join("");
}

function uniqueParts(parts: Array<string | undefined>): string[] {
  const seen = new Set<string>();

  return parts.filter((part): part is string => {
    if (!part || seen.has(part)) {
      return false;
    }

    seen.add(part);
    return true;
  });
}

function formatJapaneseAddress(payload: NominatimReverseResponse): string {
  const address = payload.address;

  if (!address) {
    return compactDisplayName(payload.display_name);
  }

  const structured = uniqueParts([
    address.province ?? address.state,
    address.city ?? address.town ?? address.village,
    address.city_district ?? address.ward ?? address.borough ?? address.suburb,
    address.quarter ?? address.neighbourhood,
    address.road,
    address.house_number
  ]).join("");

  return structured || compactDisplayName(payload.display_name);
}

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lng"));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
  }

  try {
    const params = new URLSearchParams({
      addressdetails: "1",
      format: "jsonv2",
      lat: String(latitude),
      lon: String(longitude)
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: {
        "Accept-Language": "ja",
        "User-Agent": "RealEstateDXMockup/0.1 (local development target picker)"
      },
      next: { revalidate: 86_400 }
    });

    if (!response.ok) {
      throw new Error("Reverse geocoder failed.");
    }

    const payload = (await response.json()) as NominatimReverseResponse;
    const address = formatJapaneseAddress(payload) || coordinateLabel(latitude, longitude);

    return NextResponse.json({ address, latitude, longitude });
  } catch {
    return NextResponse.json({
      address: coordinateLabel(latitude, longitude),
      latitude,
      longitude,
      warning: "住所を取得できなかったため、座標を表示しています。"
    });
  }
}
