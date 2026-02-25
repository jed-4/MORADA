import { z } from "zod";

// Cost Code type (minimal version from schema for import matching)
export type CostCode = {
  id: string;
  code: string;
  title: string;
};

// Generic fuzzy match result for any field
export type FuzzyMatch<T = any> = {
  rawValue: string;
  matched?: T;
  matchedValue?: string; // The normalized/matched value to use
  matchType?: "exact" | "normalized" | "partial" | "contains";
  confidence: "high" | "medium" | "low";
};

// Cost code match result (specialized)
export type CostCodeMatch = {
  rawValue: string;
  matchedCode?: CostCode;
  matchType?: "code" | "title" | "exact";
  confidence?: "high" | "low";
};

// Common unit type variations for fuzzy matching
const UNIT_TYPE_ALIASES: Record<string, string[]> = {
  "each": ["ea", "ea.", "e", "unit", "units", "pc", "pcs", "piece", "pieces", "item", "items"],
  "m": ["m", "metre", "metres", "meter", "meters", "lm", "lin m", "linear metre", "linear meter"],
  "m2": ["m2", "sqm", "sq m", "sq.m", "square metre", "square meter", "square metres", "square meters"],
  "m3": ["m3", "cbm", "cu m", "cu.m", "cubic metre", "cubic meter", "cubic metres", "cubic meters"],
  "kg": ["kg", "kgs", "kilogram", "kilograms", "kilo", "kilos"],
  "tonne": ["tonne", "tonnes", "ton", "tons", "t"],
  "l": ["l", "litre", "litres", "liter", "liters"],
  "hour": ["hr", "hrs", "hour", "hours", "h"],
  "day": ["day", "days", "d"],
  "week": ["week", "weeks", "wk", "wks"],
  "lot": ["lot", "lots", "lump", "lump sum", "ls", "lumpsum"],
  "pack": ["pack", "packs", "pk", "pkt", "packet", "packets"],
  "roll": ["roll", "rolls", "rl"],
  "sheet": ["sheet", "sheets", "sht"],
  "bag": ["bag", "bags"],
  "box": ["box", "boxes", "bx"],
  "length": ["length", "lengths", "len"],
  "set": ["set", "sets"],
  "pair": ["pair", "pairs", "pr"],
};

// Common allowance type variations
const ALLOWANCE_ALIASES: Record<string, string[]> = {
  "None": ["none", "n/a", "na", "-", ""],
  "Prime Cost": ["prime cost", "pc", "prime", "p.c.", "prime-cost", "primecost"],
  "Provisional Sum": ["provisional sum", "ps", "provisional", "p.s.", "prov sum", "prov. sum", "provsum", "provisional-sum"],
};

// Common type (cost type) variations
const TYPE_ALIASES: Record<string, string[]> = {
  "Material": ["material", "materials", "mat", "mats", "m", "supply", "supplies"],
  "Labour": ["labour", "labor", "lab", "l", "work", "install", "installation"],
  "Subcontractor": ["subcontractor", "subcontractors", "sub", "subs", "subbie", "subbies", "sc", "subcon", "sub-contractor", "sub-contractors", "sub contractor", "sub contractors"],
  "Fee": ["fee", "fees", "margin", "overhead", "overheads", "o/h", "oh"],
};

// Generic fuzzy match function for string options
export function fuzzyMatchString(
  rawValue: string | undefined | null,
  validOptions: string[],
  aliases?: Record<string, string[]>
): FuzzyMatch<string> | undefined {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return undefined;
  }
  
  const normalized = String(rawValue).trim().toLowerCase();
  
  // Try exact match (case-insensitive)
  const exactMatch = validOptions.find(opt => opt.toLowerCase() === normalized);
  if (exactMatch) {
    return {
      rawValue: String(rawValue).trim(),
      matched: exactMatch,
      matchedValue: exactMatch,
      matchType: "exact",
      confidence: "high",
    };
  }
  
  // Try alias matching if provided
  if (aliases) {
    for (const [canonical, aliasValues] of Object.entries(aliases)) {
      if (aliasValues.some(alias => alias.toLowerCase() === normalized)) {
        // Verify the canonical value is in our valid options
        const validCanonical = validOptions.find(opt => opt.toLowerCase() === canonical.toLowerCase());
        if (validCanonical) {
          return {
            rawValue: String(rawValue).trim(),
            matched: validCanonical,
            matchedValue: validCanonical,
            matchType: "normalized",
            confidence: "high",
          };
        }
      }
    }
  }
  
  // Try partial/contains match
  const containsMatch = validOptions.find(opt => 
    opt.toLowerCase().includes(normalized) || normalized.includes(opt.toLowerCase())
  );
  if (containsMatch) {
    return {
      rawValue: String(rawValue).trim(),
      matched: containsMatch,
      matchedValue: containsMatch,
      matchType: "contains",
      confidence: "medium",
    };
  }
  
  // No match - return raw value with low confidence
  return {
    rawValue: String(rawValue).trim(),
    confidence: "low",
  };
}

