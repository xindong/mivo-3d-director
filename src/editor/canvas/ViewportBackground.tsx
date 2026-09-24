import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClampToEdgeWrapping,
  Color,
  EquirectangularReflectionMapping,
  LinearFilter,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  type Mesh,
  type PerspectiveCamera,
} from "three";
import type { DirectorAssetRef, PanoramaProjectionMode } from "../schema/directorProject";
import { getPanoramaRotationRadians } from "./panoramaMath";

type PanoramaTextureState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; texture: Texture }
  | { status: "error"; error: Error };

export function configurePanoramaTexture(texture: Texture, projectionMode: PanoramaProjectionMode = "equirectangular") {
  texture.colorSpace = SRGBColorSpace;
  if (projectionMode === "equirectangular") {
    texture.mapping = EquirectangularReflectionMapping;
  } else {
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
  }
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  texture.needsUpdate = true;
  return texture;
}

function toTextureLoadError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error("全景图纹理加载失败");
}

function usePanoramaTexture(url: string | null, projectionMode: PanoramaProjectionMode): PanoramaTextureState {
  const [state, setState] = useState<PanoramaTextureState>({ status: "idle" });

  useEffect(() => {
    if (!url) {
      setState({ status: "idle" });
      return undefined;
    }

    let cancelled = false;
    setState({ status: "loading" });

    let texture: Texture | null = null;

    try {
      texture = new TextureLoader().load(
        url,
        (loadedTexture) => {
          if (cancelled) {
            loadedTexture.dispose();
            return;
          }

          setState({ status: "ready", texture: configurePanoramaTexture(loadedTexture, projectionMode) });
        },
        undefined,
        (error) => {
          if (!cancelled) {
            setState({ status: "error", error: toTextureLoadError(error) });
          }
        }
      );
    } catch (error) {
      setState({ status: "error", error: toTextureLoadError(error) });
    }

    return () => {
      cancelled = true;
      texture?.dispose();
    };
  }, [projectionMode, url]);

  return state;
}

export function BackdropPlane({
  texture,
  distance,
  offset,
  scale,
}: {
  texture: Texture;
  distance: number;
  offset: [number, number];
  scale: number;
}) {
  const meshRef = useRef<Mesh>(null);
  const { camera } = useThree();
  const forward = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const perspectiveCamera = camera as PerspectiveCamera;
    const fovRadians = ((perspectiveCamera.fov ?? 50) * Math.PI) / 180;
    const safeScale = Math.max(0.05, scale);
    const height = (2 * distance * Math.tan(fovRadians / 2)) / safeScale;
    const width = height * (perspectiveCamera.aspect ?? 1);

    camera.getWorldDirection(forward);
    right.crossVectors(forward, camera.up).normalize();
    up.crossVectors(right, forward).normalize();

    mesh.position
      .copy(camera.position)
      .addScaledVector(forward, distance)
      .addScaledVector(right, offset[0])
      .addScaledVector(up, offset[1]);
    mesh.quaternion.copy(camera.quaternion);
    mesh.scale.set(width, height, 1);
  });

  return (
    <mesh ref={meshRef} frustumCulled={false} name="panorama-backdrop-plane" renderOrder={-1000}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial depthWrite={false} map={texture} toneMapped={false} />
    </mesh>
  );
}

export function ViewportBackground({
  backgroundColor,
  panoramaAsset,
  panoramaRadius,
  panoramaYaw,
  projectionMode,
  backdropScale = 1,
  backdropOffset = [0, 0],
}: {
  backgroundColor: string;
  panoramaAsset?: DirectorAssetRef | null;
  panoramaRadius: number;
  panoramaYaw: number;
  projectionMode?: PanoramaProjectionMode;
  backdropScale?: number;
  backdropOffset?: [number, number];
}) {
  const { gl, scene } = useThree();
  const mode = projectionMode ?? panoramaAsset?.projectionMode ?? "equirectangular";
  const textureState = usePanoramaTexture(panoramaAsset?.url ?? null, mode);
  const safeRadius = Math.max(10, panoramaRadius);
  const rotationY = getPanoramaRotationRadians(panoramaYaw);
  const fallbackColor = useMemo(() => new Color(backgroundColor), [backgroundColor]);

  useEffect(() => {
    const nextBackground =
      textureState.status === "ready" && mode === "equirectangular" ? textureState.texture : fallbackColor;

    scene.background = nextBackground;
    scene.backgroundBlurriness = 0;
    scene.backgroundIntensity = 1;
    scene.backgroundRotation.set(0, textureState.status === "ready" && mode === "equirectangular" ? rotationY : 0, 0);
    gl.setClearColor(fallbackColor, 1);
  }, [fallbackColor, gl, mode, rotationY, scene, textureState]);

  return (
    <>
      {textureState.status === "ready" && mode === "backdrop" ? (
        <BackdropPlane
          distance={safeRadius}
          offset={backdropOffset}
          scale={backdropScale}
          texture={textureState.texture}
        />
      ) : null}
      {textureState.status === "error" ? (
        <Html center>
          <div className="viewport-error-card" role="status">
            <strong>全景图加载失败</strong>
            <span>请重新导入 JPG / PNG / WEBP 图片</span>
          </div>
        </Html>
      ) : null}
    </>
  );
}
