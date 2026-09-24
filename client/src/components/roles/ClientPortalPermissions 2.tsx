import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { Permission } from "@shared/schema";
import { CLIENT_PORTAL_SECTIONS, type PortalToggle } from "@shared/clientPortalPermissions";

interface Props {
  permissions: Permission[];
  /** Actions currently granted on a permission id. */
  getActions: (permissionId: string) => string[];
  /** Replace the actions granted on a permission id. */
  setActions: (permissionId: string, actions: string[]) => void;
}

/**
 * The Roles & Permissions panel for a CLIENT role.
 *
 * The team matrix (View / Add / Edit / Delete columns per key) describes
 * builder work and reads wrongly for a client, so a client role gets one card
 * per portal section with plain-language switches instead. It edits the same
 * permission matrix the page saves — only the portal.* keys.
 *
 * A section's first switch is "can see it". Turning it off clears every other
 * switch in the section, and the others are disabled while it is off, so a
 * role can never hold "sign variations" without "see variations".
 */
export function ClientPortalPermissions({ permissions, getActions, setActions }: Props) {
  const idByKey = new Map(permissions.map((p) => [p.key, p.id]));

  const isOn = (toggle: PortalToggle) => {
    const id = idByKey.get(toggle.key);
    return !!id && getActions(id).includes(toggle.action);
  };

  const setToggle = (toggle: PortalToggle, on: boolean) => {
    const id = idByKey.get(toggle.key);
    if (!id) return;
    const current = getActions(id);
    const next = on
      ? Array.from(new Set([...current, toggle.action]))
      : current.filter((a) => a !== toggle.action);
    setActions(id, next);
  };

  const setSectionVisible = (sectionId: string, on: boolean) => {
    const section = CLIENT_PORTAL_SECTIONS.find((s) => s.id === sectionId);
    if (!section) return;
    if (on) {
      setToggle(section.view, true);
      return;
    }
    // Clear every ability in the section, including extra actions that share
    // the view key (e.g. portal.selections:edit alongside :view).
    const keys = new Set([section.view.key, ...section.extras.map((t) => t.key)]);
    for (const key of Array.from(keys)) {
      const id = idByKey.get(key);
      if (id) setActions(id, []);
    }
  };

  const missing = CLIENT_PORTAL_SECTIONS.some((s) => !idByKey.has(s.view.key));

  return (
    <div className="space-y-4" data-testid="client-portal-permissions">
      <div>
        <h3 className="text-sm font-medium">What clients with this role can see and do</h3>
        <p className="text-sm text-muted-foreground">
          Clients only ever see projects they've been given access to. Everything here is read only
          unless it says otherwise.
        </p>
      </div>

      {missing && (
        <p className="text-sm text-muted-foreground" data-testid="text-portal-permissions-missing">
          Client permissions are still being set up. Refresh in a moment.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {CLIENT_PORTAL_SECTIONS.map((section) => {
          const visible = isOn(section.view);
          return (
            <Card key={section.id} data-testid={`card-portal-${section.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{section.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {section.view.label}
                      {section.view.hint ? ` · ${section.view.hint}` : ""}
                    </div>
                  </div>
                  <Switch
                    checked={visible}
                    onCheckedChange={(on) => setSectionVisible(section.id, on)}
                    disabled={!idByKey.has(section.view.key)}
                    data-testid={`switch-portal-${section.id}`}
                    aria-label={`${section.title}: ${section.view.label}`}
                  />
                </div>

                {section.extras.length > 0 && (
                  <div className={`space-y-2 border-t pt-3 ${visible ? "" : "opacity-50"}`}>
                    {section.extras.map((toggle) => {
                      const testId = `${toggle.key}-${toggle.action}`.replace(/\./g, "-");
                      return (
                        <div key={testId} className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm">{toggle.label}</div>
                            {toggle.hint && (
                              <div className="text-xs text-muted-foreground">{toggle.hint}</div>
                            )}
                          </div>
                          <Switch
                            checked={visible && isOn(toggle)}
                            onCheckedChange={(on) => setToggle(toggle, on)}
                            disabled={!visible || !idByKey.has(toggle.key)}
                            data-testid={`switch-${testId}`}
                            aria-label={`${section.title}: ${toggle.label}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
