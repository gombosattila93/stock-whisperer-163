import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HelpTooltipProps {
  text: string;
  tip?: string;
  className?: string;
  size?: number;
}

export function HelpTooltip({ text, tip, className = "", size = 14 }: HelpTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors p-0.5 ${className}`}
            tabIndex={-1}
          >
            <HelpCircle style={{ width: size, height: size }} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          <p className="font-medium mb-1">{text}</p>
          {tip && <p className="text-muted-foreground">{tip}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
