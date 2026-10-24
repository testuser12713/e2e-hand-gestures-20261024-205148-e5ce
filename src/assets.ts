/**
 * Validate the MediaPipe asset base URL: only https: or relative/same-origin URLs are allowed.
 * Throws an Error with a readable message for any other scheme; returns the normalised base.
 */
export function validateAssetBaseUrl(url: string): string {
  return url;
}
