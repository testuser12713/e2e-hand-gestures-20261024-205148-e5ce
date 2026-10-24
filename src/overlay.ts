import type { PreviewPosition, StatusType } from './types';

/** Options of the injected overlay. */
export interface OverlayOptions {
  showPreview: boolean;
  previewPosition: PreviewPosition;
  mirror: boolean;
  /** Called when the on/off button is pressed. */
  onToggleClick: () => void;
}

/** The overlay injected into the page (preview, status badge, on/off button, gesture flash). */
export interface Overlay {
  setStatus(s: StatusType, message?: string): void;
  flashGesture(name: string): void;
  attachStream(stream: MediaStream | null): void;
  getVideoElement(): HTMLVideoElement;
  destroy(): void;
}

/** Create the overlay. All text is set via textContent. */
export function createOverlay(opts: OverlayOptions): Overlay {
  void opts;
  const video = document.createElement('video');
  return {
    setStatus(s: StatusType, message?: string): void {
      void s;
      void message;
    },
    flashGesture(name: string): void {
      void name;
    },
    attachStream(stream: MediaStream | null): void {
      void stream;
    },
    getVideoElement(): HTMLVideoElement {
      return video;
    },
    destroy(): void {},
  };
}
