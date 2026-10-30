/*
 * Engagement storage. With the File System Access API (Chrome/Edge desktop) everything is
 * written into a folder the auditor chooses. Elsewhere, files are kept in memory for the
 * session and offered as downloads. Nothing is ever sent over the network.
 */
export const FOLDERS = { population: "01_Population", workpapers: "02_Workpapers", vouchers: "03_Vouchers" };
export const STATE_FILE = "engagement.json";

export const supportsFolders = () => typeof window !== "undefined" && "showDirectoryPicker" in window && window.isSecureContext;

const DB = "auditje";
function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore("handles"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbSet(key, val) { try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction("handles", "readwrite"); tx.objectStore("handles").put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch { /* optional */ } }
async function idbGet(key) { try { const db = await idb(); return await new Promise((res) => { const tx = db.transaction("handles"); const r = tx.objectStore("handles").get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); }); } catch { return undefined; } }

export const safeName = (s, max = 80) => String(s).normalize("NFKD").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").slice(0, max) || "file";

export class Store {
  constructor() { this.root = null; this.memory = new Map(); this.mode = "session"; }
  get folderName() { return this.root ? this.root.name : ""; }
  get isFolder() { return this.mode === "folder"; }

  async pickFolder() {
    const handle = await window.showDirectoryPicker({ id: "auditje-engagement", mode: "readwrite", startIn: "documents" });
    await this.attach(handle);
    return handle;
  }
  async attach(handle) {
    if ((await handle.queryPermission({ mode: "readwrite" })) !== "granted" && (await handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("Permission to write to the folder was not granted.");
    this.root = handle; this.mode = "folder";
    for (const f of Object.values(FOLDERS)) await handle.getDirectoryHandle(f, { create: true });
    await idbSet("recent", handle);
    try { localStorage.setItem("auditje-recent-name", handle.name); } catch { /* optional */ }
  }
  /** Name of the last folder (cheap; no handle deserialization on page load). */
  recentName() { try { return supportsFolders() ? localStorage.getItem("auditje-recent-name") : null; } catch { return null; } }
  async recent() { return supportsFolders() ? idbGet("recent") : undefined; }
  useSession() { this.root = null; this.mode = "session"; this.memory = new Map(); }

  async dir(parts, create = true) { let d = this.root; for (const p of parts) d = await d.getDirectoryHandle(p, { create }); return d; }
  async write(path, data) {
    if (!this.isFolder) { this.memory.set(path, data instanceof Blob ? data : new Blob([data])); return path; }
    const parts = path.split("/"); const name = parts.pop();
    const d = await this.dir(parts);
    const fh = await d.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(data); await w.close();
    return path;
  }
  async read(path) {
    if (!this.isFolder) return this.memory.get(path) || null;
    try { const parts = path.split("/"); const name = parts.pop(); const d = await this.dir(parts, false); return await (await d.getFileHandle(name)).getFile(); } catch { return null; }
  }
  async remove(path) {
    if (!this.isFolder) { this.memory.delete(path); return; }
    try { const parts = path.split("/"); const name = parts.pop(); const d = await this.dir(parts, false); await d.removeEntry(name); } catch { /* already gone */ }
  }
  async exists(path) { return (await this.read(path)) !== null; }
  /** Pick a file name that does not collide with existing files. */
  async unique(path) {
    if (!(await this.exists(path))) return path;
    const m = path.match(/^(.*?)(\.[^./]+)?$/); let i = 2;
    while (await this.exists(`${m[1]}_${i}${m[2] || ""}`)) i++;
    return `${m[1]}_${i}${m[2] || ""}`;
  }
  async saveState(state) { await this.write(STATE_FILE, JSON.stringify(state, null, 1)); }
  async loadState() { const f = await this.read(STATE_FILE); return f ? JSON.parse(await f.text()) : null; }
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
