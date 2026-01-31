import { addDays, startOfWeek, format, addWeeks, isWithinInterval } from "date-fns";

export interface RecurringScheduleItem {
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  startTime: string; // "HH:MM" format
  duration: number; // minutes
}

export interface RecurringTaskTemplate {
  id: string;
  title: string;
  content?: string;
  priority?: string;
  defaultRoleId?: string; // Role to assign (will be resolved to users)
  defaultAssigneeId?: string; // DEPRECATED: use defaultRoleId instead
  assigneeType?: string; // "role" | "user" - determines how to assign
  assigneeUserId?: string; // Specific user assignment when assigneeType === "user"
  tagIds?: string[];
  category?: string;
  checklist?: Array<{ text: string; completed: boolean }>;
  recurringDays?: number[]; // Days to generate tasks (0=Sunday, ..., 6=Saturday)
  recurringSchedule?: RecurringScheduleItem[]; // Day-specific times (overrides recurringStartTime/Duration)
  recurringStartTime?: string; // DEPRECATED: "HH:MM" format
  recurringDuration?: number; // DEPRECATED: minutes
  dueTime?: string; // "HH:MM" format - primary time field for operational tasks
  estimatedDuration?: number; // minutes - for calculating end time
}

export interface GeneratedTaskInstance {
  templateId: string;
  title: string;
  content?: string;
  priority?: string;
  assigneeId?: string;
  tagIds?: string[];
  category?: string;
  checklist?: Array<{ text: string; completed: boolean }>;
  dueDate: Date;
  startTime?: string;
  endTime?: string;
}

/**
 * Calculate the end time for a task given start time and duration
 */
function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}

/**
 * Generate task instances for a recurring template for CURRENT + NEXT WEEK (14 days)
 * This ensures users always have visibility into the next 1-2 weeks of scheduled tasks
 * 
 * NOTE: This function generates ALL possible instances for the schedule.
 * Duplicate detection should be handled by the caller (generateRecurringTasks in storage.ts)
 * because this function doesn't know about per-user role-based assignments.
 * 
 * @param template Task template with recurring schedule
 * @returns Array of task instances to create (caller handles duplicate filtering)
 */
