import { useState } from "react";
import { useLocation } from "wouter";
import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { SUGGESTION_SECTIONS } from "@/lib/suggestionSections";

export default function SuggestionPopover() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string>("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSection("");
    setMessage("");
  };

  const handleSubmit = async () => {
    if (!section || !message.trim()) {
      toast({
        title: "Almost there",
        description: "Please pick an area and write your suggestion.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/api/suggestions", "POST", {
        section,
        message: message.trim(),
        sourcePage: location,
        platform: "web",
      });
      toast({
        title: "Thanks for the suggestion!",
        description: "The BuildPro team will take a look.",
      });
      reset();
      setOpen(false);
    } catch (error) {
      toast({
        title: "Couldn't send suggestion",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          data-testid="button-suggestion"
          title="Send a suggestion"
        >
          <Lightbulb className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="font-medium leading-none">Send a suggestion</h4>
            <p className="text-sm text-muted-foreground">
              Tell us what would make BuildPro better.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="suggestion-section">Which area?</Label>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger id="suggestion-section" data-testid="select-suggestion-section">
                <SelectValue placeholder="Choose an area" />
              </SelectTrigger>
              <SelectContent>
                {SUGGESTION_SECTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="suggestion-message">Your suggestion</Label>
            <Textarea
              id="suggestion-message"
              data-testid="input-suggestion-message"
              placeholder="What would you like to see?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              data-testid="button-suggestion-cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting}
              data-testid="button-suggestion-submit"
            >
              {submitting ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
