import { Camera, Download, Images, Loader2, Trash2, UploadCloud, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  InspectorAxisGroup,
  InspectorPanel,
  InspectorRangeNumberField,
  InspectorSelectField,
  InspectorTextField,
} from "./InspectorControls";
import { downloadDataUrl } from "../io/screenshotExport";
import { dataUrlToFile, uploadMivoFile } from "../mivo/mivoClient";
import { useMivoStore } from "../mivo/mivoStore";
import { requestViewportCapture } from "../io/captureBridge";
import { getDirectorObjectFocusTarget, isCameraFocusableObject } from "../schema/cameraTarget";
import type { DirectorCameraCapture } from "../schema/directorProject";
import { useDirectorStore } from "../store/directorStore";

const VIEWER_ZOOM_MIN = 0.25;
const VIEWER_ZOOM_MAX = 5;
const VIEWER_ZOOM_STEP = 0.25;

function replaceAxis(tuple: [number, number, number], axis: 0 | 1 | 2, value: number): [number, number, number] {
  return tuple.map((item, index) => (index === axis ? value : item)) as [number, number, number];
}

export function CameraPanel() {
  const activeTab = useDirectorStore((state) => state.cameraInspectorTab);
  const setActiveTab = useDirectorStore((state) => state.setCameraInspectorTab);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [uploadingCaptureId, setUploadingCaptureId] = useState<string | null>(null);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [hoveredCaptureId, setHoveredCaptureId] = useState<string | null>(null);
  const [viewerCapture, setViewerCapture] = useState<DirectorCameraCapture | null>(null);
  const [viewerScale, setViewerScale] = useState(1);
  const [viewerOffset, setViewerOffset] = useState({ x: 0, y: 0 });
  const [viewerDragging, setViewerDragging] = useState(false);
  const viewerDragStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const camera = useDirectorStore((state) =>
    state.project.cameras.find((item) => item.id === state.project.activeCameraId)
  );
  const cameras = useDirectorStore((state) => state.project.cameras);
  const objects = useDirectorStore((state) => state.project.objects);
  const setActiveCamera = useDirectorStore((state) => state.setActiveCamera);
  const updateCamera = useDirectorStore((state) => state.updateCamera);
  const addCameraCaptures = useDirectorStore((state) => state.addCameraCaptures);

  if (!camera) return null;
  const currentCamera = camera;
  const cameraCaptureGroups = useMemo(
    () =>
      cameras.map((item) => ({
        camera: item,
        captures: item.captures ?? [],
      })),
    [cameras]
  );
  const hasAnyCameraCapture = cameraCaptureGroups.some((group) => group.captures.length > 0);
  const focusableObjects = useMemo(() => objects.filter(isCameraFocusableObject), [objects]);
  const targetSelectValue =
    currentCamera.targetMode === "object" && currentCamera.targetObjectId
      ? `object:${currentCamera.targetObjectId}`
      : "manual";

  useEffect(() => {
    if (!viewerCapture) {
      setViewerScale(1);
      setViewerOffset({ x: 0, y: 0 });
      setViewerDragging(false);
      viewerDragStateRef.current = null;
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setViewerCapture(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewerCapture]);

  useEffect(() => {
    if (viewerScale <= 1) {
      setViewerOffset({ x: 0, y: 0 });
      setViewerDragging(false);
      viewerDragStateRef.current = null;
    }
  }, [viewerScale]);

  useEffect(() => {
    if (!viewerDragging) {
      return;
    }

    function handleMouseMove(event: MouseEvent) {
      const dragState = viewerDragStateRef.current;
      if (!dragState) {
        return;
      }

      setViewerOffset({
        x: dragState.originX + event.clientX - dragState.startX,
        y: dragState.originY + event.clientY - dragState.startY,
      });
    }

    function handleMouseUp() {
      setViewerDragging(false);
      viewerDragStateRef.current = null;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [viewerDragging]);

  const clampViewerScale = useCallback((value: number) => {
    return Math.min(VIEWER_ZOOM_MAX, Math.max(VIEWER_ZOOM_MIN, value));
  }, []);

  const updateViewerScale = useCallback((updater: (currentScale: number) => number) => {
    setViewerScale((currentScale) => clampViewerScale(Number(updater(currentScale).toFixed(2))));
  }, [clampViewerScale]);

  async function handleCameraCapture() {
    setCaptureError(null);
    setCaptureBusy(true);

    try {
      const results = await requestViewportCapture({
        preset: "current",
        source: "camera-panel",
        cameraId: currentCamera.id,
      });
      const preview = results[0];
      if (preview) {
        addCameraCaptures(currentCamera.id, [preview.dataUrl]);
      }
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "机位截图失败");
    } finally {
      setCaptureBusy(false);
    }
  }

  async function handleUploadCapture(capture: DirectorCameraCapture) {
    const session = useMivoStore.getState().getSession();

    if (!session) {
      setCaptureError("请先在底部工具栏连接 Mivo");
      return;
    }

    setCaptureError(null);
    setCaptureNotice(null);
    setUploadingCaptureId(capture.id);

    try {
      const file = await dataUrlToFile(capture.dataUrl, `${capture.name}.png`);

      await uploadMivoFile(session, file);
      setCaptureNotice(`已上传到 Mivo：${capture.name}.png`);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "上传到 Mivo 失败");
    } finally {
      setUploadingCaptureId(null);
    }
  }

  function handleDeleteCapture(captureId: string) {
    const captureCamera = cameras.find((item) => (item.captures ?? []).some((capture) => capture.id === captureId));
    if (!captureCamera) return;

    const nextCaptures = (captureCamera.captures ?? []).filter((item) => item.id !== captureId);
    updateCamera(captureCamera.id, {
      captures: nextCaptures,
      lastCaptureUrl: nextCaptures[nextCaptures.length - 1]?.dataUrl ?? null,
    });
    setHoveredCaptureId((current) => (current === captureId ? null : current));
    setViewerCapture((current) => (current?.id === captureId ? null : current));
  }

  function handleClearAllCaptures() {
    cameras.forEach((item) => {
      if ((item.captures ?? []).length === 0 && !item.lastCaptureUrl) return;

      updateCamera(item.id, {
        captures: [],
        lastCaptureUrl: null,
      });
    });
    setHoveredCaptureId(null);
    setViewerCapture(null);
  }

  function handleViewerZoom(direction: "in" | "out") {
    updateViewerScale((current) => current + (direction === "in" ? VIEWER_ZOOM_STEP : -VIEWER_ZOOM_STEP));
  }

  function handleViewerWheel(event: React.WheelEvent<HTMLImageElement>) {
    event.preventDefault();
    event.stopPropagation();
    updateViewerScale((current) => current + (event.deltaY < 0 ? VIEWER_ZOOM_STEP : -VIEWER_ZOOM_STEP));
  }

  function handleViewerMouseDown(event: React.MouseEvent<HTMLImageElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (viewerScale <= 1) {
      return;
    }

    viewerDragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: viewerOffset.x,
      originY: viewerOffset.y,
    };
    setViewerDragging(true);
  }

  function closeViewer() {
    setViewerCapture(null);
  }

  function handleTargetSelection(value: string) {
    if (value === "manual") {
      updateCamera(currentCamera.id, {
        targetMode: "manual",
        targetObjectId: null,
      });
      return;
    }

    const objectId = value.replace(/^object:/, "");
    const targetObject = focusableObjects.find((item) => item.id === objectId);

    if (!targetObject) {
      updateCamera(currentCamera.id, {
        targetMode: "manual",
        targetObjectId: null,
      });
      return;
    }

    updateCamera(currentCamera.id, {
      targetMode: "object",
      targetObjectId: targetObject.id,
      target: getDirectorObjectFocusTarget(targetObject),
    });
  }

  function updateManualTarget(axis: 0 | 1 | 2, value: string) {
    updateCamera(currentCamera.id, {
      targetMode: "manual",
      targetObjectId: null,
      target: replaceAxis(currentCamera.target, axis, Number(value)),
    });
  }

  function renderCaptureCards(captureList: DirectorCameraCapture[]) {
    return (
      <div className="camera-capture-grid" aria-label="相机截图列表">
        {captureList.map((capture) => {
          const captureActive = hoveredCaptureId === capture.id;

          return (
            <div key={capture.id} className="camera-capture-card">
              <div
                className="camera-capture-thumb-wrap"
                onClick={() => setViewerCapture(capture)}
                onMouseEnter={() => setHoveredCaptureId(capture.id)}
                onMouseLeave={() => setHoveredCaptureId((current) => (current === capture.id ? null : current))}
              >
                <img className="camera-capture-thumb" alt={`${capture.name} 缩略图`} src={capture.dataUrl} />
                <div
                  aria-label={`${capture.name} 缩略图操作`}
                  className={`camera-capture-actions${captureActive ? " is-visible" : ""}`}
                  role="group"
                >
                  <button
                    aria-label={`删除截图 ${capture.name}`}
                    className="camera-capture-action"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteCapture(capture.id);
                    }}
                  >
                    <Trash2 aria-hidden="true" size={14} strokeWidth={1.9} />
                  </button>
                  <button
                    aria-label={`下载截图 ${capture.name}`}
                    className="camera-capture-action"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      downloadDataUrl(capture.dataUrl, `${capture.name}.png`);
                    }}
                  >
                    <Download aria-hidden="true" size={14} strokeWidth={1.9} />
                  </button>
                  <button
                    aria-label={`上传截图 ${capture.name}`}
                    className="camera-capture-action"
                    disabled={uploadingCaptureId === capture.id}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleUploadCapture(capture);
                    }}
                  >
                    {uploadingCaptureId === capture.id ? (
                      <Loader2 aria-hidden="true" className="mivo-spin" size={14} strokeWidth={1.9} />
                    ) : (
                      <UploadCloud aria-hidden="true" size={14} strokeWidth={1.9} />
                    )}
                  </button>
                </div>
              </div>
              <span className="camera-capture-name">{capture.name}</span>
            </div>
          );
        })}
      </div>
    );
  }

  function renderCaptureEmptyState() {
    return (
      <div className="camera-capture-empty object-search-empty-state" role="status" aria-label="暂无摄像机截图">
        <span className="object-search-empty-icon" data-testid="camera-capture-empty-icon">
          <Images aria-hidden="true" size={16} strokeWidth={1.8} />
        </span>
        <span>暂无摄像机截图</span>
      </div>
    );
  }

  function renderAllCameraCaptures() {
    return (
      <div className="camera-capture-overview">
        <div className="camera-capture-overview-scroll">
          {hasAnyCameraCapture ? (
            cameraCaptureGroups
              .filter((group) => group.captures.length > 0)
              .map((group) => (
                <section
                  key={group.camera.id}
                  aria-label={`${group.camera.name}截图`}
                  className="camera-capture-group"
                >
                  {renderCaptureCards(group.captures)}
                </section>
              ))
          ) : (
            renderCaptureEmptyState()
          )}
        </div>
      </div>
    );
  }

  function renderCaptureOverviewFooter() {
    if (activeTab !== "captures") {
      return null;
    }

    return (
      <div className="camera-capture-overview-footer">
        <button className="camera-capture-clear-all" type="button" onClick={handleClearAllCaptures}>
          <Trash2 aria-hidden="true" data-testid="camera-capture-clear-icon" size={14} strokeWidth={1.9} />
          <span>清空全部</span>
        </button>
        <button
          className="camera-capture-send-all viewport-toolbar-crowd-confirm"
          disabled={captureBusy}
          type="button"
          onClick={() => void handleCameraCapture()}
        >
          <Camera aria-hidden="true" data-testid="camera-capture-send-icon" size={14} strokeWidth={1.9} />
          <span>{captureBusy ? "截图生成中…" : "相机截图"}</span>
        </button>
      </div>
    );
  }

  function renderViewer() {
    if (!viewerCapture) {
      return null;
    }

    const viewerImageClassName = [
      "camera-capture-viewer-image",
      viewerScale > 1 ? "is-zoomed" : "",
      viewerDragging ? "is-dragging" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const viewer = (
      <div
        aria-label="相机截图查看器"
        className="camera-capture-viewer"
        role="dialog"
        onClick={closeViewer}
      >
        <div
          aria-label="相机截图查看器工具栏"
          className="camera-capture-viewer-toolbar"
          role="toolbar"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            aria-label="放大图片"
            className="camera-capture-viewer-tool"
            type="button"
            onClick={() => handleViewerZoom("in")}
          >
            <ZoomIn aria-hidden="true" size={18} strokeWidth={2} />
          </button>
          <button
            aria-label="缩小图片"
            className="camera-capture-viewer-tool"
            type="button"
            onClick={() => handleViewerZoom("out")}
          >
            <ZoomOut aria-hidden="true" size={18} strokeWidth={2} />
          </button>
          <button
            aria-label="下载图片"
            className="camera-capture-viewer-tool"
            type="button"
            onClick={() => downloadDataUrl(viewerCapture.dataUrl, `${viewerCapture.name}.png`)}
          >
            <Download aria-hidden="true" size={18} strokeWidth={2} />
          </button>
          <button
            aria-label="关闭相机截图查看器"
            className="camera-capture-viewer-tool camera-capture-viewer-close"
            type="button"
            onClick={closeViewer}
          >
            <X aria-hidden="true" size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="camera-capture-viewer-stage">
          <img
            className={viewerImageClassName}
            alt={`${viewerCapture.name} 查看大图`}
            src={viewerCapture.dataUrl}
            style={{ transform: `translate(${viewerOffset.x}px, ${viewerOffset.y}px) scale(${viewerScale})` }}
            onClick={(event) => event.stopPropagation()}
            onWheel={handleViewerWheel}
            onMouseDown={handleViewerMouseDown}
            draggable={false}
          />
        </div>
      </div>
    );

    return typeof document === "undefined" ? viewer : createPortal(viewer, document.body);
  }

  return (
    <InspectorPanel
      title="摄像机"
      ariaLabel="摄像机右侧属性面板"
      className={activeTab === "captures" ? "camera-inspector-captures" : undefined}
      footer={renderCaptureOverviewFooter()}
      tabs={[
        { label: "属性", active: activeTab === "properties", onClick: () => setActiveTab("properties") },
        { label: "摄像机截图", active: activeTab === "captures", onClick: () => setActiveTab("captures") },
      ]}
    >
      {activeTab === "properties" ? (
        <>
          <InspectorTextField
            label="名称"
            ariaLabel="机位名称"
            value={currentCamera.name}
            onChange={(value) => updateCamera(currentCamera.id, { name: value })}
          />
          <InspectorSelectField
            label="切换机位"
            ariaLabel="切换机位"
            value={currentCamera.id}
            onChange={(value) => setActiveCamera(value)}
          >
            {cameras.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </InspectorSelectField>
          <InspectorAxisGroup
            label="位置"
            axes={[
              {
                axis: "X",
                ariaLabel: "机位位置 X",
                value: currentCamera.transform.position[0],
                onChange: (value) =>
                  updateCamera(currentCamera.id, {
                    transform: {
                      ...currentCamera.transform,
                      position: replaceAxis(currentCamera.transform.position, 0, Number(value)),
                    },
                  }),
              },
              {
                axis: "Y",
                ariaLabel: "机位位置 Y",
                value: currentCamera.transform.position[1],
                onChange: (value) =>
                  updateCamera(currentCamera.id, {
                    transform: {
                      ...currentCamera.transform,
                      position: replaceAxis(currentCamera.transform.position, 1, Number(value)),
                    },
                  }),
              },
              {
                axis: "Z",
                ariaLabel: "机位位置 Z",
                value: currentCamera.transform.position[2],
                onChange: (value) =>
                  updateCamera(currentCamera.id, {
                    transform: {
                      ...currentCamera.transform,
                      position: replaceAxis(currentCamera.transform.position, 2, Number(value)),
                    },
                  }),
              },
            ]}
          />
          <InspectorSelectField
            label="注视目标"
            ariaLabel="注视目标模式"
            value={targetSelectValue}
            onChange={handleTargetSelection}
          >
            <option value="manual">手动坐标</option>
            {focusableObjects.map((item) => (
              <option key={item.id} value={`object:${item.id}`}>
                {item.name}
              </option>
            ))}
          </InspectorSelectField>
          <InspectorAxisGroup
            label="注视坐标"
            axes={[
              {
                axis: "X",
                ariaLabel: "注视坐标 X",
                value: currentCamera.target[0],
                onChange: (value) => updateManualTarget(0, value),
              },
              {
                axis: "Y",
                ariaLabel: "注视坐标 Y",
                value: currentCamera.target[1],
                onChange: (value) => updateManualTarget(1, value),
              },
              {
                axis: "Z",
                ariaLabel: "注视坐标 Z",
                value: currentCamera.target[2],
                onChange: (value) => updateManualTarget(2, value),
              },
            ]}
          />
          <InspectorRangeNumberField
            label="视野角度 (FOV)"
            rangeAriaLabel="机位 FOV 滑杆"
            numberAriaLabel="机位 FOV"
            max="120"
            min="10"
            step="0.1"
            value={currentCamera.fov}
            onValueChange={(value) => updateCamera(currentCamera.id, { fov: Number(value) })}
          />
        </>
      ) : (
        <div className="camera-capture-tab">
          {captureError || captureNotice ? (
            <div
              className={`camera-capture-toast${captureError ? " is-error" : " is-success"}`}
              role="status"
            >
              {captureError ?? captureNotice}
            </div>
          ) : null}
          {renderAllCameraCaptures()}
        </div>
      )}
      {renderViewer()}
    </InspectorPanel>
  );
}