export function generateRecurringTaskInstances(
  template: RecurringTaskTemplate
): GeneratedTaskInstance[] {
  const instances: GeneratedTaskInstance[] = [];

  // Validate template has recurring schedule
  if (!template.recurringDays || template.recurringDays.length === 0) {
    return instances;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today

  // Generate for current week + next week (14 days total)
  // Start from Monday of current week, end on Sunday of next week
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday of current week
  const endDate = addDays(weekStart, 13); // Sunday of next week (14 days total)

  // Iterate through each day in the 2-week window starting from today
  for (let currentDate = new Date(today); currentDate <= endDate; currentDate = addDays(currentDate, 1)) {
    // Get day of week (0=Sunday, 6=Saturday - JavaScript standard)
    const dayOfWeek = currentDate.getDay();

    // Check if template is scheduled for this day
    if (template.recurringDays.includes(dayOfWeek)) {
      // Determine assignee - prefer assigneeUserId when assigneeType is "user", otherwise use legacy defaultAssigneeId
      const effectiveAssigneeId = template.assigneeType === 'user' && template.assigneeUserId 
        ? template.assigneeUserId 
        : template.defaultAssigneeId;
      
      // Create task instance
      const instance: GeneratedTaskInstance = {
        templateId: template.id,
        title: template.title,
        content: template.content,
        priority: template.priority,
        assigneeId: effectiveAssigneeId,
        tagIds: template.tagIds,
        category: template.category,
        dueDate: new Date(currentDate),
      };

      // Copy checklist from template (reset all to uncompleted)
      if (template.checklist && template.checklist.length > 0) {
        instance.checklist = template.checklist.map(item => ({
          text: item.text,
          completed: false
        }));
      }

      // Add start and end times - prefer recurringSchedule, then dueTime, fallback to recurringStartTime
      // Use loose equality (==) to handle potential type mismatches from JSON parsing
      const scheduleForDay = template.recurringSchedule?.find(s => Number(s.dayOfWeek) === dayOfWeek);
      if (scheduleForDay) {
        instance.startTime = scheduleForDay.startTime;
        if (scheduleForDay.duration > 0) {
          instance.endTime = calculateEndTime(scheduleForDay.startTime, scheduleForDay.duration);
        }
      } else if (template.dueTime) {
        // Use dueTime as the start time for operational tasks
        instance.startTime = template.dueTime;
        if (template.estimatedDuration && template.estimatedDuration > 0) {
          instance.endTime = calculateEndTime(template.dueTime, template.estimatedDuration);
        }
      } else if (template.recurringStartTime) {
        // Fallback to legacy single time for all days
        instance.startTime = template.recurringStartTime;
        if (template.recurringDuration && template.recurringDuration > 0) {
          instance.endTime = calculateEndTime(template.recurringStartTime, template.recurringDuration);
        }
      }

      instances.push(instance);
    }
  }

  return instances;
}

/**
 * Create a unique key for a recurring task instance (template + date)
 * Used to track which tasks have already been generated
 * Normalizes both Date objects and ISO timestamp strings to YYYY-MM-DD format
 */
export function getRecurringTaskKey(templateId: string, dueDate: Date | string | null | undefined): string {
  // Handle null/undefined dates gracefully
  if (!dueDate) {
    console.warn(`[getRecurringTaskKey] Missing dueDate for template ${templateId}, using fallback`);
    return `${templateId}:no-date`;
  }
  
  try {
    let parsedDate: Date;
    
    // Handle Date objects that might already be Invalid Date
    if (dueDate instanceof Date) {
      if (isNaN(dueDate.getTime())) {
        // Silent skip for already-invalid Date objects (common from DB type mismatches)
        return `${templateId}:invalid-date`;
      }
      parsedDate = dueDate;
    } else if (typeof dueDate === 'string') {
      // Handle string dates - could be ISO format, date-only, etc.
      parsedDate = new Date(dueDate);
      if (isNaN(parsedDate.getTime())) {
        // Try parsing as date-only format (YYYY-MM-DD) 
        const dateOnlyMatch = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnlyMatch) {
          parsedDate = new Date(parseInt(dateOnlyMatch[1]), parseInt(dateOnlyMatch[2]) - 1, parseInt(dateOnlyMatch[3]));
        }
        if (isNaN(parsedDate.getTime())) {
          console.warn(`[getRecurringTaskKey] Cannot parse date string "${dueDate}" for template ${templateId}`);
          return `${templateId}:invalid-date`;
        }
      }
    } else {
      // Unknown type
      console.warn(`[getRecurringTaskKey] Unknown date type for template ${templateId}`);
      return `${templateId}:invalid-date`;
    }
    
    const dateStr = format(parsedDate, 'yyyy-MM-dd');
    return `${templateId}:${dateStr}`;
  } catch (error) {
    console.error(`[getRecurringTaskKey] Error formatting date for template ${templateId}:`, error);
    return `${templateId}:error`;
  }
}

/**
 * Calculate the next week's date for a given due date (Asana-style recurring)
 * When a task is completed, create the same-day-next-week task
 * @param dueDate The current task's due date
 * @returns The date for the next occurrence (7 days later)
 */
export function getNextWeekDate(dueDate: Date | string): Date {
  const date = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  return addDays(date, 7);
}

/**
 * Generate a single task instance for the next occurrence of a recurring template
 * Used when completing a task to create the next week's task (Asana-style)
 * @param template Task template with recurring schedule
 * @param completedTaskDueDate The due date of the task being completed
 * @returns A single task instance for next week, or null if not applicable
 */
