// Herramientas de desarrollo (Ajustes → Desarrollo, reloj simulado).
// Activas en desarrollo y en el APK de pruebas (`make debug-local-apk`, EXPO_PUBLIC_DEV_TOOLS=1).
export const DEV_TOOLS = __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === '1';
