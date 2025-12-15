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
 * Generate task instances for a recurring template for the CURRENT WEEK only (Asana-style)
 * Tasks for the next week are created when the current week's task is completed
 * @param template Task template with recurring schedule
 * @param existingTaskDates Set of existing task dates (ISO strings) to avoid duplicates
 * @returns Array of task instances to create
 */
export function generateRecurringTaskInstances(
  template: RecurringTaskTemplate,
  existingTaskDates: Set<string> = new Set()
): GeneratedTaskInstance[] {
  const instances: GeneratedTaskInstance[] = [];

  // Validate template has recurring schedule
  if (!template.recurringDays || template.recurringDays.length === 0) {
    return instances;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today

  // Generate for current week only (Monday-Sunday of this week)
  // Start from Monday of current week, end on Sunday
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const endDate = addDays(weekStart, 6); // Sunday

  // Iterate through each day in the 4-week window starting from today
  for (let currentDate = new Date(today); currentDate <= endDate; currentDate = addDays(currentDate, 1)) {
    // Get day of week (0=Sunday, 6=Saturday - JavaScript standard)
    const dayOfWeek = currentDate.getDay();

    // Check if template is scheduled for this day
    if (template.recurringDays.includes(dayOfWeek)) {
      // Check if task already exists for this date
      const dateKey = `${template.id}:${format(currentDate, 'yyyy-MM-dd')}`;
      
      if (!existingTaskDates.has(dateKey)) {
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

        // Add start and end times - prefer recurringSchedule, fallback to recurringStartTime
        // Use loose equality (==) to handle potential type mismatches from JSON parsing
        const scheduleForDay = template.recurringSchedule?.find(s => Number(s.dayOfWeek) === dayOfWeek);
        if (scheduleForDay) {
          instance.startTime = scheduleForDay.startTime;
          if (scheduleForDay.duration > 0) {
            instance.endTime = calculateEndTime(scheduleForDay.startTime, scheduleForDay.duration);
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
  }

  return instances;
}

/**
 * Create a unique key for a recurring task instance (template + date)
 * Used to track which tasks have already been generated
 * Normalizes both Date objects and ISO timestamp strings to YYYY-MM-DD format
 */
export function getRecurringTaskKey(templateId: string, dueDate: Date | string): string {
  // Always normalize to YYYY-MM-DD format regardless of input type
  const dateStr = typeof dueDate === 'string' 
    ? format(new Date(dueDate), 'yyyy-MM-dd')  // Parse ISO string to Date, then format
    : format(dueDate, 'yyyy-MM-dd');
  return `${templateId}:${dateStr}`;
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
  } else if (template.recurringStartTime) {
    instance.startTime = template.recurringStartTime;
    if (template.recurringDuration && template.recurringDuration > 0) {
      instance.endTime = calculateEndTime(template.recurringStartTime, template.recurringDuration);
    }
  }

  return instance;
}
