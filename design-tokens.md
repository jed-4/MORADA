# BuildPro Schedule Design Tokens

This document defines the official design system for the Schedule interface, based on the Gantt header as the standard.

## Header Structure

### Total Header Height
**168px total** (108px unified + 60px view-specific)

### Unified 3-Row Header (108px)
Shared across all views (Gantt, Calendar, List)

#### Row 1 - Project Controls (36px)
```tsx
className="h-9 bg-white flex items-center justify-between px-2 gap-4 flex-shrink-0"
```
- **Height:** `h-9` (36px)
- **Padding:** `px-2` (8px horizontal)
- **Background:** `bg-white`
- **Alignment:** `flex items-center justify-between`
- **Spacing:** `gap-4` (16px) between major sections
- **Border:** No border
- **Flex:** `flex-shrink-0` (CRITICAL - prevents compression across different view containers)

#### Row 2 - Views & Timeline Scale (36px)
```tsx
className="h-9 bg-white flex items-center justify-between px-2 border-b border-border flex-shrink-0"
```
- **Height:** `h-9` (36px)
- **Padding:** `px-2` (8px horizontal)
- **Background:** `bg-white`
- **Alignment:** `flex items-center justify-between`
- **Border:** `border-b border-border` (1px bottom)
- **Flex:** `flex-shrink-0` (CRITICAL - prevents compression across different view containers)

#### Row 3 - Search, Filters & Columns (36px)
```tsx
className="h-9 bg-white flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0"
```
- **Height:** `h-9` (36px)
- **Padding:** `px-2` (8px horizontal)
- **Background:** `bg-white`
- **Alignment:** `flex items-center justify-between`
- **Spacing:** `gap-1.5` (6px) for action grouping
- **Border:** `border-b border-border` (1px bottom)
- **Flex:** `flex-shrink-0` (CRITICAL - prevents compression across different view containers)

### View-Specific Header (60px)
Below the unified 3-row header, each view has its own header:

```tsx
className="h-[60px] ... border-b-2 border-border"
```
- **Height:** `h-[60px]` (60px)
- **Border:** `border-b-2 border-border` (2px bottom) - **Key visual distinction**

## Interactive Elements (Buttons & Chips)

### Standard Button/Chip
```tsx
className="h-6 w-auto px-2 text-xs border rounded-md"
```
- **Height:** `h-6` (24px)
- **Padding:** `px-2` (8px horizontal)
- **Typography:** `text-xs` (12px)
- **Border:** `border` (1px) `rounded-md`

### Active State (Purple)
```tsx
className="bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90"
```
- **Background:** `bg-[#bba7db]` (Lilac purple)
- **Text:** `text-white`
- **Border:** `border-[#bba7db]/20` (20% opacity)
- **Hover:** `hover:bg-[#bba7db]/90` (90% opacity)

### Inactive State
```tsx
className="hover-elevate active-elevate-2"
```
- Uses global elevation utilities from `index.css`
- No explicit background color (inherits from parent)

### Icon-Only Buttons
```tsx
className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
```
- **Width:** `w-6` (24px) to match height (square)
- **Layout:** `flex items-center justify-center`

## Form Inputs

### Search Input
```tsx
className="pl-7 pr-2 py-0 h-6 text-xs border"
```
- **Height:** `h-6` (24px)
- **Padding:** `py-0` (removes default vertical padding), `pl-7` (icon space), `pr-2`
- **Typography:** `text-xs` (12px)

### Select Dropdowns
```tsx
className="h-6 w-auto px-2 py-0 text-xs border [&>svg]:hidden"
```
- **Height:** `h-6` (24px)
- **Padding:** `px-2`, `py-0` (removes default vertical padding)
- **Typography:** `text-xs` (12px)
- **Icon:** `[&>svg]:hidden` (hides dropdown chevron)

## Spacing System

### Gap Hierarchy
Use these standardized gaps throughout the schedule interface:

