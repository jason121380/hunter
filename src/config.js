function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || '',
  sessionSecret: process.env.SESSION_SECRET || process.env.ADMIN_KEY || '',
  bootstrapMetaOnStart: bool(process.env.BOOTSTRAP_META_ON_START, false),
  defaultAdmin: {
    username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
    password: process.env.DEFAULT_ADMIN_PASSWORD || '',
    rotate: bool(process.env.DEFAULT_ADMIN_PASSWORD_ROTATE, false),
  },
  meta: {
    accessToken: process.env.META_ACCESS_TOKEN || '',
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    apiVersion: process.env.META_API_VERSION || 'v26.0',
  },
};
