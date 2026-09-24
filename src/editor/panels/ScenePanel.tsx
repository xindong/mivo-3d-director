import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ImageOff, Trash2 } from "lucide-react";
import {
  InspectorColorField,
  InspectorPanel,
  InspectorRangeNumberField,
} from "./InspectorControls";
import { readPanoramaFile } from "../loaders/panoramaImport";
import { downloadMivoAsset, type MivoAsset } from "../mivo/mivoClient";
import { useMivoStore } from "../mivo/mivoStore";
import { MivoAssetPicker } from "./MivoAssetPicker";
import { MivoConnectDialog } from "./MivoConnectDialog";
import { useDirectorStore } from "../store/directorStore";

const PANORAMA_RADIUS_MIN = 10;
const PANORAMA_RADIUS_MAX = 300;
const PANORAMA_YAW_MIN = -180;
const PANORAMA_YAW_MAX = 180;
const PANORAMA_UPLOAD_ACCEPT = ".jpg,.jpeg,.png,.webp";
const SCENE_SCALE_MIN = 0.1;
const SCENE_SCALE_MAX = 3;
const SCENE_POSITION_MIN = -50;
const SCENE_POSITION_MAX = 50;
const SCENE_ROTATION_MIN = -50;
const SCENE_ROTATION_MAX = 50;
const GROUND_HEIGHT_MIN = -5;
const GROUND_HEIGHT_MAX = 5;
const BACKDROP_SCALE_MIN = 0.2;
const BACKDROP_SCALE_MAX = 3;
const BACKDROP_OFFSET_MIN = -50;
const BACKDROP_OFFSET_MAX = 50;

type SceneTabKey = "scene" | "panorama" | "ground" | "misc";

const SCENE_TABS: Array<{ key: SceneTabKey; label: string }> = [
  { key: "scene", label: "场景" },
  { key: "panorama", label: "全景" },
  { key: "ground", label: "地面" },
  { key: "misc", label: "其他" },
];

