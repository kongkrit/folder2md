// app.js — DOM wiring: drop zone, pickers, checkboxes, theme, downloads, service worker. Logic lives in core.js.
(function () {
  "use strict";

  const F = self.folder2md;
  const $ = (id) => document.getElementById(id);
  const drop = $("drop");
  const pickDir = $("pick-dir");
  const pickFile = $("pick-file");
  const dots = $("dots");
  const sha = $("sha");
  const status = $("status");
  const dialog = $("ignored");
  const skippedPre = $("skipped");
  const themeBtn = $("theme");

  $("version").textContent = F.VERSION;
  $("ignores-text").textContent = F.IGNORES_TEXT;

  // ---------- theme ----------
  const darkMedia = matchMedia("(prefers-color-scheme: dark)");
  const currentTheme = () => document.documentElement.dataset.theme || (darkMedia.matches ? "dark" : "light");
  const paintTheme = () => {
    const dark = currentTheme() === "dark";
    themeBtn.textContent = dark ? "☀" : "☾";
    themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  };
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
  } catch (e) { /* storage unavailable */ }
  paintTheme();
  darkMedia.addEventListener("change", paintTheme);
  themeBtn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) { /* storage unavailable */ }
    paintTheme();
  });

  // ---------- status & dialog ----------
  let lastSkipped = null;

  function setStatus(msg, isError) {
    status.textContent = msg;
    status.classList.toggle("error", !!isError);
  }

  $("view-ignored").addEventListener("click", () => {
    if (lastSkipped === null) skippedPre.textContent = "no run yet";
    else skippedPre.textContent = lastSkipped.length ? lastSkipped.join("\n") : "nothing skipped";
    dialog.showModal();
  });

  // ---------- inputs ----------
  $("choose-dir").addEventListener("click", () => pickDir.click());
  $("choose-file").addEventListener("click", () => pickFile.click());

  pickDir.addEventListener("change", () => {
    const files = [...pickDir.files].map((f) => ({ path: f.webkitRelativePath || f.name, file: f }));
    pickDir.value = "";
    run(files);
  });

  pickFile.addEventListener("change", () => {
    const files = [...pickFile.files].map((f) => ({ path: f.name, file: f }));
    pickFile.value = "";
    run(files);
  });

  for (const type of ["dragenter", "dragover"]) {
    drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add("dragover"); });
  }
  for (const type of ["dragleave", "drop"]) {
    drop.addEventListener(type, () => drop.classList.remove("dragover"));
  }
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    const items = [...e.dataTransfer.items].filter((it) => it.kind === "file");
    if (items.length !== 1) return setStatus("drop one folder, one .zip, or one .md", true);
    const entry = items[0].webkitGetAsEntry ? items[0].webkitGetAsEntry() : null;
    const file = items[0].getAsFile();
    try {
      if (entry && entry.isDirectory) run(await readDirectory(entry));
      else if (file) run([{ path: file.name, file }]);
      else setStatus("drop one folder, one .zip, or one .md", true);
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });

  const readEntries = (reader) => new Promise((res, rej) => reader.readEntries(res, rej));
  const fileOf = (entry) => new Promise((res, rej) => entry.file(res, rej));

  async function readDirectory(dir) {
    const out = [];
    const walk = async (d) => {
      const reader = d.createReader();
      for (;;) {
        const batch = await readEntries(reader);
        if (!batch.length) break;
        for (const en of batch) {
          if (en.isDirectory) await walk(en);
          else out.push({ path: en.fullPath.replace(/^\//, ""), file: await fileOf(en) });
        }
      }
    };
    await walk(dir);
    return out;
  }

  // ---------- run ----------
  let busy = false;

  async function run(files) {
    if (busy || !files.length) return;
    busy = true;
    try {
      setStatus("reading…");
      const loaded = [];
      for (const f of files) loaded.push({ path: f.path, bytes: new Uint8Array(await f.file.arrayBuffer()) });
      const mode = F.detect(loaded);
      if (mode === "md") {
        await md2folder(loaded[0]);
      } else if (mode === "zip") {
        const stem = stemOf(loaded[0].path).replace(/\.zip$/i, "") || loaded[0].path;
        const { root, entries } = F.zipRoot(await F.zipRead(loaded[0].bytes), stem);
        await folder2md(entries, root);
      } else if (loaded.length === 1 && !loaded[0].path.includes("/")) {
        const name = loaded[0].path;
        const stem = stemOf(name);
        await folder2md([{ path: stem + "/" + name, bytes: loaded[0].bytes }], stem);
      } else {
        await folder2md(loaded, loaded[0].path.split("/")[0]);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
    } finally {
      busy = false;
    }
  }

  function stemOf(name) {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(0, i) : name;
  }

  async function folder2md(entries, root) {
    const { kept, skipped } = F.partition(entries, dots.checked);
    lastSkipped = skipped;
    if (!kept.length) throw new Error("nothing to pack: every file was skipped");
    const parts = await F.buildMd({ entries: kept, root, sha: sha.checked });
    const total = kept.reduce((n, e) => n + e.bytes.length, 0);
    download(new Blob(parts, { type: "text/markdown" }), root + ".md");
    setStatus(`folder2md: ${kept.length} files, ${total} bytes, ${skipped.length} skipped → ${root}.md`);
  }

  async function md2folder(file) {
    const entries = await F.parseMd(file.bytes);
    lastSkipped = [];
    const total = entries.reduce((n, e) => n + e.bytes.length, 0);
    if (entries.length === 1) {
      const name = F.basename(entries[0].path);
      download(new Blob([entries[0].bytes]), name);
      setStatus(`md2folder: 1 file, ${total} bytes → ${name}`);
    } else {
      const root = entries[0].path.split("/")[0];
      download(new Blob([F.zipWrite(entries)], { type: "application/zip" }), root + ".zip");
      setStatus(`md2folder: ${entries.length} files, ${total} bytes → ${root}.zip`);
    }
  }

  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // ---------- service worker (never on file://) ----------
  if (location.protocol.startsWith("http") && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js");
  }
})();
