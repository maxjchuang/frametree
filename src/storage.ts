import { openDB } from "idb";
import type { Project } from "./model";
const db = openDB("frametree", 1, {
  upgrade(db) {
    db.createObjectStore("projects");
    db.createObjectStore("assets");
  },
});
export async function loadProject(): Promise<Project | undefined> {
  return (await db).get("projects", "current");
}
export async function saveProject(p: Project) {
  await (await db).put("projects", p, "current");
}
export async function putAsset(id: string, blob: Blob) {
  await (await db).put("assets", blob, id);
}
export async function getAsset(id: string): Promise<Blob | undefined> {
  return (await db).get("assets", id);
}
export const toDataURL = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(Error("文件读取失败"));
    r.readAsDataURL(blob);
  });
export async function importImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("请选择 JPG、PNG 或 WebP 图片");
  if (file.size > 100 * 1024 * 1024) throw Error("单张图片不能超过 100 MB");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const thumb = canvas.toDataURL("image/webp", 0.82);
    const id = crypto.randomUUID();
    await putAsset(id, file);
    return { assetId: id, image: thumb };
  } finally {
    bitmap.close();
  }
}
export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
