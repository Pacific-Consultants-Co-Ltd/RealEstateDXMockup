import { AlertTriangle } from "lucide-react";

export default function ErrorFallbackBanner({ messages }: { messages: string[] }) {
  const uniqueMessages = Array.from(new Set(messages.filter(Boolean)));

  if (uniqueMessages.length === 0) {
    return null;
  }

  return (
    <div className="fallback-banner" role="status">
      <AlertTriangle aria-hidden="true" size={18} />
      <div>
        {uniqueMessages.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </div>
    </div>
  );
}