// Match unit types with common aliases
export function matchUnitType(rawValue: string | undefined): FuzzyMatch<string> | undefined {
  const validUnits = Object.keys(UNIT_TYPE_ALIASES);
  return fuzzyMatchString(rawValue, validUnits, UNIT_TYPE_ALIASES);
}

// Match allowance types with common aliases
export function matchAllowance(rawValue: string | undefined): FuzzyMatch<string> | undefined {
  const validAllowances = ["None", "Prime Cost", "Provisional Sum"];
  return fuzzyMatchString(rawValue, validAllowances, ALLOWANCE_ALIASES);
}

// Match cost types with common aliases
export function matchType(rawValue: string | undefined): FuzzyMatch<string> | undefined {
  const validTypes = ["Material", "Labour", "Subcontractor", "Fee"];
  return fuzzyMatchString(rawValue, validTypes, TYPE_ALIASES);
}

// Match status against field options
export function matchStatus(
  rawValue: string | undefined, 
  statusOptions: { id: string; name: string; key?: string }[]
): FuzzyMatch<{ id: string; name: string }> | undefined {
  if (!rawValue || String(rawValue).trim() === "") {
    return undefined;
  }
  
  const normalized = String(rawValue).trim().toLowerCase();
  
  // Try exact name match
  const exactMatch = statusOptions.find(opt => opt.name.toLowerCase() === normalized);
  if (exactMatch) {
    return {
      rawValue: String(rawValue).trim(),
      matched: { id: exactMatch.id, name: exactMatch.name },
      matchedValue: exactMatch.name,
      matchType: "exact",
      confidence: "high",
    };
  }
  
  // Try key match (e.g., "incomplete" matches key "incomplete")
  const keyMatch = statusOptions.find(opt => opt.key?.toLowerCase() === normalized);
  if (keyMatch) {
    return {
      rawValue: String(rawValue).trim(),
      matched: { id: keyMatch.id, name: keyMatch.name },
      matchedValue: keyMatch.name,
      matchType: "normalized",
      confidence: "high",
    };
  }
  
  // Try partial/contains match
  const containsMatch = statusOptions.find(opt => 
    opt.name.toLowerCase().includes(normalized) || normalized.includes(opt.name.toLowerCase())
  );
  if (containsMatch) {
    return {
      rawValue: String(rawValue).trim(),
      matched: { id: containsMatch.id, name: containsMatch.name },
      matchedValue: containsMatch.name,
      matchType: "contains",
      confidence: "medium",
    };
  }
  
  // No match
  return {
    rawValue: String(rawValue).trim(),
    confidence: "low",
  };
}

// Match group names against existing groups
export function matchGroup(
  rawValue: string | undefined,
  existingGroups: { id: string; name: string }[]
): FuzzyMatch<{ id: string; name: string }> | undefined {
  if (!rawValue || String(rawValue).trim() === "") {
    return undefined;
  }
  
  const normalized = String(rawValue).trim().toLowerCase();
  
  // Try exact name match
  const exactMatch = existingGroups.find(g => g.name.toLowerCase() === normalized);
  if (exactMatch) {
    return {
      rawValue: String(rawValue).trim(),
      matched: { id: exactMatch.id, name: exactMatch.name },
      matchedValue: exactMatch.name,
      matchType: "exact",
      confidence: "high",
    };
  }
  
  // Try partial/contains match
  const containsMatch = existingGroups.find(g => 
    g.name.toLowerCase().includes(normalized) || normalized.includes(g.name.toLowerCase())
  );
  if (containsMatch) {
    return {
      rawValue: String(rawValue).trim(),
      matched: { id: containsMatch.id, name: containsMatch.name },
      matchedValue: containsMatch.name,
      matchType: "contains",
      confidence: "medium",
    };
  }
  
  // No match - will create new group
  return {
    rawValue: String(rawValue).trim(),
    confidence: "low",
  };
}

