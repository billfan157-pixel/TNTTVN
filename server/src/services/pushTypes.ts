export interface AppPushPayload {
  title: string
  body: string
  url?: string
}

export interface NativeProviderResult {
  sent: number
  failed: number
  deadTokens: string[]
}
