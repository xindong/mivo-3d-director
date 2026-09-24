/**
 * Camera-view intent signal.
 *
 * OrbitControls are disabled in camera view, so any wheel/drag inside the viewport is a user
 * trying to move the scene. We surface a short hint under the view-mode switch instead of
 * silently ignoring the gesture.
 */
export const CAMERA_VIEW_INTENT_EVENT = "storyai-director-desk:camera-view-intent";

export function notifyCameraViewIntent() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(CAMERA_VIEW_INTENT_EVENT));
}
