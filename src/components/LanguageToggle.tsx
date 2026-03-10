import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  const toggle = () => {
    setLanguage(language === "hu" ? "en" : "hu");
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 font-bold text-xs"
            onClick={toggle}
          >
            {language === "hu" ? "HU" : "EN"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{language === "hu" ? "Switch to English" : "Váltás magyarra"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
