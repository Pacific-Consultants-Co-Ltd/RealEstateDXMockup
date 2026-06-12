import type { ComparableCaseSource } from "@/lib/types";

const sourceLabels: Record<ComparableCaseSource, string> = {
  csv: "自社CSV",
  mlit_transaction: "API取引",
  mlit_land_price: "公示地価",
  manual: "自社事例"
};

export default function DataSourceBadge({ source }: { source: ComparableCaseSource }) {
  return <span className={`source-badge source-${source}`}>{sourceLabels[source]}</span>;
}