function replaceAxis(tuple: [number, number, number], axis: 0 | 1 | 2, value: number): [number, number, number] {
  return tuple.map((item, index) => (index === axis ? value : item)) as [number, number, number];
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ScenePanel() {
  const scene = useDirectorStore((state) => state.project.scene);
  const assets = useDirectorStore((state) => state.project.assets);
  const panoramaAssetId = useDirectorStore((state) => state.project.panoramaAssetId);
  const updateScene = useDirectorStore((state) => state.updateScene);
  const addImportedAsset = useDirectorStore((state) => state.addImportedAsset);
  const removePanoramaAsset = useDirectorStore((state) => state.removePanoramaAsset);
  const panoramaInputRef = useRef<HTMLInputElement>(null);
  const [panoramaError, setPanoramaError] = useState<string | null>(null);
  const [panoramaSourceMenuOpen, setPanoramaSourceMenuOpen] = useState(false);
  const [mivoPanoramaPickerOpen, setMivoPanoramaPickerOpen] = useState(false);
  const [mivoConnectOpen, setMivoConnectOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SceneTabKey>("scene");
  const [sceneScaleDraft, setSceneScaleDraft] = useState(String(scene.scale));
  const [panoramaYawDraft, setPanoramaYawDraft] = useState(String(scene.panoramaYaw));
  const [panoramaRadiusDraft, setPanoramaRadiusDraft] = useState(String(scene.panoramaRadius));
  const [groundHeightDraft, setGroundHeightDraft] = useState(String(scene.groundHeight));
  const panoramaAsset = assets.find((item) => item.id === panoramaAssetId);
  const panoramaMode = scene.panoramaProjectionMode ?? panoramaAsset?.projectionMode ?? "equirectangular";
  const backdropScale = scene.backdropScale ?? 1;
  const backdropOffset = scene.backdropOffset ?? [0, 0];

  useEffect(() => {
    setSceneScaleDraft(String(scene.scale));
  }, [scene.scale]);

  useEffect(() => {
    setPanoramaRadiusDraft(String(scene.panoramaRadius));
  }, [scene.panoramaRadius]);

  useEffect(() => {
    setPanoramaYawDraft(String(scene.panoramaYaw));
  }, [scene.panoramaYaw]);

  useEffect(() => {
    setGroundHeightDraft(String(scene.groundHeight));
  }, [scene.groundHeight]);

  function commitSceneScale(value: string) {
    const parsed = Number(value);
    const nextScale = Number.isFinite(parsed) ? clampNumber(parsed, SCENE_SCALE_MIN, SCENE_SCALE_MAX) : scene.scale;
    updateScene({ scale: nextScale });
    setSceneScaleDraft(String(nextScale));
  }

  function commitPanoramaYaw(value: string) {
    const parsed = Number(value);
    const nextYaw = Number.isFinite(parsed) ? clampNumber(parsed, PANORAMA_YAW_MIN, PANORAMA_YAW_MAX) : scene.panoramaYaw;
    updateScene({ panoramaYaw: nextYaw });
    setPanoramaYawDraft(String(nextYaw));
  }

  function commitPanoramaRadius(value: string) {
    const parsed = Number(value);
    const nextRadius = Number.isFinite(parsed)
      ? clampNumber(parsed, PANORAMA_RADIUS_MIN, PANORAMA_RADIUS_MAX)
      : scene.panoramaRadius;
    updateScene({ panoramaRadius: nextRadius });
    setPanoramaRadiusDraft(String(nextRadius));
  }

  function commitGroundHeight(value: string) {
    const parsed = Number(value);
    const nextHeight = Number.isFinite(parsed) ? clampNumber(parsed, GROUND_HEIGHT_MIN, GROUND_HEIGHT_MAX) : scene.groundHeight;
    updateScene({ groundHeight: nextHeight });
    setGroundHeightDraft(String(nextHeight));
  }

  function openPanoramaSourceMenu() {
    setPanoramaSourceMenuOpen((isOpen) => !isOpen);
  }

  function openLocalPanoramaPicker() {
    setPanoramaSourceMenuOpen(false);
    panoramaInputRef.current?.click();
  }

  function openMivoPanoramaPicker() {
    setPanoramaSourceMenuOpen(false);

    if (useMivoStore.getState().status === "connected") {
      setMivoPanoramaPickerOpen(true);
      return;
    }

    setMivoConnectOpen(true);
  }

  async function applyPanoramaFromMivo(assets: MivoAsset[]) {
    const session = useMivoStore.getState().getSession();
    const asset = assets[0];

    if (!session || !asset) throw new Error("尚未连接 Mivo");

    const file = await downloadMivoAsset(session, asset);
    const result = await readPanoramaFile(file);

    if (panoramaAsset) {
      removePanoramaAsset();
    }

    addImportedAsset({ kind: "panorama", ...result });
    setPanoramaError(null);
  }

  function handlePanoramaCardKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    openPanoramaSourceMenu();
  }

  async function importPanorama(file: File) {
    setPanoramaError(null);

    try {
      const result = await readPanoramaFile(file);
      if (panoramaAsset) {
        removePanoramaAsset();
      }
      addImportedAsset({ kind: "panorama", ...result });
    } catch (error) {
      setPanoramaError(error instanceof Error ? error.message : "全景图导入失败");
    }
  }

  return (
    <InspectorPanel
      title="3D场景"
      ariaLabel="3D场景右侧属性面板"
      className="scene-inspector"
      tabs={SCENE_TABS.map((tab) => ({
        label: tab.label,
        active: activeTab === tab.key,
        onClick: () => setActiveTab(tab.key),
      }))}
    >
      {activeTab === "scene" ? (
        <section className="inspector-section">
        <InspectorRangeNumberField
          label="场景缩放"
          rangeAriaLabel="场景缩放滑杆"
          numberAriaLabel="场景缩放"
          max={SCENE_SCALE_MAX}
          min={SCENE_SCALE_MIN}
          step="0.01"
          value={sceneScaleDraft}
          onValueChange={commitSceneScale}
          onRangeChange={commitSceneScale}
          onNumberBlur={commitSceneScale}
          onNumberChange={(value) => {
            setSceneScaleDraft(value);
            if (value !== "") {
              const parsed = Number(value);
              if (Number.isFinite(parsed)) {
                updateScene({ scale: parsed });
              }
            }
          }}
        />
        <div className="inspector-field inspector-axis-group" role="group" aria-label="场景平移">
          <span className="inspector-field-label">场景平移</span>
          <InspectorRangeNumberField
            label="场景平移 X"
            axisPrefix="X"
            rangeAriaLabel="场景平移 X 滑杆"
            numberAriaLabel="场景平移 X"
            max={SCENE_POSITION_MAX}
            min={SCENE_POSITION_MIN}
            step="0.1"
            value={scene.position[0]}
            onValueChange={(value) => updateScene({ position: replaceAxis(scene.position, 0, Number(value)) })}
          />
          <InspectorRangeNumberField
            label="场景平移 Y"
            axisPrefix="Y"
            rangeAriaLabel="场景平移 Y 滑杆"
            numberAriaLabel="场景平移 Y"
            max={SCENE_POSITION_MAX}
            min={SCENE_POSITION_MIN}
            step="0.1"
            value={scene.position[1]}
            onValueChange={(value) => updateScene({ position: replaceAxis(scene.position, 1, Number(value)) })}
          />
          <InspectorRangeNumberField
            label="场景平移 Z"
            axisPrefix="Z"
            rangeAriaLabel="场景平移 Z 滑杆"
            numberAriaLabel="场景平移 Z"
            max={SCENE_POSITION_MAX}
            min={SCENE_POSITION_MIN}
            step="0.1"
            value={scene.position[2]}
            onValueChange={(value) => updateScene({ position: replaceAxis(scene.position, 2, Number(value)) })}
          />
        </div>
        <div className="inspector-field inspector-axis-group" role="group" aria-label="场景旋转">
          <span className="inspector-field-label">场景旋转</span>
          <InspectorRangeNumberField
            label="场景旋转 X"
            axisPrefix="X"
            rangeAriaLabel="场景旋转 X 滑杆"
            numberAriaLabel="场景旋转 X"
            max={SCENE_ROTATION_MAX}
            min={SCENE_ROTATION_MIN}
            step="0.1"
            value={scene.rotation[0]}
            onValueChange={(value) => updateScene({ rotation: replaceAxis(scene.rotation, 0, Number(value)) })}
          />
          <InspectorRangeNumberField
            label="场景旋转 Y"
            axisPrefix="Y"
            rangeAriaLabel="场景旋转 Y 滑杆"
            numberAriaLabel="场景旋转 Y"
            max={SCENE_ROTATION_MAX}
            min={SCENE_ROTATION_MIN}
            step="0.1"
            value={scene.rotation[1]}
            onValueChange={(value) => updateScene({ rotation: replaceAxis(scene.rotation, 1, Number(value)) })}
          />
          <InspectorRangeNumberField
            label="场景旋转 Z"
            axisPrefix="Z"
            rangeAriaLabel="场景旋转 Z 滑杆"
            numberAriaLabel="场景旋转 Z"
            max={SCENE_ROTATION_MAX}
            min={SCENE_ROTATION_MIN}
            step="0.1"
            value={scene.rotation[2]}
            onValueChange={(value) => updateScene({ rotation: replaceAxis(scene.rotation, 2, Number(value)) })}
          />
        </div>
        </section>
      ) : null}
      {activeTab === "panorama" ? (
        <section className="inspector-section">
        <input
          ref={panoramaInputRef}
          aria-label="上传全景图"
          accept={PANORAMA_UPLOAD_ACCEPT}
          className="panorama-upload-input"
          type="file"
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (file) {
              await importPanorama(file);
            }
            input.value = "";
          }}
        />
        <InspectorColorField
          label="天空颜色"
          colorAriaLabel="天空颜色"
          hexAriaLabel="天空颜色 HEX"
          value={scene.backgroundColor}
          onColorChange={(value) => updateScene({ backgroundColor: value })}
          onHexChange={(value) => updateScene({ backgroundColor: value })}
        />
        <span className="inspector-field-label">全景图</span>
        {panoramaAsset ? (
          <div
            className="panorama-thumbnail-card"
            role="button"
            tabIndex={0}
            aria-label="全景图缩略图卡片"
            onClick={() => setPanoramaSourceMenuOpen((isOpen) => !isOpen)}
            onKeyDown={handlePanoramaCardKeyDown}
          >
            {panoramaSourceMenuOpen ? (
              <div className="panorama-source-menu" role="menu" aria-label="选择全景图来源">
                <button
                  className="panorama-source-item"
                  role="menuitem"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openMivoPanoramaPicker();
                  }}
                >
                  从 Mivo 选择
                </button>
                <button
                  className="panorama-source-item"
                  role="menuitem"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openLocalPanoramaPicker();
                  }}
                >
                  从本地选择
                </button>
              </div>
            ) : null}
            <button
              aria-label="删除全景图"
              className="panorama-thumbnail-delete"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                removePanoramaAsset();
              }}
            >
              <Trash2 aria-hidden="true" size={14} strokeWidth={1.9} />
            </button>
            <img className="panorama-thumbnail-image" alt={`${panoramaAsset.fileName} 全景图缩略图`} src={panoramaAsset.url} />
            <span className="panorama-thumbnail-name">{panoramaAsset.fileName}</span>
          </div>
        ) : (
          <div className="panorama-empty-card">
            <span className="panorama-empty-icon" data-testid="panorama-empty-icon">
              <ImageOff aria-hidden="true" size={16} strokeWidth={1.8} />
            </span>
            <span className="panorama-empty-actions">
              <button className="panorama-empty-link" type="button" onClick={openMivoPanoramaPicker}>
                从 Mivo 选择
              </button>
              <span aria-hidden="true" className="panorama-empty-sep">
                /
              </span>
              <button className="panorama-empty-link" type="button" onClick={openLocalPanoramaPicker}>
                从本地选择
              </button>
            </span>
          </div>
        )}
        {panoramaError ? <p className="capture-status">{panoramaError}</p> : null}
        <div className="inspector-field">
          <span className="inspector-field-label">显示方式</span>
          <div className="inspector-choice-group" role="group" aria-label="全景图显示方式">
            <button
              aria-pressed={panoramaMode === "equirectangular"}
              className={`inspector-choice-item${panoramaMode === "equirectangular" ? " is-active" : ""}`}
              type="button"
              onClick={() => updateScene({ panoramaProjectionMode: "equirectangular" })}
            >
              全景图
            </button>
            <button
              aria-pressed={panoramaMode === "backdrop"}
              className={`inspector-choice-item${panoramaMode === "backdrop" ? " is-active" : ""}`}
              type="button"
              onClick={() => updateScene({ panoramaProjectionMode: "backdrop" })}
            >
              背景图
            </button>
          </div>
        </div>
        {panoramaMode === "backdrop" ? (
          <>
            <InspectorRangeNumberField
              label="背景图缩放"
              rangeAriaLabel="背景图缩放滑杆"
              numberAriaLabel="背景图缩放"
              max={BACKDROP_SCALE_MAX}
              min={BACKDROP_SCALE_MIN}
              step="0.01"
              value={backdropScale}
              onValueChange={(value) => updateScene({ backdropScale: Number(value) })}
            />
            <div className="inspector-field inspector-axis-group" role="group" aria-label="背景图位置">
              <span className="inspector-field-label">位置</span>
              <InspectorRangeNumberField
                label="背景图位置 X"
                axisPrefix="X"
                rangeAriaLabel="背景图位置 X 滑杆"
                numberAriaLabel="背景图位置 X"
                max={BACKDROP_OFFSET_MAX}
                min={BACKDROP_OFFSET_MIN}
                step="0.1"
                value={backdropOffset[0]}
                onValueChange={(value) =>
                  updateScene({ backdropOffset: [Number(value), backdropOffset[1]] })
                }
              />
              <InspectorRangeNumberField
                label="背景图位置 Y"
                axisPrefix="Y"
                rangeAriaLabel="背景图位置 Y 滑杆"
                numberAriaLabel="背景图位置 Y"
                max={BACKDROP_OFFSET_MAX}
                min={BACKDROP_OFFSET_MIN}
                step="0.1"
                value={backdropOffset[1]}
                onValueChange={(value) =>
                  updateScene({ backdropOffset: [backdropOffset[0], Number(value)] })
                }
              />
            </div>
          </>
        ) : (
          <>
          <InspectorRangeNumberField
          label="全景旋转"
          rangeAriaLabel="全景旋转滑杆"
          numberAriaLabel="全景旋转"
          max={PANORAMA_YAW_MAX}
          min={PANORAMA_YAW_MIN}
          step="1"
          value={panoramaYawDraft}
          onValueChange={commitPanoramaYaw}
          onRangeChange={commitPanoramaYaw}
          onNumberBlur={commitPanoramaYaw}
          onNumberChange={(value) => {
            setPanoramaYawDraft(value);
            if (value !== "") {
              const parsed = Number(value);
              if (Number.isFinite(parsed)) {
                updateScene({ panoramaYaw: parsed });
              }
            }
          }}
        />
        <InspectorRangeNumberField
          label="全景半径"
          rangeAriaLabel="全景半径滑杆"
          numberAriaLabel="全景半径"
          max={PANORAMA_RADIUS_MAX}
          min={PANORAMA_RADIUS_MIN}
          step="1"
          value={panoramaRadiusDraft}
          onValueChange={commitPanoramaRadius}
          onRangeChange={commitPanoramaRadius}
          onNumberBlur={commitPanoramaRadius}
          onNumberChange={(value) => {
            setPanoramaRadiusDraft(value);
            if (value !== "") {
              const parsed = Number(value);
              if (Number.isFinite(parsed)) {
                updateScene({ panoramaRadius: parsed });
              }
            }
          }}
        />
          </>
        )}
        </section>
      ) : null}
      {activeTab === "ground" ? (
        <section className="inspector-section">
          <div className="inspector-toggle-row" role="group" aria-label="地面开关">
            <input
              aria-label="地面"
              checked={scene.showGround}
              type="checkbox"
              onChange={(event) => updateScene({ showGround: event.target.checked })}
            />
            <span>地面</span>
          </div>
          {scene.showGround ? (
            <>
          <InspectorRangeNumberField
            label="透明度"
            rangeAriaLabel="地面透明度滑杆"
            numberAriaLabel="地面透明度"
            max="1"
            min="0"
            step="0.01"
            value={scene.groundOpacity}
            onValueChange={(value) => updateScene({ groundOpacity: Number(value) })}
          />
          <InspectorRangeNumberField
            label="高度"
            rangeAriaLabel="地面高度滑杆"
            numberAriaLabel="地面高度"
            max={GROUND_HEIGHT_MAX}
            min={GROUND_HEIGHT_MIN}
            step="0.1"
            value={groundHeightDraft}
            onValueChange={commitGroundHeight}
            onRangeChange={commitGroundHeight}
            onNumberBlur={commitGroundHeight}
            onNumberChange={(value) => {
              setGroundHeightDraft(value);
              if (value !== "") {
                const parsed = Number(value);
                if (Number.isFinite(parsed)) {
                  updateScene({ groundHeight: parsed });
                }
              }
            }}
          />
            </>
          ) : null}
        </section>
      ) : null}
      {activeTab === "misc" ? (
        <section className="inspector-section">
          <div className="scene-switch-row" role="group" aria-label="开关项设置">
          <div className="inspector-toggle-row">
            <input
              aria-label="角色标签"
              checked={scene.showLabels}
              type="checkbox"
              onChange={(event) => updateScene({ showLabels: event.target.checked })}
            />
            <span>角色标签</span>
          </div>
          <div className="inspector-toggle-row">
            <input
              aria-label="显示网格"
              checked={scene.snapToGrid}
              type="checkbox"
              onChange={(event) => updateScene({ snapToGrid: event.target.checked })}
            />
            <span>显示网格</span>
          </div>
          </div>
        </section>
      ) : null}
      <MivoConnectDialog open={mivoConnectOpen} onClose={() => setMivoConnectOpen(false)} />
      <MivoAssetPicker
        kind="image"
        maxCount={1}
        open={mivoPanoramaPickerOpen}
        onApply={applyPanoramaFromMivo}
        onClose={() => setMivoPanoramaPickerOpen(false)}
      />
    </InspectorPanel>
  );
}
