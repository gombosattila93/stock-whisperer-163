import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToCsv } from "@/lib/csvUtils";

interface ExportButtonProps {
  data: Record<string, unknown>[];
  filename: string;
}

export function ExportButton({ data, filename }: ExportButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => exportToCsv(data, filename)}
      disabled={data.length === 0}
    >
      <Download className="h-4 w-4 mr-1.5" />
      Export CSV
    </Button>
  );
}
