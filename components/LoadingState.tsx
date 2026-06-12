import { LoaderCircle } from "lucide-react";

export default function LoadingState({ label = "読み込み中" }: { label?: string }) {
  return (
    <div className="loading-state">
      <LoaderCircle aria-hidden="true" className="spin-icon" size={18} />
      <span>{label}</span>
    </div>
  );
}

