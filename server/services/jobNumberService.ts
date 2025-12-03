import { db } from "../db";
import { eq, and } from "drizzle-orm";
import * as schema from "@shared/schema";

export type SystemPhase = "lead" | "pre_construction" | "construction" | "post_construction" | "archive";

export interface JobNumberConfig {
  mode: "financial_year" | "calendar_year" | "custom";
  format: string;
  prefix: string;
  startNumber: number;
}

export class JobNumberService {
  
  static getCurrentFinancialYear(): string {
    const now = new Date();
    const month = now.getMonth() + 1; // 0-indexed
    const year = now.getFullYear();
    
    // Australian FY starts July 1
    // If before July, we're in the FY that started last year
    if (month < 7) {
      return `${year - 1}-${year}`;
    }
    return `${year}-${year + 1}`;
  }

  static getCurrentCalendarYear(): string {
    return new Date().getFullYear().toString();
  }

  static getYearKey(mode: string): string {
    if (mode === "financial_year") {
      return this.getCurrentFinancialYear();
    } else if (mode === "calendar_year") {
      return this.getCurrentCalendarYear();
    }
    return "custom";
  }

  static getFYShortCode(): string {
    const fy = this.getCurrentFinancialYear();
    const [startYear, endYear] = fy.split("-");
    return `${startYear.slice(-1)}${endYear.slice(-1)}`;
  }

  static async getNextNumber(
    companyId: string,
    phase: SystemPhase,
    config: schema.SystemConfiguration
  ): Promise<{ number: number; formattedJobNumber: string }> {
    const mode = config.jobNumberingMode || "financial_year";
    const yearKey = this.getYearKey(mode);
    
    // Get or create counter for this company/phase/year
    let counter = await db.select()
      .from(schema.jobNumberCounters)
      .where(and(
        eq(schema.jobNumberCounters.companyId, companyId),
        eq(schema.jobNumberCounters.systemPhase, phase),
        eq(schema.jobNumberCounters.yearKey, yearKey)
      ))
      .limit(1);

    let nextNumber: number;
    
    if (counter.length === 0) {
      // Create new counter with starting number based on phase
      let startNumber = 1;
      if (phase === "lead") {
        startNumber = config.leadStartNumber || 1;
      } else if (phase === "pre_construction") {
        startNumber = config.preConstructionStartNumber || 1;
      } else if (phase === "construction") {
        startNumber = config.constructionStartNumber || 1;
      }
      
      nextNumber = startNumber;
      
      await db.insert(schema.jobNumberCounters).values({
        companyId,
        systemPhase: phase,
        yearKey,
        lastNumber: nextNumber,
      });
    } else {
      // Increment existing counter
      nextNumber = counter[0].lastNumber + 1;
      
      await db.update(schema.jobNumberCounters)
        .set({ lastNumber: nextNumber, updatedAt: new Date() })
        .where(eq(schema.jobNumberCounters.id, counter[0].id));
    }

    // Format the job number
    const formattedJobNumber = this.formatJobNumber(nextNumber, phase, config);
    
    return { number: nextNumber, formattedJobNumber };
  }

  static formatJobNumber(
    sequenceNumber: number,
    phase: SystemPhase,
    config: schema.SystemConfiguration
  ): string {
    const mode = config.jobNumberingMode || "financial_year";
    
    // Get prefix based on phase
    let prefix = "";
    if (phase === "lead") {
      prefix = config.leadPrefix || "L-";
    } else if (phase === "pre_construction") {
      prefix = config.preConstructionPrefix || "PC-";
    } else if (phase === "construction") {
      prefix = config.constructionPrefix || "";
    }
    
    // Build the job number based on mode
    if (mode === "financial_year") {
      // Format: PC-4501 (FY short code + sequence)
      const fyCode = this.getFYShortCode();
      const seq = sequenceNumber.toString().padStart(2, "0");
      return `${prefix}${fyCode}${seq}`;
    } else if (mode === "calendar_year") {
      // Format: PC-25-001 (2-digit year + sequence)
      const year = new Date().getFullYear().toString().slice(-2);
      const seq = sequenceNumber.toString().padStart(3, "0");
      return `${prefix}${year}-${seq}`;
    } else {
      // Custom: just prefix + sequence
      const seq = sequenceNumber.toString().padStart(3, "0");
      return `${prefix}${seq}`;
    }
  }