// Estimate Item Import Schema
// This schema is used for validating imported data from CSV/Excel files
export const importEstimateItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["Material", "Labour", "Subcontractor", "Fee"]).default("Material"),
  description: z.string().optional(),
  quantity: z.number().default(1),
  unitType: z.string().default("each"),
  unitCostExTax: z.number().default(0),
  markupPercent: z.number().min(0).default(0),
  allowance: z.enum(["None", "Prime Cost", "Provisional Sum"]).default("None"),
  notes: z.string().optional(),
  costCode: z.string().optional(),
  group: z.string().optional(), // Group name to match against existing groups
  status: z.string().default("incomplete"),
  proposalVisible: z.boolean().default(true),
  shownAs: z.string().optional(),
});

export type ImportEstimateItem = z.infer<typeof importEstimateItemSchema>;

// Result of parsing a single row
export type ImportRowResult = {
  rowIndex: number;
  data?: ImportEstimateItem;
  errors?: string[];
  costCodeMatch?: CostCodeMatch;
  typeMatch?: FuzzyMatch<string>;
  unitTypeMatch?: FuzzyMatch<string>;
  allowanceMatch?: FuzzyMatch<string>;
  groupMatch?: FuzzyMatch<{ id: string; name: string }>;
  statusMatch?: FuzzyMatch<{ id: string; name: string }>;
};

// Result of parsing an entire file
export type ImportFileResult = {
  success: boolean;
  rows: ImportRowResult[];
  validCount: number;
  errorCount: number;
  fileErrors?: string[];
};

// Column mapping configuration
export type ColumnMapping = {
  [key in keyof ImportEstimateItem]?: string | number; // Column name or index
};

// Default column mappings (case-insensitive matching)
export const defaultColumnMappings: Record<string, keyof ImportEstimateItem> = {
  // Name variations
  "name": "name",
  "item": "name",
  "item name": "name",
  "description": "description",
  "desc": "description",
  
  // Type variations
  "type": "type",
  "item type": "type",
  "cost type": "type",
  
  // Quantity variations
  "quantity": "quantity",
  "qty": "quantity",
  
  // Unit variations
  "unit": "unitType",
  "unit type": "unitType",
  "units": "unitType",
  "uom": "unitType",
  
  // Price variations
  "price": "unitCostExTax",
  "price ex tax": "unitCostExTax",
  "price ex gst": "unitCostExTax",
  "unit price": "unitCostExTax",
  "rate": "unitCostExTax",
  "cost": "unitCostExTax",
  
  // Allowance variations
  "allowance": "allowance",
  "allowance type": "allowance",
  
  // Markup variations
  "markup": "markupPercent",
  "markup %": "markupPercent",
  "markup percent": "markupPercent",
  "margin": "markupPercent",
  "margin %": "markupPercent",
  
  // Notes variations
  "notes": "notes",
  "note": "notes",
  "comments": "notes",
  "comment": "notes",
  
  // Cost code variations
  "cost code": "costCode",
  "costcode": "costCode",
  "code": "costCode",
  
  // Group variations
  "group": "group",
  "parent": "group",
  "parent name": "group",
  "parent group": "group",
  "category": "group",
  
  // Status variations
  "status": "status",
  
  // Proposal visibility variations
  "proposal visible": "proposalVisible",
  "proposal": "proposalVisible",
  "visible in proposal": "proposalVisible",
  "show in proposal": "proposalVisible",
  
  // Shown as variations
  "shown as": "shownAs",
  "show as": "shownAs",
  "display as": "shownAs",
};

// Utility: Convert dollars to cents
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

// Utility: Convert cents to dollars
export function centsToDollars(cents: number): number {
  return cents / 100;
}

// Utility: Parse currency string to dollars (not cents)
export function parseCurrency(value: string | number): number {
  if (typeof value === "number") {
    return value;
  }
  
  // Remove currency symbols and whitespace
  const cleaned = value.replace(/[$,\s]/g, "");
  const parsed = parseFloat(cleaned);
  
  if (isNaN(parsed)) {
    return 0;
  }
  
  return parsed; // Return dollars, not cents
}

