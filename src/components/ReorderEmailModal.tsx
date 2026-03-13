import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Copy, Check, Mail } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";

interface SkuLine {
  sku: string;
  sku_name: string;
  suggested_order_qty: number;
  unit_price: number;
}

interface ReorderEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: string;
  skus: SkuLine[];
}

function formatDate(lang: 'en' | 'hu') {
  const d = new Date();
  if (lang === 'hu') {
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}.`;
  }
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
}

function generateEmail(supplier: string, skus: SkuLine[], lang: 'en' | 'hu'): { subject: string; body: string } {
  const date = formatDate(lang);
  const totalValue = skus.reduce((sum, s) => sum + s.suggested_order_qty * s.unit_price, 0);

  if (lang === 'hu') {
    const subject = `Beszerzési megrendelés — ${supplier} — ${date}`;
    const lines = skus.map(s => {
      const subtotal = s.suggested_order_qty * s.unit_price;
      return `  • ${s.sku} — ${s.sku_name}\n    Mennyiség: ${s.suggested_order_qty.toLocaleString()} db | Egységár: €${s.unit_price.toFixed(2)} | Részösszeg: €${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    });
    const body = `Tisztelt ${supplier}!

Az alábbi tételek megrendelését szeretnénk feladni:

${lines.join('\n\n')}

────────────────────────────────
Összérték: €${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

Kérjük, erősítsék meg a rendelést és a várható szállítási időt.

Üdvözlettel`;
    return { subject, body };
  }

  const subject = `Purchase Order Request — ${supplier} — ${date}`;
  const lines = skus.map(s => {
    const subtotal = s.suggested_order_qty * s.unit_price;
    return `  • ${s.sku} — ${s.sku_name}\n    Qty: ${s.suggested_order_qty.toLocaleString()} | Unit price: €${s.unit_price.toFixed(2)} | Subtotal: €${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  });
  const body = `Dear ${supplier},

We would like to place an order for the following items:

${lines.join('\n\n')}

────────────────────────────────
Total order value: €${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

Please confirm the order and expected delivery date.

Best regards`;
  return { subject, body };
}

export function ReorderEmailModal({ open, onOpenChange, supplier, skus }: ReorderEmailModalProps) {
  const { t, language } = useLanguage();
  const [lang, setLang] = useState<'en' | 'hu'>(language);
  const [copied, setCopied] = useState(false);

  const { subject, body } = generateEmail(supplier, skus, lang);
  const fullText = `Subject: ${subject}\n\n${body}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    toast.success(t('email.copiedToast'));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            {t('email.draftTitle')} — {supplier}
          </DialogTitle>
          <DialogDescription>
            {t('email.prefilled')} {skus.length} {t('email.itemsToReorder')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={lang} onValueChange={(v) => setLang(v as 'en' | 'hu')} className="mt-2">
          <TabsList className="grid w-full grid-cols-2 max-w-[200px]">
            <TabsTrigger value="en">English</TabsTrigger>
            <TabsTrigger value="hu">Magyar</TabsTrigger>
          </TabsList>
          <TabsContent value={lang} className="mt-3">
            <div className="rounded-lg border bg-muted/30 p-4 text-sm overflow-auto max-h-[50vh]">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Subject</p>
              <p className="font-medium mb-4">{subject}</p>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Body</p>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{body}</pre>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end mt-4 pt-3 border-t">
          <Button onClick={handleCopy} className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? t('email.copied') : t('email.copyToClipboard')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
