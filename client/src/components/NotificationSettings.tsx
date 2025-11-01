import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Settings } from "lucide-react";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notifications";

interface NotificationSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationSettings({ open, onOpenChange }: NotificationSettingsProps) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(getNotificationPreferences());

  // Load preferences when dialog opens
  useEffect(() => {
    if (open) {
      setPrefs(getNotificationPreferences());
    }
  }, [open]);

  const handleSave = () => {
    saveNotificationPreferences(prefs);
    onOpenChange(false);
  };

  const updatePref = (key: keyof NotificationPreferences, value: boolean) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-notification-settings">
        <DialogHeader>
          <DialogTitle>Notification Settings</DialogTitle>
          <DialogDescription>
            Customize how you receive notifications for new messages
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Browser Push Notifications */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push" className="text-base">
                Browser Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Show desktop notifications for new messages
              </p>
            </div>
            <Switch
              id="push"
              checked={prefs.push}
              onCheckedChange={(checked) => updatePref("push", checked)}
              data-testid="switch-push-notifications"
            />
          </div>

          {/* Sound */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="sound" className="text-base">
                Notification Sound
              </Label>
              <p className="text-sm text-muted-foreground">
                Play sound when receiving messages
              </p>
            </div>
            <Switch
              id="sound"
              checked={prefs.sound}
              onCheckedChange={(checked) => updatePref("sound", checked)}
              data-testid="switch-sound"
            />
          </div>

          {/* In-app Highlights */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="highlights" className="text-base">
                Message Highlights
              </Label>
              <p className="text-sm text-muted-foreground">
                Highlight new messages in the chat
              </p>
            </div>
            <Switch
              id="highlights"
              checked={prefs.highlights}
              onCheckedChange={(checked) => updatePref("highlights", checked)}
              data-testid="switch-highlights"
            />
          </div>

          {/* Mention Sound */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="mentionSound" className="text-base">
                @Mention Alert
              </Label>
              <p className="text-sm text-muted-foreground">
                Extra alert when you're mentioned (double beep)
              </p>
            </div>
            <Switch
              id="mentionSound"
              checked={prefs.mentionSound}
              onCheckedChange={(checked) => updatePref("mentionSound", checked)}
              data-testid="switch-mention-sound"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-settings"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} data-testid="button-save-settings">
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NotificationSettingsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setOpen(true)}
        title="Notification Settings"
        data-testid="button-notification-settings"
      >
        <Settings className="h-4 w-4" />
      </Button>
      <NotificationSettings open={open} onOpenChange={setOpen} />
    </>
  );
}
