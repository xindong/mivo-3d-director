import { isExperimentalModelFile, isSupportedModelFile } from "mivo-model-viewer/core";

const LOCAL_MODEL_EXTENSION_RE = /\.(glb|gltf|obj|fbx|stl|ply|dae|3mf|3ds|zip)$/i;
export const LOCAL_MODEL_ACCEPT = ".glb,.gltf,.obj,.fbx,.stl,.ply,.dae,.3mf,.3ds,.zip";
const LOCAL_MODEL_FORMAT_LABEL = "GLB / GLTF / OBJ / FBX / STL / PLY / DAE / 3MF / 3DS / ZIP";

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("模型文件读取失败"));
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("模型文件读取失败")));
    reader.readAsDataURL(file);
  });
}

export async function readLocalModelFile(file: File) {
  if (isExperimentalModelFile(file)) {
    throw new Error("当前不支持实验性 VRML / STEP 模型格式");
  }

  if (!isSupportedModelFile(file) || !LOCAL_MODEL_EXTENSION_RE.test(file.name)) {
    throw new Error(`当前仅支持 ${LOCAL_MODEL_FORMAT_LABEL} 模型文件`);
  }

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    name: file.name.replace(LOCAL_MODEL_EXTENSION_RE, ""),
    url: await readFileAsDataUrl(file),
  };
}
