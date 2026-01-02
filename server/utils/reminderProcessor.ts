import { storage } from "../storage";
import { sendReminderEmail } from "./email";
import { addDays, addWeeks, addMonths, differenceInMinutes, startOfDay, format } from "date-fns";

let isProcessorRunning = false;
let lastInsuranceCheckDate: string | null = null;
let lastRecurringTasksCheckDate: string | null = null;
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
    
    await processInsuranceExpiryReminders();
    await processRecurringTaskTemplates();
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

export async function processInsuranceExpiryReminders() {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  if (lastInsuranceCheckDate === today) {
    return;
  }
  
  console.log("[ReminderProcessor] Checking for expiring supplier insurances...");
  
  try {
    const companies = await storage.getAllCompanies();
    
    for (const company of companies) {
      try {
        const companySettings = await storage.getCompanySettings(company.id);
        const reminderRoleId = (companySettings as any)?.insuranceReminderRoleId;
        
        let assigneeUserId: string | null = null;
        if (reminderRoleId) {
          const usersWithRole = await storage.getUsersByRole(company.id, reminderRoleId);
          if (usersWithRole.length > 0) {
            assigneeUserId = usersWithRole[0].id;
          }
        }
        
        if (!assigneeUserId) {
          const allUsers = await storage.getUsersByCompany(company.id);
          const adminUser = allUsers.find(u => {
            const role = (u as any).role?.toLowerCase() || '';
            return role.includes('admin') || role.includes('general manage') || role.includes('owner');
          });
          if (adminUser) {
            assigneeUserId = adminUser.id;
          } else if (allUsers.length > 0) {
            assigneeUserId = allUsers[0].id;
          }
        }

        // Process legacy supplier insurances
        const expiringIn30Days = await storage.getExpiringInsurances(company.id, 30);
        const expiringIn7Days = await storage.getExpiringInsurances(company.id, 7);
        
        const expiring30NotYet7 = expiringIn30Days.filter(
          ins => !expiringIn7Days.some(i7 => i7.id === ins.id)
        );
        
        for (const insurance of expiring30NotYet7) {
          const existingTask = await storage.findTaskByReference(
            company.id,
            'insurance_expiry_30',
            insurance.id
          );
          
          if (!existingTask) {
            const supplier = await storage.getSupplierById(insurance.supplierId);
            const supplierName = supplier?.name || 'Unknown Supplier';
            const expiryDate = format(new Date(insurance.expiryDate!), 'dd/MM/yyyy');
            
            await storage.createTask({
              companyId: company.id,
              title: `Insurance Expiry Warning: ${supplierName} - ${insurance.insuranceType}`,
              description: `${insurance.insuranceType} insurance for ${supplierName} expires on ${expiryDate}. Please ensure the supplier provides updated insurance documentation.`,
              status: 'To Do',
              priority: 'Medium',
              dueDate: new Date(insurance.expiryDate!),
              assigneeId: assigneeUserId,
              referenceType: 'insurance_expiry_30',
              referenceId: insurance.id,
            });
            
            console.log(`[ReminderProcessor] Created 30-day expiry task for ${supplierName} - ${insurance.insuranceType}`);
          }
        }
        
        for (const insurance of expiringIn7Days) {
          const existingTask = await storage.findTaskByReference(
            company.id,
            'insurance_expiry_7',
            insurance.id
          );
          
          if (!existingTask) {
            const supplier = await storage.getSupplierById(insurance.supplierId);
            const supplierName = supplier?.name || 'Unknown Supplier';
            const expiryDate = format(new Date(insurance.expiryDate!), 'dd/MM/yyyy');
            
            await storage.createTask({
              companyId: company.id,
              title: `URGENT: Insurance Expiring Soon - ${supplierName} - ${insurance.insuranceType}`,
              description: `${insurance.insuranceType} insurance for ${supplierName} expires on ${expiryDate}. Immediate action required to obtain updated documentation.`,
              status: 'To Do',
              priority: 'High',
              dueDate: new Date(insurance.expiryDate!),
              assigneeId: assigneeUserId,
              referenceType: 'insurance_expiry_7',
              referenceId: insurance.id,
            });
            
            console.log(`[ReminderProcessor] Created 7-day URGENT expiry task for ${supplierName} - ${insurance.insuranceType}`);
          }
        }

        // Process contact-based supplier insurances (new system)
        const contactExpiringIn30Days = await storage.getExpiringContactInsurances(company.id, 30);
        const contactExpiringIn7Days = await storage.getExpiringContactInsurances(company.id, 7);
        
        const contactExpiring30NotYet7 = contactExpiringIn30Days.filter(
          ins => !contactExpiringIn7Days.some(i7 => i7.id === ins.id)
        );
        
        for (const insurance of contactExpiring30NotYet7) {
          const existingTask = await storage.findTaskByReference(
            company.id,
            'contact_insurance_expiry_30',
            insurance.id
          );
          
          if (!existingTask) {
            const contactName = insurance.contact.name || 'Unknown Supplier';
            const expiryDate = format(new Date(insurance.expiryDate!), 'dd/MM/yyyy');
            
            await storage.createTask({
              companyId: company.id,
              title: `Insurance Expiry Warning: ${contactName} - ${insurance.insuranceType}`,
              description: `${insurance.insuranceType} insurance for ${contactName} expires on ${expiryDate}. Please ensure the supplier provides updated insurance documentation.`,
              status: 'To Do',
              priority: 'Medium',
              dueDate: new Date(insurance.expiryDate!),
              assigneeId: assigneeUserId,
              referenceType: 'contact_insurance_expiry_30',
              referenceId: insurance.id,
            });
            
            console.log(`[ReminderProcessor] Created 30-day expiry task for contact ${contactName} - ${insurance.insuranceType}`);
          }
        }
        
        for (const insurance of contactExpiringIn7Days) {
          const existingTask = await storage.findTaskByReference(
            company.id,
            'contact_insurance_expiry_7',
            insurance.id
          );
          
          if (!existingTask) {
            const contactName = insurance.contact.name || 'Unknown Supplier';
            const expiryDate = format(new Date(insurance.expiryDate!), 'dd/MM/yyyy');
            
            await storage.createTask({
              companyId: company.id,
              title: `URGENT: Insurance Expiring Soon - ${contactName} - ${insurance.insuranceType}`,
              description: `${insurance.insuranceType} insurance for ${contactName} expires on ${expiryDate}. Immediate action required to obtain updated documentation.`,
              status: 'To Do',
              priority: 'High',
              dueDate: new Date(insurance.expiryDate!),
              assigneeId: assigneeUserId,
              referenceType: 'contact_insurance_expiry_7',
              referenceId: insurance.id,
            });
            
            console.log(`[ReminderProcessor] Created 7-day URGENT expiry task for contact ${contactName} - ${insurance.insuranceType}`);
          }
        }
      } catch (companyError) {
        console.error(`[ReminderProcessor] Error processing insurance expiry for company ${company.id}:`, companyError);
      }
    }
    
    lastInsuranceCheckDate = today;
    console.log("[ReminderProcessor] Insurance expiry check completed");
  } catch (error) {
    console.error("[ReminderProcessor] Error in insurance expiry check:", error);
  }
}

/**
 * Process recurring task templates for all companies.
 * Generates tasks for the current week from active recurring templates.
 * Runs once daily to ensure tasks are created for each new week.
 */
export async function processRecurringTaskTemplates() {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  // Only run once per day
  if (lastRecurringTasksCheckDate === today) {
    return;
  }
  
  console.log("[ReminderProcessor] Processing recurring task templates...");
  
  try {
    const companies = await storage.getAllCompanies();
    let totalGenerated = 0;
    
    for (const company of companies) {
      try {
        const result = await storage.generateRecurringTasks(company.id);
        if (result.generated > 0) {
          console.log(`[ReminderProcessor] Generated ${result.generated} recurring tasks for company ${company.id}`);
          totalGenerated += result.generated;
        }
      } catch (companyError) {
        console.error(`[ReminderProcessor] Error generating recurring tasks for company ${company.id}:`, companyError);
      }
    }
    
    lastRecurringTasksCheckDate = today;
    console.log(`[ReminderProcessor] Recurring task processing completed. Total generated: ${totalGenerated}`);
  } catch (error) {
    console.error("[ReminderProcessor] Error in recurring task processing:", error);
  }
}
