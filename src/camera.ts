const KEYBOARD_NOTE = 'Keyboard and mouse still work.';

/** Readable message for a denied permission (text from design/mockups/demo-integrate.html:38). */
export const CAMERA_DENIED_MESSAGE =
  "Camera access was denied. Allow the camera in your browser's site settings and start again. " +
  KEYBOARD_NOTE;

function errorName(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = (err as { name: unknown }).name;
    return typeof name === 'string' ? name : '';
  }
  return '';
}

/**
 * Ask for the user-facing camera. Call only from an explicit user action (start button / toggle key).
 * Nothing is requested until this function is called.
 * Rejects with an Error carrying a readable message.
 */
export async function openCamera(): Promise<MediaStream> {
  const md =
    typeof navigator !== 'undefined' && navigator ? navigator.mediaDevices : undefined;
  if (!md || typeof md.getUserMedia !== 'function') {
    throw new Error(
      `This browser offers no camera access here (a secure https page is required). ${KEYBOARD_NOTE}`,
    );
  }
  try {
    return await md.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  } catch (err) {
    const e = new Error(describeCameraError(err));
    const name = errorName(err);
    if (name) e.name = name;
    return Promise.reject(e);
  }
}

/** Release the camera: calls `track.stop()` on every track of `stream`. Tolerates null-ish input. */
export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream || typeof stream.getTracks !== 'function') return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // a track that refuses to stop must not keep the others running
    }
  }
}

/** Turn any camera error into a plain-text sentence a user can read. */
export function describeCameraError(err: unknown): string {
  switch (errorName(err)) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return CAMERA_DENIED_MESSAGE;
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return `No camera was found. Connect a camera and start again. ${KEYBOARD_NOTE}`;
    case 'NotReadableError':
    case 'TrackStartError':
      return `The camera is in use by another application. Close it and start again. ${KEYBOARD_NOTE}`;
    default:
      return `The camera could not be started. ${KEYBOARD_NOTE}`;
  }
}
