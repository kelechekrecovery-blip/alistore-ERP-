import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const INSTALLATION_ID_KEY = 'alistore.native.installation_id';

export interface NativePushRegistration {
  status: 'registered' | 'denied' | 'unavailable' | 'error';
  token?: string;
  platform: 'ios' | 'android' | 'web' | 'unknown';
  deviceId: string;
  message?: string;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerNativePush(): Promise<NativePushRegistration> {
  const platform = nativePlatform();
  const deviceId = await getInstallationId(platform);

  if (platform === 'web') {
    return { status: 'unavailable', platform, deviceId, message: 'Push доступен в iOS/Android сборке' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'AliStore orders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C7F464',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const requested = existing.status === 'granted'
    ? existing
    : await Notifications.requestPermissionsAsync();
  if (requested.status !== 'granted') {
    return { status: 'denied', platform, deviceId, message: 'Уведомления выключены' };
  }

  const projectId = pushProjectId();
  if (!projectId) {
    return { status: 'unavailable', platform, deviceId, message: 'EAS projectId не настроен' };
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return { status: 'registered', token, platform, deviceId };
  } catch (cause) {
    return {
      status: 'error',
      platform,
      deviceId,
      message: cause instanceof Error ? cause.message : 'Не удалось получить push token',
    };
  }
}

function pushProjectId(): string | undefined {
  const extraProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof extraProjectId === 'string' && extraProjectId.length > 0) return extraProjectId;
  if (Constants.easConfig?.projectId) return Constants.easConfig.projectId;
  const envProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  return envProjectId && envProjectId.length > 0 ? envProjectId : undefined;
}

async function getInstallationId(platform: NativePushRegistration['platform']): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALLATION_ID_KEY).catch(() => null);
  if (existing) return existing;
  const model = Device.modelName?.replace(/\s+/g, '-').toLowerCase() ?? 'device';
  const next = `${platform}-${model}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await SecureStore.setItemAsync(INSTALLATION_ID_KEY, next).catch(() => undefined);
  return next;
}

function nativePlatform(): NativePushRegistration['platform'] {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') {
    return Platform.OS;
  }
  return 'unknown';
}
