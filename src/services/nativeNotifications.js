import { Capacitor } from '@capacitor/core';
import { studentsApi } from '@/services/studentsApi';
import { requestNativeNotificationPermission } from '@/lib/nativeNotificationPermission';
import { notificationRoles } from '../../shared/notification-roles.js';

let device = null;
export const isNativeNotificationsAvailable = () => Capacitor.isNativePlatform() && notificationRoles.includes(localStorage.getItem('wajeh_role'));

export async function listenForDeviceNotifications({ onNotification, onOpen, onError }) {
  if (!isNativeNotificationsAvailable()) return () => {};
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const handles = [];
  try {
    handles.push(await PushNotifications.addListener('registration', ({ value }) => {
      device = { platform: Capacitor.getPlatform(), token: value };
      void studentsApi.registerNotificationDevice(device).catch(() => onError('تعذر تسجيل الجهاز للإشعارات.'));
    }));
    handles.push(await PushNotifications.addListener('registrationError', () => onError('تعذر تفعيل إشعارات الجهاز.')));
    handles.push(await PushNotifications.addListener('pushNotificationReceived', onNotification));
    handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', onOpen));
    const permission = await requestNativeNotificationPermission(PushNotifications);
    const status = await studentsApi.getPushStatus();
    if (status[Capacitor.getPlatform()] && permission.receive === 'granted') await PushNotifications.register();
    return () => { for (const handle of handles) void handle.remove(); };
  } catch (error) {
    await Promise.all(handles.map((handle) => handle.remove()));
    throw error;
  }
}

export async function enableDeviceNotifications() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const permission = await requestNativeNotificationPermission(PushNotifications);
  if (permission.receive !== 'granted') throw new Error('اسمح بالإشعارات من إعدادات الجهاز.');
  const status = await studentsApi.getPushStatus();
  if (!status[Capacitor.getPlatform()]) throw new Error('خدمة إشعارات الجهاز لم تُفعّل بعد.');
  await PushNotifications.register();
}

export async function unregisterDeviceNotifications({ unregisterDevice = studentsApi.unregisterNotificationDevice } = {}) {
  if (!Capacitor.isNativePlatform()) return;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  try { if (device) await unregisterDevice(device); }
  finally { device = null; await PushNotifications.unregister(); }
}
