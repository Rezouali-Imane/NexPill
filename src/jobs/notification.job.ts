import { NotificationService } from "../services/notification.service";

let notificationDispatcherTimer: NodeJS.Timeout | null = null;

/**
 * Starts a recurring background worker that dispatches scheduled notifications whose scheduledFor <= NOW.
 */
export function startNotificationDispatcher(intervalMs = 30000): void {
  if (notificationDispatcherTimer) {
    return;
  }

  // Run once immediately on start
  NotificationService.dispatchDueNotifications().catch((err) => {
    console.error("[NotificationJob] Error during startup dispatch:", err);
  });

  notificationDispatcherTimer = setInterval(async () => {
    try {
      const result = await NotificationService.dispatchDueNotifications();
      if (result.processedCount > 0) {
        console.log(
          `[NotificationJob] Processed ${result.processedCount} notifications (Delivered: ${result.deliveredCount}, Cancelled: ${result.cancelledCount}, Failed: ${result.failedCount}).`,
        );
      }
    } catch (error) {
      console.error("[NotificationJob] Execution error:", error);
    }
  }, intervalMs);

  if (
    typeof notificationDispatcherTimer === "object" &&
    notificationDispatcherTimer !== null &&
    "unref" in notificationDispatcherTimer
  ) {
    notificationDispatcherTimer.unref();
  }
}

/**
 * Stops the recurring background notification dispatcher.
 */
export function stopNotificationDispatcher(): void {
  if (notificationDispatcherTimer) {
    clearInterval(notificationDispatcherTimer);
    notificationDispatcherTimer = null;
  }
}
