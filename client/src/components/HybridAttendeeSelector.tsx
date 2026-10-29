import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, UserPlus, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { personName } from "@/lib/people";
import {
  attendeeName,
  attendeeKey,
  attendeeUserId,
  sameAttendee,
  type MinuteAttendee,
} from "@shared/minuteAttendees";

/**
 * Who was at the meeting.
 *
 * Three groups, in the order a builder thinks of them: the team, then the
 * client whose job this is, then the trades and suppliers. Anyone else is
 * typed in — the plasterer's offsider is a real attendee with no record here,
 * and refusing to write that down only moves it into the notes.
 *
 * Picking a person records their id, not just their name, which is the whole
 * point: a userId is the same person the action items out of that meeting get
 * assigned to, and a renamed contact's minutes follow the rename.
 *
 * ## Why this was rebuilt
 *
 * It offered contacts only, and never actually offered one. The query key was
 * `["/api/contacts", { projectId }]`, and the default query function builds the
 * URL by `queryKey.join("/")` — so every request went to
 * `/api/contacts/[object Object]`, 404ed, and left the list empty. The
 * suggestions never appeared, so every attendee ever recorded is a plain
 * string. It also only looked anything up once you had typed, so there was
 * nothing to browse, and it left out the team entirely: the people actually in
 * the room had no shape to be stored as.
 */

export type Attendee = MinuteAttendee;

interface HybridAttendeeSelectorProps {
  value: Attendee[];
  onChange: (attendees: Attendee[]) => void;
  /** Scopes the Client group. Without it no client is offered — see below. */
  projectId?: string;
}

type Candidate = {
  key: string;
  attendee: Attendee;
  name: string;
  /** The line under the name: a role, a company, whatever identifies them. */
  detail?: string;
  tint: string;
};

type Group = { label: string; items: Candidate[] };

/** Badge tints, borrowed from the Contacts page so a trade reads the same
 *  colour wherever you meet it. Team green, client coral, trade amber,
 *  supplier teal; a typed name stays neutral because it refers to nothing. */
const TINTS = {
  team: "bg-status-success-bg text-status-success",
  client: "bg-coral-light text-coral",
  trade: "bg-amber-light text-amber",
  supplier: "bg-teal/15 text-teal",
  typed: "bg-muted text-muted-foreground",
};

type ContactRow = {
  id: string;
  name: string;
  company?: string | null;
  position?: string | null;
  contactType?: string | null;
  isArchived?: boolean | null;
};

