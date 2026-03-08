import { useInventory } from "@/context/InventoryContext";

interface HighlightTextProps {
  text: string;
  className?: string;
}

export function HighlightText({ text, className = "" }: HighlightTextProps) {
  const { searchQuery } = useInventory();
  const q = searchQuery.trim();

  if (!q) return <span className={className}>{text}</span>;

  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {text.slice(0, idx)}
      <mark className="bg-warning/30 text-foreground rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </span>
  );
}
