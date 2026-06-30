export class BrowserNotificationService {
  private static permissionGranted = false;

  static async requestPermission(): Promise<boolean> {
    if (!("Notification" in window)) {
      console.log("Browser doesn't support notifications");
      return false;
    }

    if (Notification.permission === "granted") {
      this.permissionGranted = true;
      return true;
    }

    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      this.permissionGranted = permission === "granted";
      return this.permissionGranted;
    }

    return false;
  }

  static async showNotification(
    title: string,
    options: {
      body?: string;
      icon?: string;
      badge?: string;
      tag?: string;
      data?: any;
    } = {}
  ): Promise<void> {
    if (!this.permissionGranted && Notification.permission !== "granted") {
      const granted = await this.requestPermission();
      if (!granted) return;
    }

    if (Notification.permission === "granted") {
      const notification = new Notification(title, {
        ...options,
        icon: options.icon || "/icon.png",
        badge: options.badge || "/badge.png",
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }

  static async showEmailNotification(params: {
    from: string;
    subject: string;
    linkType?: {
      provider: string;
      type: string;
      icon: string;
      color: string;
    };
    t?: (key: string, params?: any) => string;
  }): Promise<void> {
    const { from, subject, linkType, t } = params;
    
    let title = t ? t('notifications.newEmail') : "📧 New email received";
    let body = `${t ? t('notifications.from') : 'From'}: ${from}\n${subject}`;

    if (linkType) {
      const typeEmoji = {
        verification: "✅",
        reset: "🔑",
        confirmation: "✔️",
        action: "🔗",
        unknown: "📨",
      }[linkType.type] || "📨";

      title = `${typeEmoji} ${t ? t('notifications.emailFrom', { provider: linkType.provider }) : `Email from ${linkType.provider}`}`;
      const typeLabel = this.getTypeLabel(linkType.type, t);
      body = `${t ? t('notifications.type') : 'Type'}: ${typeLabel}\n${subject}`;
    }

    await this.showNotification(title, {
      body,
      tag: "new-email",
      data: { from, subject, linkType },
    });
  }

  private static getTypeLabel(type: string, t?: (key: string) => string): string {
    if (t) {
      return t(`validation.types.${type}`);
    }
    const labels: Record<string, string> = {
      verification: "Verification",
      reset: "Reset",
      confirmation: "Confirmation",
      action: "Action",
      unknown: "Link",
    };
    return labels[type] || "Email";
  }

  static isSupported(): boolean {
    return "Notification" in window;
  }

  static getPermissionStatus(): NotificationPermission {
    return Notification.permission;
  }
}
