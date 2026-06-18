import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notifications";
import {
  PUSH_NOTIFICATION_GROUPS,
  PUSH_PREFS_VIEW_KEY,
} from "@shared/notificationGroups";

interface NotificationSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PushPrefsResponse = { preferences?: { mutedGroups?: string[] } } | null;

export function NotificationSettings({ open, onOpenChange }: NotificationSettingsProps) {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPreferences>(getNotificationPreferences());
  const [mutedGroups, setMutedGroups] = useState<string[]>([]);

  const { isFetching: pushPrefsFetching, refetch } = useQuery<PushPrefsResponse>({
    queryKey: ["/api/user-view-preferences", PUSH_PREFS_VIEW_KEY],
    enabled: open,
    // Override the app-wide staleTime: Infinity so each open pulls the latest
    // cross-device settings instead of serving a stale cache.
    staleTime: 0,
  });

  // On open: reset device prefs and pull the freshest account-level settings,
  // seeding the toggles from that fresh response (never a stale cache) so we
  // can't save on top of newer settings made on another device.
  useEffect(() => {
    if (!open) return;
    setPrefs(getNotificationPreferences());
    let cancelled = false;
    refetch().then((res) => {
      if (cancelled) return;
      const muted = res.data?.preferences?.mutedGroups;
      setMutedGroups(Array.isArray(muted) ? muted : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, refetch]);

  const saveMutation = useMutation({
    mutationFn: async (next: string[]) =>
      apiRequest("/api/user-view-preferences", "POST", {
        viewKey: PUSH_PREFS_VIEW_KEY,
        preferences: { mutedGroups: next },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/user-view-preferences", PUSH_PREFS_VIEW_KEY],
      });
    },
  });

  const handleSave = async () => {
    saveNotificationPreferences(prefs);
    try {
      await saveMutation.mutateAsync(mutedGroups);
    } catch {
      // Keep the dialog open so the user knows the cross-device sync failed
      // (the device-only prefs above are already saved locally).
      toast({
        title: "Couldn't sync alert categories",
        description: 'Your "Notify me about" choices were not saved across your devices. Please try again.',
        variant: "destructive",
      });
      return;
    }
    onOpenChange(false);
  };

  const updatePref = (key: keyof NotificationPreferences, value: boolean) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  const toggleGroup = (key: string, enabled: boolean) => {
    setMutedGroups(prev =>
      enabled
        ? prev.filter(k => k !== key)
        : Array.from(new Set([...prev, key])),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="dialog-notification-settings"
        className="max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Notification Settings</DialogTitle>
          <DialogDescription>
            Choose what you're notified about and how alerts behave on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Account-level categories — synced across every device */}
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Notify me about</h3>
            <p className="text-xs text-muted-foreground">
              Applies everywhere you're signed in, including the mobile app.
            </p>
          </div>

          <div className="space-y-4">
            {PUSH_NOTIFICATION_GROUPS.map(group => {
              const enabled = !mutedGroups.includes(group.key);
              return (
                <div key={group.key} className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor={`group-${group.key}`} className="text-base">
                      {group.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">{group.description}</p>
                  </div>
                  <Switch
                    id={`group-${group.key}`}
                    checked={enabled}
                    disabled={pushPrefsFetching}
                    onCheckedChange={(checked) => toggleGroup(group.key, checked)}
                    data-testid={`switch-group-${group.key}`}
                  />
                </div>
              );
            })}
          </div>

          {/* Device-only behaviour */}
          <div className="border-t pt-6 space-y-1">
            <h3 className="text-sm font-semibold">On this device</h3>
            <p className="text-xs text-muted-foreground">
              These settings only affect this browser.
            </p>
          </div>

          <div className="space-y-4">
            {/* Browser Push Notifications */}
            <div className="flex items-center justify-between gap-3">
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
            <div className="flex items-center justify-between gap-3">
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
            <div className="flex items-center justify-between gap-3">
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
            <div className="flex items-center justify-between gap-3">
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
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-settings"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-settings"
          >
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
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