export function generateNextRecurringInstance(
  template: RecurringTaskTemplate,
  completedTaskDueDate: Date | string
): GeneratedTaskInstance | null {
  // Validate template has recurring schedule
  if (!template.recurringDays || template.recurringDays.length === 0) {
    return null;
  }

  const dueDate = typeof completedTaskDueDate === 'string' 
    ? new Date(completedTaskDueDate) 
    : completedTaskDueDate;
  
  // Get day of week for the completed task
  const dayOfWeek = dueDate.getDay();
  
  // Verify this day is still in the template's recurring days
  if (!template.recurringDays.includes(dayOfWeek)) {
    return null;
  }

  // Calculate next week's date
  const nextDueDate = getNextWeekDate(dueDate);
  
  // Determine assignee
  const effectiveAssigneeId = template.assigneeType === 'user' && template.assigneeUserId 
    ? template.assigneeUserId 
    : template.defaultAssigneeId;

  // Create task instance
  const instance: GeneratedTaskInstance = {
    templateId: template.id,
    title: template.title,
    content: template.content,
    priority: template.priority,
    assigneeId: effectiveAssigneeId,
    tagIds: template.tagIds,
    category: template.category,
    dueDate: nextDueDate,
  };

  // Copy checklist from template (reset all to uncompleted)
  if (template.checklist && template.checklist.length > 0) {
    instance.checklist = template.checklist.map(item => ({
      text: item.text,
      completed: false
    }));
  }

  // Add start and end times from schedule
  const scheduleForDay = template.recurringSchedule?.find(s => Number(s.dayOfWeek) === dayOfWeek);
  if (scheduleForDay) {
    instance.startTime = scheduleForDay.startTime;
    if (scheduleForDay.duration > 0) {
      instance.endTime = calculateEndTime(scheduleForDay.startTime, scheduleForDay.duration);
    }
  } else if (template.dueTime) {
    // Use dueTime as the start time for operational tasks
    instance.startTime = template.dueTime;
    if (template.estimatedDuration && template.estimatedDuration > 0) {
      instance.endTime = calculateEndTime(template.dueTime, template.estimatedDuration);
    }
  } else if (template.recurringStartTime) {
    instance.startTime = template.recurringStartTime;
    if (template.recurringDuration && template.recurringDuration > 0) {
      instance.endTime = calculateEndTime(template.recurringStartTime, template.recurringDuration);
    }
  }

  return instance;
}

/**
 * Fields that should be synced from template to generated tasks
 */
export interface TemplateSyncFields {
  title?: string;
  content?: string;
  priority?: string;
  assigneeId?: string;
  assigneeName?: string;
  checklist?: Array<{ id?: string; text: string; completed: boolean }>;
  startTime?: string;
  endTime?: string;
}

/**
 * Generate sync fields from a template for updating existing tasks
 * Only syncs fields that make sense to update on generated tasks
 * Does NOT sync: dueDate (that's based on schedule), status (user can change that)
 */
export function getTemplateSyncFields(
  template: RecurringTaskTemplate,
  dayOfWeek?: number
): TemplateSyncFields {
  // Determine assignee
  const effectiveAssigneeId = template.assigneeType === 'user' && template.assigneeUserId 
    ? template.assigneeUserId 
    : template.defaultAssigneeId;

  const syncFields: TemplateSyncFields = {
    title: template.title,
    content: template.content,
    priority: template.priority,
    assigneeId: effectiveAssigneeId,
  };

  // Sync checklist but preserve completed status if possible
  if (template.checklist && template.checklist.length > 0) {
    syncFields.checklist = template.checklist.map((item, index) => ({
      id: `item-${index}`,
      text: item.text,
      completed: false, // Will be merged with existing completed state in storage
    }));
  }

  // Sync time if dayOfWeek provided
  if (dayOfWeek !== undefined) {
    const scheduleForDay = template.recurringSchedule?.find(s => Number(s.dayOfWeek) === dayOfWeek);
    if (scheduleForDay) {
      syncFields.startTime = scheduleForDay.startTime;
      if (scheduleForDay.duration > 0) {
        syncFields.endTime = calculateEndTime(scheduleForDay.startTime, scheduleForDay.duration);
      }
    } else if (template.dueTime) {
      // Use dueTime as the start time for operational tasks
      syncFields.startTime = template.dueTime;
      if (template.estimatedDuration && template.estimatedDuration > 0) {
        syncFields.endTime = calculateEndTime(template.dueTime, template.estimatedDuration);
      }
    } else if (template.recurringStartTime) {
      syncFields.startTime = template.recurringStartTime;
      if (template.recurringDuration && template.recurringDuration > 0) {
        syncFields.endTime = calculateEndTime(template.recurringStartTime, template.recurringDuration);
      }
    }
  }

  return syncFields;
}
