import { z } from "zod";

// Estimate Item Import Schema
// This schema is used for validating imported data from CSV/Excel files
export const importEstimateItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["Material", "Labour", "Subcontractor", "Fee"]).default("Material"),
  description: z.string().optional(),
  quantity: z.number().min(0, "Quantity must be 0 or greater").default(1),
  unitType: z.string().default("each"),
  priceExTax: z.number().min(0, "Price must be 0 or greater").default(0),
  allowance: z.enum(["None", "Prime Cost", "Provisional Sum"]).default("None"),
  notes: z.string().optional(),
  costCode: z.string().optional(),
  status: z.string().default("incomplete"),
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
  "category": "type",
  
  // Quantity variations
  "quantity": "quantity",
  "qty": "quantity",
  "amount": "quantity",
  
  // Unit variations
  "unit": "unitType",
  "unit type": "unitType",
  "units": "unitType",
  "uom": "unitType",
  
  // Price variations
  "price": "priceExTax",
  "price ex tax": "priceExTax",
  "price ex gst": "priceExTax",
  "unit price": "priceExTax",
  "rate": "priceExTax",
  "cost": "priceExTax",
  
  // Allowance variations
  "allowance": "allowance",
  "allowance type": "allowance",
  
  // Notes variations
  "notes": "notes",
  "note": "notes",
  "comments": "notes",
  "comment": "notes",
  
  // Cost code variations
  "cost code": "costCode",
  "costcode": "costCode",
  "code": "costCode",
  
  // Status variations
  "status": "status",
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
        if (fieldKey === "priceExTax") {
          data[fieldKey] = typeof value === "string" ? parseCurrency(value) : (value || 0);
        } else if (fieldKey === "quantity") {
          data[fieldKey] = typeof value === "string" ? parseFloat(value) || 1 : (value || 1);
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
