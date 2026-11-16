// Notifications service (Receive Winner Notification) — real API since Sprint 4.
import { api } from '../api.js';
import { emitDataChange } from '../lib/events.js';

export async function listNotifications() {
  const data = await api('/notifications');
  return data.notifications;
}

export async function unreadNotificationCount() {
  const data = await api('/notifications/unread-count');
  return data.count;
}

export async function markAllNotificationsRead() {
  await api('/notifications/read-all', { method: 'POST' });
  emitDataChange();
}