// Utility: Match imported cost code value to company cost codes
export function matchCostCode(rawValue: string | undefined, costCodes: CostCode[]): CostCodeMatch | undefined {
  if (!rawValue || rawValue.trim() === "") {
    return undefined;
  }
  
  const normalized = String(rawValue).trim();
  
  // Try exact code match first (e.g., "100", "FLRT")
  const exactCodeMatch = costCodes.find(cc => 
    cc.code.toLowerCase() === normalized.toLowerCase()
  );
  
  if (exactCodeMatch) {
    return {
      rawValue: normalized,
      matchedCode: exactCodeMatch,
      matchType: "code",
      confidence: "high",
    };
  }
  
  // Try exact title match (e.g., "Preliminaries")
  const exactTitleMatch = costCodes.find(cc => 
    cc.title.toLowerCase() === normalized.toLowerCase()
  );
  
  if (exactTitleMatch) {
    return {
      rawValue: normalized,
      matchedCode: exactTitleMatch,
      matchType: "title",
      confidence: "high",
    };
  }
  
  // Try partial matches (e.g., "100 - Preliminaries" matches code "100")
  const partialCodeMatch = costCodes.find(cc => {
    const lowerNormalized = normalized.toLowerCase();
    const lowerCode = cc.code.toLowerCase();
    // Check if the raw value starts with the code (e.g., "100 - Preliminaries" starts with "100")
    return lowerNormalized.startsWith(lowerCode + " ") || 
           lowerNormalized.startsWith(lowerCode + "-") ||
           lowerNormalized === lowerCode;
  });
  
  if (partialCodeMatch) {
    return {
      rawValue: normalized,
      matchedCode: partialCodeMatch,
      matchType: "code",
      confidence: "high",
    };
  }
  
  // No match found
  return {
    rawValue: normalized,
    confidence: "low",
  };
}

// Utility: Auto-detect column mappings from headers
export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  
  headers.forEach((header, index) => {
    const normalized = header.toLowerCase().trim();
    const fieldKey = defaultColumnMappings[normalized];
    
    if (fieldKey) {
      mapping[fieldKey] = header; // Store original header name
    }
  });
  
  return mapping;
}

// Options for fuzzy matching during import
export interface ImportMatchOptions {
  costCodes?: CostCode[];
  groups?: { id: string; name: string }[];
  statusOptions?: { id: string; name: string; key?: string }[];
}

