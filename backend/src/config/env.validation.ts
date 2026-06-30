import Joi from 'joi';

const weakSecret = /^(replace-me|local-|your_)/i;

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  DEV_GAME_MODE: Joi.boolean().default(false),
  DEV_INFRA_OPTIONAL: Joi.boolean().default(false),
  DEV_MANUAL_START: Joi.boolean().default(false),
  PORT: Joi.number().port().default(3000),
  FRONTEND_ORIGIN: Joi.string().default('http://localhost:4200'),
  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().optional(),
  JWT_ACCESS_SECRET: Joi.string().min(24).required(),
  JWT_ONBOARDING_SECRET: Joi.string().min(24).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  AUTH_REFRESH_TTL_SECONDS: Joi.number().integer().positive().default(604800),
  AUTH_PRIMARY_DOMAIN: Joi.string().required(),
  AUTH_PRIMARY_URI: Joi.string().uri().required(),
  AUTH_ALLOWED_DOMAINS: Joi.string().required(),
  GOOGLE_CLIENT_ID: Joi.string().required(),
  REWARD_AMOUNT: Joi.number().min(0).default(1),
  REWARD_ASSET: Joi.string().default('TA_BETA'),
  ADMIN_USER_IDS: Joi.string().optional().default(''),
}).custom((value, helpers) => {
  if (value.NODE_ENV === 'production') {
    if (value.DEV_GAME_MODE || value.DEV_INFRA_OPTIONAL || value.DEV_MANUAL_START) {
      return helpers.error('any.invalid', {
        message: 'Development bypass flags cannot be enabled in production',
      });
    }
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_ONBOARDING_SECRET']) {
      if (weakSecret.test(value[key])) {
        return helpers.error('any.invalid', { message: `${key} cannot use a development default` });
      }
    }
  }
  return value;
});
