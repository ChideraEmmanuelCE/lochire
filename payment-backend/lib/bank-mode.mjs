export const demoMode=env=>env.WEMA_MODE==='demo'&&env.PAYMENT_MODE==='sandbox'&&env.WEMA_ENABLED!=='true'&&env.WEMA_ENVIRONMENT!=='production';