// Utility: Parse a single row based on column mapping
export function parseImportRow(
  row: any,
  mapping: ColumnMapping,
  rowIndex: number,
  costCodes: CostCode[] = [],
  matchOptions?: ImportMatchOptions
): ImportRowResult {
  try {
    const data: any = {};
    let costCodeMatch: CostCodeMatch | undefined;
    let typeMatch: FuzzyMatch<string> | undefined;
    let unitTypeMatch: FuzzyMatch<string> | undefined;
    let allowanceMatch: FuzzyMatch<string> | undefined;
    let groupMatch: FuzzyMatch<{ id: string; name: string }> | undefined;
    let statusMatch: FuzzyMatch<{ id: string; name: string }> | undefined;
    
    // Map columns to fields
    Object.entries(mapping).forEach(([fieldKey, columnKey]) => {
      if (columnKey !== undefined) {
        const value = row[columnKey];
        
        // Handle special field types
        if (fieldKey === "unitCostExTax") {
          data[fieldKey] = typeof value === "string" ? parseCurrency(value) : (value || 0);
        } else if (fieldKey === "quantity") {
          data[fieldKey] = typeof value === "string" ? parseFloat(value.replace(/[,\s]/g, "")) || 1 : (value || 1);
        } else if (fieldKey === "markupPercent") {
          data[fieldKey] = typeof value === "string" ? parseFloat(value) || 0 : (value || 0);
        } else if (fieldKey === "costCode") {
          // Convert number to string if necessary
          const rawValue = value !== undefined && value !== null && value !== "" ? String(value) : undefined;
          data[fieldKey] = rawValue;
          
          // Try to match the cost code
          const effectiveCostCodes = matchOptions?.costCodes || costCodes;
          if (rawValue && effectiveCostCodes.length > 0) {
            costCodeMatch = matchCostCode(rawValue, effectiveCostCodes);
            // If we found a match, use the matched code's ID as the cost code value
            if (costCodeMatch?.matchedCode) {
              data[fieldKey] = costCodeMatch.matchedCode.id;
            }
          }
        } else if (fieldKey === "type") {
          // Fuzzy match type (Material, Labour, Subcontractor, Fee)
          const rawValue = value !== undefined && value !== null && value !== "" ? String(value) : undefined;
          if (rawValue) {
            typeMatch = matchType(rawValue);
            // Only apply high-confidence matches - let validation catch others
            if (typeMatch?.matchedValue && typeMatch.confidence === "high") {
              data[fieldKey] = typeMatch.matchedValue;
            } else {
              data[fieldKey] = rawValue; // Keep original for validation to catch
            }
          }
        } else if (fieldKey === "unitType") {
          // Fuzzy match unit type
          const rawValue = value !== undefined && value !== null && value !== "" ? String(value) : undefined;
          if (rawValue) {
            unitTypeMatch = matchUnitType(rawValue);
            // Apply high or medium confidence matches (unit type is more flexible)
            if (unitTypeMatch?.matchedValue && (unitTypeMatch.confidence === "high" || unitTypeMatch.confidence === "medium")) {
              data[fieldKey] = unitTypeMatch.matchedValue;
            } else {
              data[fieldKey] = rawValue; // Keep original - it's a string field
            }
          }
        } else if (fieldKey === "allowance") {
          // Fuzzy match allowance type
          const rawValue = value !== undefined && value !== null && value !== "" ? String(value) : undefined;
          if (rawValue) {
            allowanceMatch = matchAllowance(rawValue);
            // Only apply high-confidence matches for enums
            if (allowanceMatch?.matchedValue && allowanceMatch.confidence === "high") {
              data[fieldKey] = allowanceMatch.matchedValue;
            } else {
              data[fieldKey] = rawValue; // Keep original for validation to catch
            }
          }
        } else if (fieldKey === "group") {
          // Fuzzy match group name - keep as name (backend expects name, not ID)
          const rawValue = value !== undefined && value !== null && value !== "" ? String(value) : undefined;
          if (rawValue && matchOptions?.groups && matchOptions.groups.length > 0) {
            groupMatch = matchGroup(rawValue, matchOptions.groups);
            // Use matched name if found with high confidence, otherwise keep raw value
            // The backend will match by name or create new group
            if (groupMatch?.matchedValue && groupMatch.confidence === "high") {
              data[fieldKey] = groupMatch.matchedValue;
            } else {
              data[fieldKey] = rawValue; // Will create new group
            }
          } else {
            data[fieldKey] = rawValue;
          }
        } else if (fieldKey === "status") {
          // Fuzzy match status - store the matched name for display, not ID
          // Backend expects status as string (name/key), not ID
          const rawValue = value !== undefined && value !== null && value !== "" ? String(value) : undefined;
          if (rawValue && matchOptions?.statusOptions && matchOptions.statusOptions.length > 0) {
            statusMatch = matchStatus(rawValue, matchOptions.statusOptions);
            // Use matched name with high confidence, otherwise keep raw
            if (statusMatch?.matchedValue && statusMatch.confidence === "high") {
              data[fieldKey] = statusMatch.matchedValue;
            } else {
              data[fieldKey] = rawValue;
            }
          } else {
            data[fieldKey] = rawValue;
          }
        } else if (fieldKey === "proposalVisible") {
          // Parse boolean values from various formats
          if (value === undefined || value === null || value === "") {
            // Leave undefined so Zod default (true) is used
            data[fieldKey] = undefined;
          } else if (typeof value === "boolean") {
            data[fieldKey] = value;
          } else if (typeof value === "string") {
            const normalized = value.toLowerCase().trim();
            data[fieldKey] = normalized === "true" || normalized === "yes" || normalized === "1" || normalized === "shown";
          } else if (typeof value === "number") {
            data[fieldKey] = value === 1;
          } else {
            data[fieldKey] = undefined; // Leave undefined so Zod default (true) is used
          }
        } else {
          data[fieldKey] = value || undefined;
        }
      }
    });
    
    // Validate the parsed data
    const validated = importEstimateItemSchema.parse(data);
    
    return {
      rowIndex,
      data: validated,
      costCodeMatch,
      typeMatch,
      unitTypeMatch,
      allowanceMatch,
      groupMatch,
      statusMatch,
    };
  } catch (error) {
    const errors: string[] = [];
    
    if (error instanceof z.ZodError) {
      errors.push(...error.errors.map(e => `${e.path.join(".")}: ${e.message}`));
    } else {
      errors.push(String(error));
    }
    
    return {
      rowIndex,
      errors,
    };
  }
}

