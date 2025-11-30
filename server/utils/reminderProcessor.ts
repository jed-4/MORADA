import { storage } from "../storage";
import { sendReminderEmail } from "./email";
import { addDays, addWeeks, addMonths, differenceInMinutes } from "date-fns";

let isProcessorRunning = false;
let processorInterval: NodeJS.Timeout | null = null;

export async function processReminders() {
  if (isProcessorRunning) {
    console.log("[ReminderProcessor] Previous processing still in progress, skipping...");
    return;
  }
  
  isProcessorRunning = true;
  console.log("[ReminderProcessor] Starting reminder processing...");
  
  try {
    const now = new Date();
    
    const dueReminders = await storage.getDueReminders(now);
    console.log(`[ReminderProcessor] Found ${dueReminders.length} due reminders`);
    
    for (const reminder of dueReminders) {
      try {
        await storage.updateReminder(reminder.id, reminder.companyId, {
          status: "processing",
        });
        
        await storage.createReminderNotification({
          reminderId: reminder.id,
          userId: reminder.userId,
          scheduledFor: new Date(),
          status: "pending",
          deliveryChannel: "in_app",
        });
        
        const user = await storage.getUser(reminder.userId);
        if (user?.email) {
          try {
            await sendReminderEmail({
              to: user.email,
              recipientName: user.firstName || user.email.split('@')[0],
              reminderTitle: reminder.title,
              reminderDescription: reminder.description || undefined,
              linkedItemType: reminder.linkedItemType || undefined,
              priority: reminder.priority || undefined,
            });
            
            await storage.createReminderNotification({
              reminderId: reminder.id,
              userId: reminder.userId,
              scheduledFor: new Date(),
              status: "delivered",
              deliveryChannel: "email",
              deliveredAt: new Date(),
            });
          } catch (emailError) {
            console.error(`[ReminderProcessor] Failed to send email for reminder ${reminder.id}:`, emailError);
          }
        }
        
        const recurrence = reminder.recurrencePattern as any;
        if (recurrence && recurrence.frequency !== "once") {
          const nextDueAt = calculateNextOccurrence(reminder.dueAt!, recurrence);
          
          if (nextDueAt && (!recurrence.endDate || nextDueAt <= new Date(recurrence.endDate))) {
            await storage.updateReminder(reminder.id, reminder.companyId, {
              dueAt: nextDueAt,
              status: "active",
            });
          } else {
            await storage.updateReminder(reminder.id, reminder.companyId, {
              status: "completed",
            });
          }
        } else {
          await storage.updateReminder(reminder.id, reminder.companyId, {
            status: "completed",
          });
        }
        
        console.log(`[ReminderProcessor] Processed reminder ${reminder.id}: ${reminder.title}`);
      } catch (err) {
        console.error(`[ReminderProcessor] Error processing reminder ${reminder.id}:`, err);
        await storage.updateReminder(reminder.id, reminder.companyId, {
          status: "active",
        });
      }
    }
    
    const nowTime = now.toTimeString().slice(0, 5);
    const dayOfWeek = now.getDay();
    
    const businessReminders = await storage.getActiveBusinessRemindersForTime(nowTime, dayOfWeek);
    console.log(`[ReminderProcessor] Found ${businessReminders.length} business reminders for ${nowTime}`);
    
    for (const businessReminder of businessReminders) {
      try {
        if (businessReminder.lastTriggeredAt) {
          const lastTriggered = new Date(businessReminder.lastTriggeredAt);
          const minutesSinceLastTrigger = differenceInMinutes(now, lastTriggered);
          
          if (minutesSinceLastTrigger < 60) {
            console.log(`[ReminderProcessor] Skipping business reminder ${businessReminder.id} - already triggered ${minutesSinceLastTrigger} minutes ago`);
            continue;
          }
        }
        
        await storage.updateBusinessReminder(businessReminder.id, businessReminder.companyId, {
          lastTriggeredAt: now,
        });
        
        const users = await storage.getUsersByCompany(businessReminder.companyId);
        const deliverySettings = businessReminder.deliverySettings as any || {};
        
        for (const user of users) {
          await storage.createReminderNotification({
            businessReminderId: businessReminder.id,
            userId: user.id,
            scheduledFor: new Date(),
            status: "pending",
            deliveryChannel: "in_app",
          });
          
          if (deliverySettings.email !== false && user.email) {
            try {
              await sendReminderEmail({
                to: user.email,
                recipientName: user.firstName || user.email.split('@')[0],
                reminderTitle: businessReminder.title,
                reminderDescription: businessReminder.message || undefined,
                linkedItemType: businessReminder.reminderType || undefined,
              });
              
              await storage.createReminderNotification({
                businessReminderId: businessReminder.id,
                userId: user.id,
                scheduledFor: new Date(),
                status: "delivered",
                deliveryChannel: "email",
                deliveredAt: new Date(),
              });
            } catch (emailError) {
              console.error(`[ReminderProcessor] Failed to send email for business reminder ${businessReminder.id} to ${user.email}:`, emailError);
            }
          }
        }
        
        console.log(`[ReminderProcessor] Processed business reminder ${businessReminder.id}: ${businessReminder.title}`);
      } catch (err) {
        console.error(`[ReminderProcessor] Error processing business reminder ${businessReminder.id}:`, err);
      }
    }
    
    console.log("[ReminderProcessor] Reminder processing completed");
  } catch (error) {
    console.error("[ReminderProcessor] Error processing reminders:", error);
  } finally {
    isProcessorRunning = false;
  }
}

function calculateNextOccurrence(currentDue: Date, recurrence: any): Date | null {
  const interval = recurrence.interval || 1;
  const dueDate = new Date(currentDue);
  
  switch (recurrence.frequency) {
    case "daily":
      return addDays(dueDate, interval);
      
    case "weekly":
      if (recurrence.weekdays && recurrence.weekdays.length > 0) {
        const currentDay = dueDate.getDay();
        const sortedDays = [...recurrence.weekdays].sort((a: number, b: number) => a - b);
        const nextDayIndex = sortedDays.findIndex((d: number) => d > currentDay);
        
        if (nextDayIndex !== -1) {
          const daysUntilNext = sortedDays[nextDayIndex] - currentDay;
          return addDays(dueDate, daysUntilNext);
        } else {
          const daysUntilNext = 7 - currentDay + sortedDays[0];
          return addDays(dueDate, daysUntilNext + (interval - 1) * 7);
        }
      }
      return addWeeks(dueDate, interval);
      
    case "monthly":
      if (recurrence.monthDay) {
        const nextMonth = addMonths(dueDate, interval);
        nextMonth.setDate(recurrence.monthDay);
        return nextMonth;
      }
      return addMonths(dueDate, interval);
      
    default:
      return null;
  }
}

export function startReminderProcessor(intervalMinutes: number = 1) {
  if (processorInterval) {
    console.log("[ReminderProcessor] Already running, skipping start");
    return;
  }
  
  console.log(`[ReminderProcessor] Starting with ${intervalMinutes}-minute interval`);
  
  setTimeout(() => {
    processReminders().catch(console.error);
  }, 5000);
  
  processorInterval = setInterval(() => {
    processReminders().catch(console.error);
  }, intervalMinutes * 60 * 1000);
}

export function stopReminderProcessor() {
  if (processorInterval) {
    clearInterval(processorInterval);
    processorInterval = null;
    console.log("[ReminderProcessor] Stopped");
  }
}
