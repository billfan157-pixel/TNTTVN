export const CORE_SECRETS = [
  'TURSO_URL', 'TURSO_AUTH_TOKEN', 'JWT_SECRET', 'JWT_REFRESH_SECRET',
  'REPORT_HMAC_SECRET', 'OPS_TOKEN', 'BACKUP_ENCRYPTION_KEY',
  'SUPER_ADMIN_ID', 'CATEVIA_PROXY_SHARED_SECRET',
]

export const WEB_PUSH_SECRETS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']
export const APNS_SECRETS = ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY']
export const FCM_SECRET = 'FIREBASE_SERVICE_ACCOUNT_JSON'
export const ALL_SECRETS = [...CORE_SECRETS, ...WEB_PUSH_SECRETS, FCM_SECRET, ...APNS_SECRETS]

function missingApns(names) {
  return APNS_SECRETS.some(key => names.has(key))
    ? APNS_SECRETS.filter(key => !names.has(key))
    : []
}

export function evaluateProductionSecretInventory(names) {
  const available = new Set(names)
  const required = [...CORE_SECRETS, ...WEB_PUSH_SECRETS]
  const missing = required.filter(key => !available.has(key))
  const incompleteNative = missingApns(available)
  return {
    ok: missing.length === 0 && incompleteNative.length === 0,
    required: required.length,
    missing,
    incompleteNative,
    nativeConfigured: {
      android: available.has(FCM_SECRET),
      ios: APNS_SECRETS.every(key => available.has(key)),
    },
  }
}

export function selectProductionSecretUploadKeys(values, providerMode) {
  if ([...values.keys()].some(key => !ALL_SECRETS.includes(key))) {
    throw new Error('Unexpected production secret name')
  }
  const required = providerMode ? WEB_PUSH_SECRETS : CORE_SECRETS
  if (required.some(key => !values.get(key))) {
    throw new Error('Missing production secret name')
  }
  if (!providerMode) return CORE_SECRETS

  for (const key of [FCM_SECRET, ...APNS_SECRETS]) {
    if (values.has(key) && !values.get(key)) throw new Error(`Empty optional production secret: ${key}`)
  }
  const present = new Set([...values].filter(([, value]) => Boolean(value)).map(([key]) => key))
  if (missingApns(present).length > 0) throw new Error('Incomplete APNs secret group')
  return [
    ...WEB_PUSH_SECRETS,
    ...(present.has(FCM_SECRET) ? [FCM_SECRET] : []),
    ...(present.has(APNS_SECRETS[0]) ? APNS_SECRETS : []),
  ]
}
