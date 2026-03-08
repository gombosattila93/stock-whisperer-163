import { useInventory } from "@/context/InventoryContext";

interface HighlightTextProps {
  text: string;
  className?: string;
}

export function HighlightText({ text, className = "" }: HighlightTextProps) {
  const { searchQuery } = useInventory();
  const q = searchQuery.trim();

  if (!q) return <span className={className}>{text}</span>;

  // 4a) Escape regex special characters
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <span className={className}>{text}</span>;

  // 4c) Truncate long SKU names with tooltip
  const maxLen = 40;
  const displayText = text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  const needsTruncation = text.length > maxLen;

  if (needsTruncation) {
    const truncIdx = displayText.toLowerCase().indexOf(q.toLowerCase());
    if (truncIdx === -1) {
      return (
        <span className={className} title={text}>
          {displayText}
        </span>
      );
    }
    return (
      <span className={className} title={text}>
        {displayText.slice(0, truncIdx)}
        <mark className="bg-warning/30 text-foreground rounded-sm px-0.5">
          {displayText.slice(truncIdx, truncIdx + q.length)}
        </mark>
        {displayText.slice(truncIdx + q.length)}
      </span>
    );
  }

  return (
    <span className={className}>
      {text.slice(0, idx)}
      <mark className="bg-warning/30 text-foreground rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </span>
  );
}

/** Truncated text with tooltip for long names — no search highlighting */
export function TruncatedText({ text, maxLen = 40, className = "" }: { text: string; maxLen?: number; className?: string }) {
  if (text.length <= maxLen) return <span className={className}>{text}</span>;
  return <span className={className} title={text}>{text.slice(0, maxLen)}…</span>;
}