// Utility: Validate import file result
export function validateImportResult(result: ImportFileResult): boolean {
  return result.success && result.errorCount === 0 && result.validCount > 0;
}

// Full Estimate Import (with groups and items)
export const importEstimateGroupSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  parentGroupName: z.string().optional(), // For importing subgroups
  costCode: z.string().optional(),
  sortOrder: z.number().optional(),
});

export const importEstimateWithGroupsItemSchema = z.object({
  groupName: z.string().min(1, "Group name is required"),
  name: z.string().min(1, "Name is required"),
  type: z.enum(["Material", "Labour", "Subcontractor", "Fee"]).default("Material"),
  description: z.string().optional(),
  quantity: z.number().default(1),
  unitType: z.string().default("each"),
  unitCostExTax: z.number().default(0),
  markupPercent: z.number().min(0).default(0),
  allowance: z.enum(["None", "Prime Cost", "Provisional Sum"]).default("None"),
  notes: z.string().optional(),
  costCode: z.string().optional(),
  status: z.string().default("incomplete"),
});

export type ImportEstimateGroup = z.infer<typeof importEstimateGroupSchema>;
export type ImportEstimateWithGroupsItem = z.infer<typeof importEstimateWithGroupsItemSchema>;

export type ImportEstimateFormat = "buildern" | "wunderbuild" | "unknown";

// Detect estimate import format based on headers
export function detectEstimateImportFormat(headers: string[]): ImportEstimateFormat {
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
  
  // Buildern format has these characteristic columns
  const hasBuildernColumns = 
    normalizedHeaders.includes("parent name") &&
    normalizedHeaders.includes("cost type") &&
    normalizedHeaders.includes("builder cost");
  
  // Wunderbuild format has these characteristic columns
  const hasWunderbuildColumns =
    normalizedHeaders.includes("item number") &&
    normalizedHeaders.includes("category") &&
    normalizedHeaders.includes("costing item");
  
  if (hasBuildernColumns) return "buildern";
  if (hasWunderbuildColumns) return "wunderbuild";
  return "unknown";
}

// Parse buildern format row
export function parseBuildernRow(row: any): { isGroup: boolean; groupName?: string; parentGroupName?: string; item?: Partial<ImportEstimateWithGroupsItem> } {
  const costType = String(row["Cost Type"] || "").toUpperCase();
  const parentName = String(row["Parent Name"] || "").trim();
  const name = String(row["Name"] || "").trim();
  
  // GROUP rows create estimate groups (parent or subgroup)
  // They're summary totals, so they won't be imported as cost-bearing items
  if (costType === "GROUP") {
    return {
      isGroup: true,
      groupName: name,
      parentGroupName: parentName || undefined, // Include parent if it exists (for subgroups)
    };
  }
  
  // ASSEMBLY rows act as subgroup containers in Buildern — treat them as subgroups
  // so their child items can find their group during import
  if (costType === "ASSEMBLY") {
    return {
      isGroup: true,
      groupName: name,
      parentGroupName: parentName || undefined,
    };
  }
  
  // Item row: has a Parent Name
  if (parentName) {
    const quantity = parseFloat(row["Quantity"]) || 0;
    const unitCostExTax = parseCurrency(row["Unit cost ex. tax"]) || 0;
    const markupPercent = parseFloat(row["Markup %"]) || 0;
    
    // Map Cost Type to our types
    let type: "Material" | "Labour" | "Subcontractor" | "Fee" = "Material";
    if (costType === "LABOUR") type = "Labour";
    else if (costType === "SUBCONTRACTOR") type = "Subcontractor";
    else if (costType === "FEE") type = "Fee";
    else if (costType === "ALLOWANCE") type = "Material"; // Treat allowance as material
    
    // Map allowance type
    let allowance: "None" | "Prime Cost" | "Provisional Sum" = "None";
    if (costType === "ALLOWANCE") {
      allowance = "Prime Cost"; // Default to PC for allowances
    }
    
    return {
      isGroup: false,
      item: {
        groupName: parentName,
        name,
        type,
        description: String(row["Description"] || "").trim(),
        quantity,
        unitType: String(row["Unit"] || "each").trim(),
        unitCostExTax,
        markupPercent,
        allowance,
        notes: String(row["Description"] || "").trim(),
        costCode: String(row["Cost Code"] || "").trim(),
        status: "incomplete",
      },
    };
  }
  
  return { isGroup: false };
}

