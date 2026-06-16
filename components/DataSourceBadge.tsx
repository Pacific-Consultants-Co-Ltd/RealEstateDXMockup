import type { ComparableCaseSource } from "@/lib/types";

const sourceLabels: Record<ComparableCaseSource, string> = {
  csv: "自社データ",
  mlit_transaction: "取引事例",
  mlit_land_price: "公示地価",
  manual: "自社事例"
};

export default function DataSourceBadge({ source }: { source: ComparableCaseSource }) {
  return <span className={`source-badge source-${source}`}>{sourceLabels[source]}</span>;
}
