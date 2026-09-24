import "./styles/index.css";
import { useEffect, useRef, useState } from "react";
import { Box, Camera } from "lucide-react";
import { DirectorDeskShell } from "./app/layout/DirectorDeskShell";
import { DirectorCanvas } from "./editor/canvas/DirectorCanvas";
import { initDirectorDeskHostBridge } from "./editor/io/hostBridge";
import { useDirectorStore } from "./editor/store/directorStore";
import { CAMERA_VIEW_INTENT_EVENT } from "./editor/canvas/viewportModeHint";

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export default function App() {
  const viewMode = useDirectorStore((state) => state.viewMode);
  const setViewMode = useDirectorStore((state) => state.setViewMode);
  const [cameraViewHintVisible, setCameraViewHintVisible] = useState(false);
  const cameraViewHintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    initDirectorDeskHostBridge();
    window.parent?.postMessage({ type: "storyai:director-desk-ready" }, window.location.origin);
  }, []);

  useEffect(() => {
    function handleCameraViewIntent() {
      // Repeated intent keeps the hint on screen, it just restarts the 2s timer.
      setCameraViewHintVisible(true);

      if (cameraViewHintTimerRef.current !== null) {
        window.clearTimeout(cameraViewHintTimerRef.current);
      }

      cameraViewHintTimerRef.current = window.setTimeout(() => {
        cameraViewHintTimerRef.current = null;
        setCameraViewHintVisible(false);
      }, 2000);
    }

    window.addEventListener(CAMERA_VIEW_INTENT_EVENT, handleCameraViewIntent);

    return () => {
      window.removeEventListener(CAMERA_VIEW_INTENT_EVENT, handleCameraViewIntent);

      if (cameraViewHintTimerRef.current !== null) {
        window.clearTimeout(cameraViewHintTimerRef.current);
        cameraViewHintTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) return;
      if (!event.metaKey && !event.ctrlKey) return;

      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        useDirectorStore.getState().copySelectedObjects();
        return;
      }

      if (key === "v") {
        event.preventDefault();
        useDirectorStore.getState().pasteClipboardObjects();
        return;
      }

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        useDirectorStore.getState().undo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="app-shell">
      <DirectorDeskShell>
        <DirectorCanvas />
      </DirectorDeskShell>
      <div className="viewport-mode-control">
        <div className="mode-toggle viewport-mode-toggle ui-segmented" role="group" aria-label="视角切换">
          <button
            className={`mode-toggle-button ui-segmented-item ${viewMode === "director" ? "ui-segmented-item-active" : ""}`}
            aria-pressed={viewMode === "director"}
            type="button"
            onClick={() => setViewMode("director")}
          >
            <Box aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>导演视角</span>
          </button>
          <button
            className={`mode-toggle-button ui-segmented-item ${viewMode === "camera" ? "ui-segmented-item-active" : ""}`}
            aria-pressed={viewMode === "camera"}
            type="button"
            onClick={() => setViewMode("camera")}
          >
            <Camera aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>机位视角</span>
          </button>
        </div>
        {cameraViewHintVisible ? (
          <p className="viewport-mode-hint" role="status">
            相机视角下，要通过右侧 tab 的属性栏进行视角调整。如果想要任意视角，请切换到导演视角。
          </p>
        ) : null}
      </div>
    </div>
  );
}
