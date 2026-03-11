import { Download, ClipboardCopy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToCsv } from "@/lib/csvUtils";
import { toast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Papa from "papaparse";
import { useLanguage } from "@/lib/i18n";

interface ExportButtonProps {
  data: Record<string, unknown>[];
  filename: string;
}

export function ExportButton({ data, filename }: ExportButtonProps) {
  const { t } = useLanguage();

  const copyToClipboard = async () => {
    if (data.length === 0) return;
    try {
      const tsv = Papa.unparse(data, { delimiter: "\t" });
      await navigator.clipboard.writeText(tsv);
      toast({ title: "Copied!", description: "Table data copied — paste into Excel or Sheets." });
    } catch {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "destructive" });
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => exportToCsv(data, filename)}
        disabled={data.length === 0}
      >
        <Download className="h-4 w-4 mr-1.5" />
        {t('common.export')} CSV
      </Button>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyToClipboard} disabled={data.length === 0}>
              <ClipboardCopy className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Copy to clipboard (paste into Excel)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
