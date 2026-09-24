import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLocalModelFile } from "./localModelImport";

const mockIsExperimentalModelFile = vi.fn();
const mockIsSupportedModelFile = vi.fn();

vi.mock("mivo-model-viewer/core", () => ({
  isExperimentalModelFile: (file: File) => mockIsExperimentalModelFile(file),
  isSupportedModelFile: (file: File) => mockIsSupportedModelFile(file),
}));

beforeEach(() => {
  mockIsExperimentalModelFile.mockReset();
  mockIsSupportedModelFile.mockReset();
  mockIsExperimentalModelFile.mockImplementation((file: File) => /\.(vrml?|step)$/i.test(file.name));
  mockIsSupportedModelFile.mockReturnValue(true);
});

describe("readLocalModelFile", () => {
  it.each(["glb", "gltf", "obj", "fbx", "stl", "ply", "dae", "3mf", "3ds", "zip"])(
    "accepts .%s and returns a DataURL asset",
    async (extension) => {
      const result = await readLocalModelFile(new File(["model"], "asset." + extension));

      expect(result.fileName).toBe("asset." + extension);
      expect(result.name).toBe("asset");
      expect(result.url).toMatch(/^data:/);
      expect(result.id).toEqual(expect.any(String));
    }
  );

  it.each(["vrml", "step"])("rejects experimental .%s files", async (extension) => {
    await expect(readLocalModelFile(new File(["model"], "asset." + extension))).rejects.toThrow(
      "当前不支持实验性 VRML / STEP 模型格式"
    );
  });

  it("rejects unsupported extensions even when the SDK reports the file as supported", async () => {
    await expect(readLocalModelFile(new File(["model"], "asset.usdz"))).rejects.toThrow(
      "当前仅支持 GLB / GLTF / OBJ / FBX / STL / PLY / DAE / 3MF / 3DS / ZIP 模型文件"
    );
  });

  it("rejects files that the SDK does not support", async () => {
    mockIsSupportedModelFile.mockReturnValue(false);

    await expect(readLocalModelFile(new File(["model"], "asset.glb"))).rejects.toThrow(
      "当前仅支持 GLB / GLTF / OBJ / FBX / STL / PLY / DAE / 3MF / 3DS / ZIP 模型文件"
    );
  });
});