```
gap-0.5  → 2px   (tight grouping - view buttons, zoom buttons)
gap-1    → 4px   (minimal spacing)
gap-1.5  → 6px   (action buttons, filter chips)
gap-3    → 12px  (related sections)
gap-4    → 16px  (major divisions)
```

### Example Usage
```tsx
// View buttons tightly grouped
<div className="flex items-center gap-0.5">
  <button>Gantt</button>
  <button>Calendar</button>
  <button>List</button>
</div>

// Action buttons with standard spacing
<div className="flex items-center gap-1.5">
  <button>Add Item</button>
  <button>Export</button>
  <button>Settings</button>
</div>

// Major sections with clear separation
<div className="flex items-center gap-4">
  <h2>Project Name</h2>
  <div>Controls...</div>
</div>
```

## Border System

### Row Borders
```
Row 1: No border
Row 2: border-b border-border (1px)
Row 3: border-b border-border (1px)
View-Specific Header: border-b-2 border-border (2px) ← Visual distinction
```

The 2px border on the view-specific header creates visual hierarchy and clearly separates the unified controls from the view content.

## Color System

### Active State Purple
- **Primary:** `#bba7db` (Lilac purple)
- **With opacity:** `#bba7db/20`, `#bba7db/90`
- **Use cases:** Active view buttons, primary action buttons, selected states

### Background
- **Row background:** `bg-white`
- **App background:** `bg-background`

### Borders
- **Standard:** `border-border` (from theme)

## Typography

### Standard Text Sizes
```
text-xs  → 12px  (buttons, chips, filters)
text-sm  → 14px  (project name, labels)
```

### Font Weights
```
font-semibold  → 600  (headings, project name)
font-medium    → 500  (labels)
(default)      → 400  (body text)
```

## Application Rules

### Consistency Principles
1. **All h-6 elements** must have `py-0` to ensure consistent vertical centering
2. **All rows** must be `h-9` with `px-2` horizontal padding and `flex-shrink-0`
3. **All chips/buttons** must be `h-6` with `px-2` horizontal padding
4. **Spacing** must follow the gap hierarchy (0.5, 1, 1.5, 3, 4)
5. **Active states** must use `#bba7db` purple
6. **Inactive states** must use elevation utilities
7. **CRITICAL:** All header rows MUST include `flex-shrink-0` to prevent flexbox compression

### Critical Implementation Notes
- **Never** mix `py-*` values on h-6 elements (always use `py-0`)
- **Never** add custom heights to elements within the h-9 rows
- **Always** use the standardized gap values from the hierarchy
- **Always** use `border-b-2` on view-specific headers (not `border-b`)
- **ALWAYS** include `flex-shrink-0` on all header rows to prevent compression
- **Never** add top padding to view content wrappers (use `px-*` and `pb-*` only)

## Examples

### Complete Row Example
```tsx
{/* Row 2 - Views & Timeline Scale */}
<div className="h-9 bg-white flex items-center justify-between px-2 border-b border-border">
  {/* Left: View Buttons */}
  <div className="flex items-center gap-0.5">
    <button
      className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2"
    >
      <GanttChart className="w-3 h-3 inline mr-0.5" />
      Gantt
    </button>
    <button
      className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
    >
      <CalendarIcon className="w-3 h-3 inline mr-0.5" />
      Calendar
    </button>
  </div>
</div>
```

### Complete Filter Example
```tsx
<Select value={filters.status} onValueChange={...}>
  <SelectTrigger className="h-6 w-auto px-2 py-0 text-xs border [&>svg]:hidden">
    <span>Status</span>
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Statuses</SelectItem>
    <SelectItem value="in_progress">In Progress</SelectItem>
  </SelectContent>
</Select>
```

---

**Last Updated:** November 15, 2025
**Standard Source:** Gantt header implementation in `client/src/pages/Schedule.tsx`
