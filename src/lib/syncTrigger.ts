export type SyncRunner = () => Promise<unknown>

let runner: SyncRunner | null = null

/** Register the application coordinator without creating a store → hook edge. */
export function registerSyncRunner(nextRunner: SyncRunner): () => void {
  runner = nextRunner
  return () => {
    if (runner === nextRunner) runner = null
  }
}

/** Store-facing signal. A missing runner is valid before the root lifecycle mounts. */
export async function requestSync(): Promise<void> {
  if (!runner) return
  await runner()
}
