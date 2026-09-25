export interface WorkerTrafficEnv {
  OPS_TOKEN?: string
  CATEVIA_PROXY_SHARED_SECRET?: string
  CATEVIA_TRAFFIC_ENABLED?: string
  APP_RELEASE_ID?: string
}

export type WorkerTrafficGateResult =
  | { request: Request; response?: never }
  | { response: Response; request?: never }

export function gateWorkerRequest(request: Request, env: WorkerTrafficEnv): WorkerTrafficGateResult
