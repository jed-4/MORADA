import { addDays, startOfWeek, format, addWeeks, isWithinInterval } from "date-fns";

export interface RecurringTaskTemplate {
  id: string;
  title: string;
  content?: string;
  priority?: string;
  defaultAssigneeId?: string;
  tagIds?: string[];
  category?: string;
  checklist?: Array<{ text: string; completed: boolean }>;
  recurringDays?: number[]; // 1=Monday, 2=Tuesday, ..., 7=Sunday
  recurringStartTime?: string; // "HH:MM" format
  recurringDuration?: number; // minutes
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
 * Generate task instances for a recurring template for the next 4 weeks
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

  // Generate for next 4 weeks from today (28 days rolling window)
  const endDate = addWeeks(today, 4);

  // Iterate through each day in the 4-week window starting from today
  for (let currentDate = new Date(today); currentDate <= endDate; currentDate = addDays(currentDate, 1)) {
    // Get day of week (1=Monday, 7=Sunday)
    const dayOfWeek = currentDate.getDay() === 0 ? 7 : currentDate.getDay();

    // Check if template is scheduled for this day
    if (template.recurringDays.includes(dayOfWeek)) {
      // Check if task already exists for this date
      const dateKey = `${template.id}:${format(currentDate, 'yyyy-MM-dd')}`;
      
      if (!existingTaskDates.has(dateKey)) {
        // Create task instance
        const instance: GeneratedTaskInstance = {
          templateId: template.id,
          title: template.title,
          content: template.content,
          priority: template.priority,
          assigneeId: template.defaultAssigneeId,
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

        // Add start and end times if specified
        if (template.recurringStartTime) {
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