export function HybridAttendeeSelector({ value, onChange, projectId }: HybridAttendeeSelectorProps) {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const meId = (user as any)?.id ?? null;

  // The team, through the endpoint that knows who may be offered: staff, plus
  // THIS project's client login when a project is named.
  //
  // Not gated on the list being open: the badges below are tinted by who the
  // person IS, so a minute's existing attendees would all read as team until
  // you happened to open the picker. Both reads are cached for the session
  // (staleTime Infinity) and /api/projects is already on this page.
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users/assignable", projectId ?? "none"],
    queryFn: async () => {
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      const res = await fetch(`/api/users/assignable${qs}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: contacts = [] } = useQuery<ContactRow[]>({
    // One plain string. An object in the query key is joined into the URL, which
    // is how this fetched `/api/contacts/[object Object]` for as long as it
    // existed. The project scoping below is done here, not by the server.
    queryKey: ["/api/contacts"],
  });

  const { data: projects = [] } = useQuery<Array<{ id: string; clientId?: string | null }>>({
    queryKey: ["/api/projects"],
    enabled: !!projectId,
  });

  const groups = useMemo<Group[]>(() => {
    const live = (contacts ?? []).filter((c) => !c.isArchived);

    // Clients only on their own project — the same rule the assignee pickers
    // follow. With no project named there is nothing to scope a client to, so
    // none is offered rather than offering all of them.
    const clientContactId = projectId
      ? (projects.find((p) => p.id === projectId)?.clientId ?? null)
      : null;

    const team: Candidate[] = [];
    const seenNames = new Set<string>();

    // Logins first: these are the people action items can be assigned to.
    for (const u of users) {
      if (u?.userCategory === "client") continue; // listed under Client below
      if (u?.isActive === false) continue;
      const name = personName(u);
      if (!name) continue;
      seenNames.add(name.toLowerCase());
      team.push({
        key: `user:${u.id}`,
        attendee: { name, userId: u.id },
        name: u.id === meId ? `${name} (you)` : name,
        detail: u.roleName || undefined,
        tint: TINTS.team,
      });
    }

    // Team members recorded only as contacts — a labourer with no login still
    // attends meetings. Matched out by name because there is no link from an
    // assignable user back to its contact row; a duplicate is worse than a
    // near-certain match being folded into one entry.
    for (const c of live) {
      if (c.contactType !== "team") continue;
      if (seenNames.has((c.name || "").toLowerCase())) continue;
      team.push({
        key: `contact:${c.id}`,
        attendee: { name: c.name, contactId: c.id },
        name: c.name,
        detail: c.position || c.company || undefined,
        tint: TINTS.team,
      });
    }

    const clients: Candidate[] = [];
    if (clientContactId) {
      const contact = live.find((c) => c.id === clientContactId);
      if (contact) {
        clients.push({
          key: `contact:${contact.id}`,
          attendee: { name: contact.name, contactId: contact.id },
          name: contact.name,
          detail: contact.company || "Client",
          tint: TINTS.client,
        });
      }
      // A client with a portal login: prefer the login, which is the record
      // that gets notified, and only when the contact row is not already here.
      for (const u of users) {
        if (u?.userCategory !== "client") continue;
        const name = personName(u);
        if (!name || clients.some((c) => c.name.toLowerCase() === name.toLowerCase())) continue;
        clients.push({
          key: `user:${u.id}`,
          attendee: { name, userId: u.id },
          name,
          detail: "Client",
          tint: TINTS.client,
        });
      }
    }

    const trades: Candidate[] = live
      .filter((c) => c.contactType === "trade" || c.contactType === "supplier")
      .map((c) => ({
        key: `contact:${c.id}`,
        attendee: { name: c.name, contactId: c.id },
        name: c.name,
        detail: c.company || (c.contactType === "supplier" ? "Supplier" : "Trade"),
        tint: c.contactType === "supplier" ? TINTS.supplier : TINTS.trade,
      }));

    return [
      { label: "Team", items: team },
      { label: "Client", items: clients },
      { label: "Trades and suppliers", items: trades },
    ];
  }, [users, contacts, projects, projectId, meId]);

  /** What is left after the search box and after who is already in the list. */
  const visibleGroups = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    const chosen = new Set(value.map(attendeeKey));
    return groups
      .map((g) => ({
        label: g.label,
        items: g.items.filter(
          (c) =>
            !chosen.has(attendeeKey(c.attendee)) &&
            !value.some((v) => sameAttendee(v, c.attendee)) &&
            (!q || c.name.toLowerCase().includes(q) || (c.detail || "").toLowerCase().includes(q)),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, inputValue, value]);

  const addAttendee = (attendee: Attendee) => {
    if (!attendeeName(attendee).trim()) return;
    if (!value.some((existing) => sameAttendee(existing, attendee))) {
      onChange([...value, attendee]);
    }
    setInputValue("");
    setOpen(false);
  };

  const removeAttendee = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      // Enter takes the single match if the search has narrowed to one, so
      // typing a known name does not quietly record a loose string beside it.
      const matches = visibleGroups.flatMap((g) => g.items);
      addAttendee(matches.length === 1 ? matches[0].attendee : inputValue.trim());
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  /** The tint for someone already in the list, so a typed name is visibly not
   *  a person on file. Looked up by key, falling back to neutral. */
  const tintFor = (attendee: Attendee): string => {
    const key = attendeeKey(attendee);
    for (const g of groups) {
      const hit = g.items.find((c) => c.key === key);
      if (hit) return hit.tint;
    }
    // Not in the lists: an archived contact, or one deleted since. Fall back
    // to the shape — a userId is a team member, anything else we cannot claim.
    if (attendeeUserId(attendee)) return TINTS.team;
    return TINTS.typed;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-2">
      <div className="relative" ref={wrapRef}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              data-testid="input-attendees"
              placeholder="Search people, or type a name…"
              className="pr-7"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setOpen(true);
              }}
              // Opens on focus, not on the first keystroke: the list is there
              // to be browsed, and you cannot search for a name you half
              // remember if nothing appears until you spell it.
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
            />
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          {inputValue.trim() && (
            <Button
              data-testid="button-add-custom-attendee"
              type="button"
              size="icon"
              variant="outline"
              title="Add as a typed name"
              onClick={() => addAttendee(inputValue.trim())}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* max-h-56, not taller: inside the New Minutes dialog this list is
            clipped by the dialog's own scroll container, so a box that wants
            18rem hangs off the bottom edge with no way to reach what is below
            it. */}
        {open && (
          <Card className="absolute z-10 w-full mt-1 max-h-56 overflow-auto">
            <div className="p-1">
              {visibleGroups.map((group) => (
                <div key={group.label}>
                  <div className="px-2 pt-1.5 pb-0.5 text-xs font-medium text-muted-foreground">
                    {group.label}
                  </div>
                  {group.items.map((candidate) => (
                    <button
                      key={candidate.key}
                      data-testid={`button-select-attendee-${candidate.key}`}
                      type="button"
                      className="w-full text-left px-2 py-1.5 hover-elevate active-elevate-2 rounded-md"
                      onClick={() => addAttendee(candidate.attendee)}
                    >
                      <div className="text-sm truncate">{candidate.name}</div>
                      {candidate.detail && (
                        <div className="text-xs text-muted-foreground truncate">{candidate.detail}</div>
                      )}
                    </button>
                  ))}
                </div>
              ))}
              {visibleGroups.length === 0 && (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  {inputValue.trim()
                    ? "Nobody on file by that name. Press Enter to add it anyway."
                    : "No people to choose from yet."}
                </p>
              )}
            </div>
          </Card>
        )}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((attendee, index) => (
            <Badge
              key={`${attendeeKey(attendee)}-${index}`}
              data-testid={`badge-attendee-${index}`}
              variant="secondary"
              className={`gap-1 ${tintFor(attendee)}`}
            >
              {attendeeName(attendee)}
              <button
                data-testid={`button-remove-attendee-${index}`}
                type="button"
                aria-label={`Remove ${attendeeName(attendee)}`}
                onClick={() => removeAttendee(index)}
                className="hover-elevate active-elevate-2 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
