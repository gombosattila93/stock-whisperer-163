import { useState, useRef, useEffect } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EditableCellProps {
  value: number;
  sku: string;
  field: string;
  isOverridden: boolean;
  onSave: (sku: string, field: string, value: number) => void;
}

export function EditableCell({ value, sku, field, isOverridden, onSave }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(value));
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, value]);

  const commit = () => {
    const num = Number(draft);
    if (!isNaN(num) && num >= 0) {
      onSave(sku, field, num);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="h-7 w-20 text-xs text-right px-1.5"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        "inline-flex items-center gap-1 text-right cursor-pointer rounded px-1.5 py-0.5 transition-colors hover:bg-accent group",
        isOverridden && "bg-primary/10 text-primary font-semibold"
      )}
      title={isOverridden ? "Manually overridden — click to edit" : "Click to override"}
    >
      <span>{value.toLocaleString()}</span>
      {isOverridden ? (
        <Pencil className="h-3 w-3 text-primary shrink-0" />
      ) : (
        <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 shrink-0 transition-colors" />
      )}
    </button>
  );
}
