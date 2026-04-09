import { storage } from "../storage";
import { getIO } from "../socketManager";

let isProcessorRunning = false;
let processorInterval: NodeJS.Timeout | null = null;

export async function processScheduledMessages() {
  if (isProcessorRunning) {
    return;
  }

  isProcessorRunning = true;
  try {
    const due = await storage.getPendingScheduledMessages();
    if (due.length === 0) {
      return;
    }

    console.log(`[ScheduledMessageProcessor] Processing ${due.length} scheduled message(s)`);

    const io = getIO();
    const sentIds: string[] = [];

    for (const message of due) {
      try {
        if (io) {
          io.to(`channel:${message.channelId}`).emit("new_message", message);
        }
        sentIds.push(message.id);
      } catch (err) {
        console.error(`[ScheduledMessageProcessor] Error broadcasting message ${message.id}:`, err);
      }
    }

    if (sentIds.length > 0) {
      await storage.markScheduledMessagesSent(sentIds);
      console.log(`[ScheduledMessageProcessor] Marked ${sentIds.length} message(s) as sent`);
    }
  } catch (error) {
    console.error("[ScheduledMessageProcessor] Error during processing:", error);
  } finally {
    isProcessorRunning = false;
  }
}

export function startScheduledMessageProcessor(intervalMinutes = 1) {
  if (processorInterval) return;

  const ms = intervalMinutes * 60 * 1000;
  console.log(`[ScheduledMessageProcessor] Starting — checking every ${intervalMinutes} minute(s)`);

  processScheduledMessages().catch(console.error);
  processorInterval = setInterval(() => {
    processScheduledMessages().catch(console.error);
  }, ms);
}
