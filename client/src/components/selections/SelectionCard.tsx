// Gallery card for the Selections Cards view. When no option is chosen the
// image area shows a mosaic of up to three option photos plus a count badge
// (a "still browsing" signal); once chosen, the chosen option's photo IS the
// card. Card click opens the full selection; quick view is the corner button.

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Edit3, Copy, Trash2, Eye, Image as ImageIcon, Lock, PanelRight } from "lucide-react";
import type { SelectionWithOptions, OptionAttachment } from "@shared/schema";
import {
  getDerivedStatus,
  getSelectedOption,
  getDeadlineMeta,
  getCategoryColour,
  firstImage,
  isRestricted,
  BudgetCell,
  RestrictedPill,
  SelectionStatusPill,
} from "./selectionHelpers";

export function SelectionCard({
  selection,
  onOpenDrawer,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  selection: SelectionWithOptions;
  onOpenDrawer: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  projectId: string;
}) {
  const derived = getDerivedStatus(selection);
  const deadlineMeta = getDeadlineMeta(selection.deadline, derived);
  const chosen = getSelectedOption(selection);
  const optionCount = selection.options?.length ?? 0;
  // See SelectionRow: a withheld stub carries no options, so the whole image
  // area would otherwise be the generic "no photo" placeholder.
  const restricted = isRestricted(selection);
  const images = (chosen
    ? [firstImage(chosen)]
    : (selection.options ?? []).map((o) => firstImage(o))
  ).filter(Boolean).slice(0, 3) as OptionAttachment[];

  return (
    <div
      className="group bg-card rounded-xl border border-border/80 overflow-hidden cursor-pointer hover-elevate transition-shadow"
      onClick={() => onEdit(selection.id)}
      data-testid={`card-selection-${selection.id}`}
    >
      {/* Image area */}
      <div className="relative h-36 bg-muted/60 overflow-hidden">
        {restricted ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-muted/70">
            <Lock className="w-6 h-6 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/70">Photos hidden</span>
          </div>
        ) : images.length === 0 ? (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: `${getCategoryColour(selection.category)}1f` }}
          >
            <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
          </div>
        ) : images.length === 1 ? (
          <img
            src={images[0].filePath}
            alt=""
            className="w-full h-full object-cover"
            style={{ objectPosition: `${images[0].thumbnailX ?? 50}% ${images[0].thumbnailY ?? 50}%` }}
            loading="lazy"
          />
        ) : (
          <div className="grid grid-cols-3 gap-px h-full">
            {images.map((att, i) => (
              <img
                key={att.id}
                src={att.filePath}
                alt=""
                className={cn("w-full h-full object-cover", i === 0 && images.length === 2 && "col-span-2")}
                style={{ objectPosition: `${att.thumbnailX ?? 50}% ${att.thumbnailY ?? 50}%` }}
                loading="lazy"
              />
            ))}
          </div>
        )}
        {/* Positioned wrapper, not `absolute` on the Badge itself: Badge's base
            class carries `hover-elevate`, and index.css sets `position:
            relative` on that in a layer that beats Tailwind's `.absolute`. Put
            the class on the Badge and the pill silently drops into normal flow
            below the image, where `overflow-hidden` clips it away entirely. */}
        <div className="absolute top-2 left-2 z-[1]">
          {restricted ? (
            <RestrictedPill className="backdrop-blur-sm" />
          ) : (
            <SelectionStatusPill derived={derived} className="backdrop-blur-sm" />
          )}
        </div>
        {optionCount > 0 && !chosen && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 text-white text-[9.5px] px-2 py-0.5">
            {optionCount} option{optionCount === 1 ? "" : "s"}
          </span>
        )}
        {/* Hover actions */}
        <div
          className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="h-6 w-6 rounded-md bg-black/45 text-white flex items-center justify-center"
            onClick={() => onOpenDrawer(selection.id)}
            aria-label="Quick view"
          >
            <PanelRight className="h-3 w-3" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-6 rounded-md bg-black/45 text-white flex items-center justify-center">
                <MoreVertical className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpenDrawer(selection.id)}>
                <Eye className="w-4 h-4 mr-2" /> Quick View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(selection.id)}>
                <Edit3 className="w-4 h-4 mr-2" /> Open
              </DropdownMenuItem>
              {!restricted && (
                <>
                  <DropdownMenuItem onClick={() => onDuplicate(selection.id)}>
                    <Copy className="w-4 h-4 mr-2" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(selection.id)} className="text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="text-[12.5px] font-medium leading-snug truncate">{selection.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
          {selection.category && (
            <span className="inline-flex items-center gap-1">
              <span className="rounded-full" style={{ width: 5, height: 5, backgroundColor: getCategoryColour(selection.category) }} />
              {selection.category}
            </span>
          )}
          {selection.category && selection.room && <span className="text-muted-foreground/40">·</span>}
          {selection.room && <span>{selection.room}</span>}
          <span className={cn("ml-auto shrink-0", deadlineMeta.className)}>{deadlineMeta.text}</span>
        </div>
        <div className="mt-2">
          <BudgetCell selection={selection} align="left" bar />
        </div>
      </div>
    </div>
  );
}
