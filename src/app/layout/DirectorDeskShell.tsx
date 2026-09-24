import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ObjectTreePanel } from "../../editor/panels/ObjectTreePanel";
import { RightPanel } from "../../editor/panels/RightPanel";
import { useDirectorStore } from "../../editor/store/directorStore";

type SidebarSide = "left" | "right";
type SidebarWidths = Record<SidebarSide, number | null>;
type SidebarMinimumWidths = Record<SidebarSide, number>;

type SidebarResizeDrag = {
  side: SidebarSide;
  pointerId: number;
  startX: number;
  startWidth: number;
  minWidth: number;
};

const SIDEBAR_CONTENT_INSET = 32;
const SIDEBAR_EDGE_INSET = 16;
const VIEWPORT_MIN_WIDTH = 320;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(value, maximum));
}

export function DirectorDeskShell({ children }: { children: ReactNode }) {
  const viewportPanelsCollapsed = useDirectorStore((state) => state.viewportPanelsCollapsed);
  const [sidebarWidths, setSidebarWidths] = useState<SidebarWidths>({ left: null, right: null });
  const [minimumWidths, setMinimumWidths] = useState<SidebarMinimumWidths>({ left: 220, right: 300 });
  const sidebarWidthsRef = useRef(sidebarWidths);
  sidebarWidthsRef.current = sidebarWidths;
  const leftSidebarRef = useRef<HTMLElement>(null);
  const rightSidebarRef = useRef<HTMLElement>(null);
  const resizeDragRef = useRef<SidebarResizeDrag | null>(null);

  useLayoutEffect(() => {
    function updateMinimumWidths() {
      const leftWidth = leftSidebarRef.current?.getBoundingClientRect().width;
      const rightWidth = rightSidebarRef.current?.getBoundingClientRect().width;
      if (!leftWidth || !rightWidth) return;

      setMinimumWidths((current) => {
        const next = {
          left: sidebarWidthsRef.current.left === null ? leftWidth : current.left,
          right: sidebarWidthsRef.current.right === null ? rightWidth : current.right,
        };
        return next.left === current.left && next.right === current.right ? current : next;
      });
    }

    updateMinimumWidths();
    window.addEventListener("resize", updateMinimumWidths);
    return () => window.removeEventListener("resize", updateMinimumWidths);
  }, [viewportPanelsCollapsed]);

  function getSidebarWidth(side: SidebarSide) {
    const configuredWidth = sidebarWidths[side];
    if (configuredWidth !== null) return configuredWidth;

    const sidebar = side === "left" ? leftSidebarRef.current : rightSidebarRef.current;
    return sidebar?.getBoundingClientRect().width || minimumWidths[side];
  }

  function getMaximumWidth(side: SidebarSide) {
    const oppositeSide = side === "left" ? "right" : "left";
    const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
    const maximumByCanvas =
      viewportWidth - getSidebarWidth(oppositeSide) - SIDEBAR_EDGE_INSET * 2 - VIEWPORT_MIN_WIDTH;

    return Math.round(Math.max(minimumWidths[side], Math.min(viewportWidth * 0.45, maximumByCanvas)));
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>, side: SidebarSide) {
    if (event.button !== 0) return;

    const startWidth = getSidebarWidth(side);
    resizeDragRef.current = {
      side,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
      minWidth: Math.min(minimumWidths[side], startWidth),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveResize(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = resizeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const delta = drag.side === "left" ? event.clientX - drag.startX : drag.startX - event.clientX;
    const nextWidth = clamp(drag.startWidth + delta, drag.minWidth, getMaximumWidth(drag.side));
    setSidebarWidths((current) => ({ ...current, [drag.side]: nextWidth }));
  }

  function finishResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (resizeDragRef.current?.pointerId !== event.pointerId) return;

    resizeDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, side: SidebarSide) {
    const minimumWidth = minimumWidths[side];
    const maximumWidth = getMaximumWidth(side);

    if (event.key === "Home") {
      setSidebarWidths((current) => ({ ...current, [side]: minimumWidth }));
    } else if (event.key === "End") {
      setSidebarWidths((current) => ({ ...current, [side]: maximumWidth }));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const expands = side === "left" ? event.key === "ArrowRight" : event.key === "ArrowLeft";
      const step = event.shiftKey ? 32 : 8;
      const delta = expands ? step : -step;
      const nextWidth = clamp(getSidebarWidth(side) + delta, minimumWidth, maximumWidth);
      setSidebarWidths((current) => ({ ...current, [side]: nextWidth }));
    } else {
      return;
    }

    event.preventDefault();
  }

  function renderResizeHandle(side: SidebarSide) {
    const currentWidth = Math.round(getSidebarWidth(side));
    const minWidth = Math.round(Math.min(minimumWidths[side], currentWidth));
    const maxWidth = Math.max(getMaximumWidth(side), currentWidth);

    return (
      <div
        className={"sidebar-resize-handle sidebar-resize-handle-" + side}
        role="separator"
        aria-label={"调整" + (side === "left" ? "左侧" : "右侧") + "面板宽度"}
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={currentWidth}
        aria-valuetext={currentWidth + " 像素"}
        tabIndex={0}
        onPointerDown={(event) => startResize(event, side)}
        onPointerMove={moveResize}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onLostPointerCapture={(event) => {
          if (resizeDragRef.current?.pointerId === event.pointerId) {
            resizeDragRef.current = null;
          }
        }}
        onKeyDown={(event) => handleResizeKeyDown(event, side)}
      />
    );
  }

  const shellStyle = {
    ...(sidebarWidths.left !== null && {
      "--left-sidebar-width": sidebarWidths.left + "px",
      "--left-sidebar-content-width": Math.max(0, sidebarWidths.left - SIDEBAR_CONTENT_INSET) + "px",
    }),
    ...(sidebarWidths.right !== null && {
      "--right-sidebar-width": sidebarWidths.right + "px",
      "--right-sidebar-content-width": Math.max(0, sidebarWidths.right - SIDEBAR_CONTENT_INSET) + "px",
    }),
  } as CSSProperties;

  return (
    <div
      style={shellStyle}
      className={`director-shell director-shell-fullbleed${viewportPanelsCollapsed ? " is-sidebars-collapsed" : ""}`}
    >
      <section className="viewport-column" aria-label="3D视口">
        {children}
      </section>
      <aside
        ref={leftSidebarRef}
        className="left-sidebar director-sidebar"
        aria-hidden={viewportPanelsCollapsed ? "true" : undefined}
        aria-label="场景"
      >
        <ObjectTreePanel />
      </aside>
      <aside
        ref={rightSidebarRef}
        className="right-sidebar director-sidebar"
        aria-hidden={viewportPanelsCollapsed ? "true" : undefined}
        aria-label="属性"
      >
        <RightPanel />
      </aside>
      {!viewportPanelsCollapsed ? renderResizeHandle("left") : null}
      {!viewportPanelsCollapsed ? renderResizeHandle("right") : null}
    </div>
  );
}
