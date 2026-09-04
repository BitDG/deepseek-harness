/** Client-safe OmniRoute lifecycle and onboarding result vocabulary. */

/** Observable state of the configured OmniRoute endpoint. */
export type OmniRoutePhase = 'unavailable' | 'stopped' | 'starting' | 'managed' | 'external' | 'failed'

/** Current OmniRoute endpoint, ownership, and model-route facts. */
export interface OmniRouteStatus {
  /** Current lifecycle phase. */
  phase: OmniRoutePhase
  /** OpenAI-compatible API endpoint written into the provider profile. */
  baseURL: string
  /** OmniRoute dashboard URL for an explicit user open action. */
  dashboardURL: string
  /** Whether the configured executable resolved on this Host. */
  executableAvailable: boolean
  /** Whether the `omniroute` provider profile currently exists. */
  connected: boolean
  /** Number of models stored in the profile, when connected. */
  modelCount?: number
  /** Actionable diagnostic for unavailable or failed states. */
  message?: string
}

/** Successful one-click start/adopt and model connection result. */
export interface OmniRouteConnectValue extends OmniRouteStatus {
  phase: 'managed' | 'external'
  connected: true
  modelCount: number
}

/** Successful stop result for a child owned by this plugin instance. */
export interface OmniRouteStopValue extends OmniRouteStatus {
  phase: 'stopped'
}
