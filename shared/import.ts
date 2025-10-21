import { z } from "zod";

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

// Utility: Parse a single row based on column mapping
export function parseImportRow(
  row: any,
  mapping: ColumnMapping,
  rowIndex: number
): ImportRowResult {
  try {
    const data: any = {};
    
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
          data[fieldKey] = value !== undefined && value !== null && value !== "" ? String(value) : undefined;
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
export function parseBuildernRow(row: any): { isGroup: boolean; groupName?: string; item?: Partial<ImportEstimateWithGroupsItem> } {
  const costType = String(row["Cost Type"] || "").toUpperCase();
  const parentName = String(row["Parent Name"] || "").trim();
  const name = String(row["Name"] || "").trim();
  
  // Group row: Cost Type = "GROUP" and no Parent Name
  if (costType === "GROUP" && !parentName) {
    return {
      isGroup: true,
      groupName: name,
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