// Parse wunderbuild format row
export function parseWunderbuildRow(row: any, previousCategory: string = ""): { isGroup: boolean; groupName?: string; item?: Partial<ImportEstimateWithGroupsItem>; category: string } {
  const itemNumber = String(row["Item Number"] || "").trim();
  const category = String(row["Category"] || previousCategory).trim();
  const costingItem = String(row["Costing Item"] || "").trim();
  const quantity = parseFloat(row["Quantity"]) || 0;
  const costEx = parseCurrency(row["Cost (ex.)"]) || 0;
  const markupPercent = parseFloat(row["Markup (%)"]) || 0;
  
  // Determine if this is a group or item based on item number pattern
  // Groups typically have patterns like "1.1", "2.1" (parent items)
  // Items have patterns like "1.1.1", "1.1.2" (child items)
  const parts = itemNumber.split(".");
  const isLikelyGroup = parts.length === 2 && costingItem && quantity === 0;
  
  if (isLikelyGroup && category) {
    return {
      isGroup: true,
      groupName: costingItem || category,
      category,
    };
  }
  
  // It's an item
  if (costingItem && category) {
    // Map Cost Type to our types
    const costType = String(row["Cost Type"] || "").trim();
    let type: "Material" | "Labour" | "Subcontractor" | "Fee" = "Material";
    if (costType.toLowerCase().includes("labour")) type = "Labour";
    else if (costType.toLowerCase().includes("sub")) type = "Subcontractor";
    else if (costType.toLowerCase() === "supplier") type = "Material";
    
    return {
      isGroup: false,
      category,
      item: {
        groupName: category,
        name: costingItem,
        type,
        description: String(row["Note"] || "").trim(),
        quantity,
        unitType: String(row["UOM"] || "each").trim(),
        unitCostExTax: costEx,
        markupPercent,
        allowance: "None",
        notes: String(row["Note"] || "").trim(),
        costCode: String(row["Cost Code"] || "").trim(),
        status: "incomplete",
      },
    };
  }
  
  return { isGroup: false, category };
}

// Parse full estimate import file
export function parseFullEstimateImport(
  rows: any[],
  headers: string[]
): {
  format: ImportEstimateFormat;
  groups: ImportEstimateGroup[];
  items: ImportEstimateWithGroupsItem[];
  errors: string[];
} {
  const format = detectEstimateImportFormat(headers);
  const groups: ImportEstimateGroup[] = [];
  const items: ImportEstimateWithGroupsItem[] = [];
  const errors: string[] = [];
  const groupNames = new Set<string>();
  
  if (format === "unknown") {
    errors.push("Unable to detect estimate format. Please use buildern or wunderbuild export format.");
    return { format, groups, items, errors };
  }
  
  let previousCategory = "";
  let sortOrder = 0;
  
  rows.forEach((row, index) => {
    try {
      if (format === "buildern") {
        const parsed = parseBuildernRow(row);
        
        if (parsed.isGroup && parsed.groupName) {
          if (!groupNames.has(parsed.groupName)) {
            groups.push({
              name: parsed.groupName,
              parentGroupName: parsed.parentGroupName, // Include parent for subgroups
              sortOrder: sortOrder++,
            });
            groupNames.add(parsed.groupName);
          }
        } else if (parsed.item) {
          // Validate item
          const validated = importEstimateWithGroupsItemSchema.parse(parsed.item);
          items.push(validated);
        }
      } else if (format === "wunderbuild") {
        const parsed = parseWunderbuildRow(row, previousCategory);
        previousCategory = parsed.category;
        
        if (parsed.isGroup && parsed.groupName) {
          if (!groupNames.has(parsed.groupName)) {
            groups.push({
              name: parsed.groupName,
              sortOrder: sortOrder++,
            });
            groupNames.add(parsed.groupName);
          }
        } else if (parsed.item) {
          // Validate item
          const validated = importEstimateWithGroupsItemSchema.parse(parsed.item);
          items.push(validated);
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(`Row ${index + 1}: ${error.errors.map(e => e.message).join(", ")}`);
      } else {
        errors.push(`Row ${index + 1}: ${String(error)}`);
      }
    }
  });
  
  return { format, groups, items, errors };
}
