import "./styles/index.css";
import { useEffect } from "react";
import { Box, Camera } from "lucide-react";
import { DirectorDeskShell } from "./app/layout/DirectorDeskShell";
import { DirectorCanvas } from "./editor/canvas/DirectorCanvas";
import { initDirectorDeskHostBridge } from "./editor/io/hostBridge";
import { useDirectorStore } from "./editor/store/directorStore";

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export default function App() {
  const viewMode = useDirectorStore((state) => state.viewMode);
  const setViewMode = useDirectorStore((state) => state.setViewMode);

  useEffect(() => {
    initDirectorDeskHostBridge();
    window.parent?.postMessage({ type: "storyai:director-desk-ready" }, window.location.origin);
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
      </div>
    </div>
  );
}