  static async generateJobNumber(
    companyId: string,
    phase: SystemPhase
  ): Promise<string> {
    // Get company's system configuration with proper companyId scoping
    const configs = await db.select()
      .from(schema.systemConfiguration)
      .where(eq(schema.systemConfiguration.companyId, companyId))
      .limit(1);
    
    const config = configs[0] || {
      companyId,
      jobNumberingMode: "financial_year",
      leadPrefix: "L-",
      preConstructionPrefix: "PC-",
      constructionPrefix: "",
      leadStartNumber: 1,
      preConstructionStartNumber: 1,
      constructionStartNumber: 1,
    } as schema.SystemConfiguration;

    const { formattedJobNumber } = await this.getNextNumber(companyId, phase, config);
    return formattedJobNumber;
  }

  static async previewNextJobNumber(
    companyId: string,
    phase: SystemPhase
  ): Promise<string> {
    // Get company's system configuration with proper companyId scoping
    const configs = await db.select()
      .from(schema.systemConfiguration)
      .where(eq(schema.systemConfiguration.companyId, companyId))
      .limit(1);
    
    const config = configs[0] || {
      companyId,
      jobNumberingMode: "financial_year",
      leadPrefix: "L-",
      preConstructionPrefix: "PC-",
      constructionPrefix: "",
      leadStartNumber: 1,
      preConstructionStartNumber: 1,
      constructionStartNumber: 1,
    } as schema.SystemConfiguration;

    const mode = config.jobNumberingMode || "financial_year";
    const yearKey = this.getYearKey(mode);
    
    // Get current counter without incrementing
    const counter = await db.select()
      .from(schema.jobNumberCounters)
      .where(and(
        eq(schema.jobNumberCounters.companyId, companyId),
        eq(schema.jobNumberCounters.systemPhase, phase),
        eq(schema.jobNumberCounters.yearKey, yearKey)
      ))
      .limit(1);

    let nextNumber: number;
    if (counter.length === 0) {
      if (phase === "lead") {
        nextNumber = config.leadStartNumber || 1;
      } else if (phase === "pre_construction") {
        nextNumber = config.preConstructionStartNumber || 1;
      } else {
        nextNumber = config.constructionStartNumber || 1;
      }
    } else {
      nextNumber = counter[0].lastNumber + 1;
    }

    return this.formatJobNumber(nextNumber, phase, config);
  }

  static getSystemPhaseFromStatus(
    statusKey: string,
    fieldOptions: schema.FieldOption[]
  ): SystemPhase | null {
    const option = fieldOptions.find(o => o.key === statusKey);
    if (option?.systemPhase) {
      return option.systemPhase as SystemPhase;
    }
    return null;
  }

  static isPhaseTransition(
    oldPhase: SystemPhase | null,
    newPhase: SystemPhase | null
  ): boolean {
    if (!oldPhase || !newPhase) return false;
    return oldPhase !== newPhase;
  }

  static getPhaseOrder(phase: SystemPhase): number {
    const order: Record<SystemPhase, number> = {
      lead: 0,
      pre_construction: 1,
      construction: 2,
      post_construction: 3,
      archive: 4,
    };
    return order[phase];
  }

  static isForwardTransition(
    oldPhase: SystemPhase,
    newPhase: SystemPhase
  ): boolean {
    return this.getPhaseOrder(newPhase) > this.getPhaseOrder(oldPhase);
  }
}
