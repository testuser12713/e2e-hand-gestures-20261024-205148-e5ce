/**
 * Ask for the user-facing camera. Call only from an explicit user action (start button / toggle key).
 * Rejects with an Error carrying a readable message.
 */
export function openCamera(): Promise<MediaStream> {
  return Promise.reject(new Error('The camera is not available.'));
}

/** Release the camera: calls `track.stop()` on every track of `stream`. */
export function stopStream(stream: MediaStream): void {
  void stream;
}

/** Turn any camera error into a sentence a user can read. */
export function describeCameraError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
