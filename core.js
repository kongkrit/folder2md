// core.js — pure functions, no DOM. Loaded by index.html (after ignores.js) and by sw.js via importScripts.
// Exposes self.folder2md = { buildMd, parseMd, zipRead, zipWrite, sniff, isIgnored, ... }.
(function (root) {
  "use strict";

  const VERSION = "0.1.0";
  const TOOL = "folder2md/" + VERSION;
  const MAGIC_RE = /^folder2md-document: format=1 tool=folder2md\/\S+ restore=".*"$/;
  const MAGIC_LINE = `folder2md-document: format=1 tool=${TOOL} restore="drop this file on folder2md"`;
  const FENCE_RE = /^(`{3,})(\S*)$/;
  const MARK_PRE = "<!-- folder2md ";
  const MARK_SUF = " -->";

  const enc = new TextEncoder();
  const dec = new TextDecoder("utf-8");
  const strictDec = new TextDecoder("utf-8", { fatal: true });

  // ---------- ignore engine ----------
  // glob → regex: `*` → `.*`, `?` → `.`, `[...]` passed through, everything else escaped; anchored.
  function globToRegex(glob) {
    let re = "^";
    for (const ch of glob) {
      if (ch === "*") re += ".*";
      else if (ch === "?") re += ".";
      else if (ch === "[" || ch === "]") re += ch;
      else re += ch.replace(/[.+^${}()|\\\/-]/g, "\\$&");
    }
    return new RegExp(re + "$");
  }

  function parseIgnores(text) {
    const out = [];
    for (let line of text.split("\n")) {
      line = line.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.endsWith("/")) line = line.slice(0, -1);
      try { out.push(globToRegex(line)); } catch (e) { /* unparsable pattern: skip it */ }
    }
    return out;
  }

  const IGNORES = typeof IGNORES_TEXT === "string" ? IGNORES_TEXT : "";
  const IGNORE_RES = parseIgnores(IGNORES);

  // A hit on any path component (file or directory) skips the entry.
  function isIgnored(path, patterns) {
    const pats = patterns || IGNORE_RES;
    return path.split("/").some((c) => pats.some((re) => re.test(c)));
  }

  function isDotted(path) {
    return path.split("/").some((c) => c.startsWith("."));
  }

  // entries: [{path, bytes}] → {kept (sorted by path, code-unit order), skipped (paths)}
  function partition(entries, includeDots) {
    const kept = [], skipped = [];
    for (const e of entries) {
      if (isIgnored(e.path) || (!includeDots && isDotted(e.path))) skipped.push(e.path);
      else kept.push(e);
    }
    kept.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    skipped.sort();
    return { kept, skipped };
  }

  // ---------- classification ----------
  function sniff(bytes) {
    if (bytes.indexOf(0) !== -1) return "binary";
    try { strictDec.decode(bytes); return "text"; } catch (e) { return "binary"; }
  }

  // Backtick fence of length max(3, longest backtick run in the content + 1).
  function fenceFor(bytes) {
    let longest = 0, run = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x60) { run++; if (run > longest) longest = run; } else run = 0;
    }
    return "`".repeat(Math.max(3, longest + 1));
  }

  // Extension without the dot, lowercased; "" when there is none (a leading dot is not an extension).
  function infoFor(path) {
    const base = path.slice(path.lastIndexOf("/") + 1);
    const i = base.lastIndexOf(".");
    return i > 0 ? base.slice(i + 1).toLowerCase() : "";
  }

  function basename(path) {
    return path.slice(path.lastIndexOf("/") + 1);
  }

  // ---------- tree ----------
  // entries: [{path, kind, bytes}] with path = "<root>/..." → tree(1)-style text, one trailing "\n".
  function treeText(entries, rootName) {
    const top = new Map(); // name → Map (directory) | entry (file)
    for (const e of entries) {
      const parts = e.path.split("/").slice(1);
      let node = top;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!(node.get(parts[i]) instanceof Map)) node.set(parts[i], new Map());
        node = node.get(parts[i]);
      }
      node.set(parts[parts.length - 1], e);
    }
    const lines = [rootName + "/"];
    const walk = (node, prefix) => {
      const names = [...node.keys()].sort();
      names.forEach((name, i) => {
        const last = i === names.length - 1;
        const child = node.get(name);
        const head = prefix + (last ? "└── " : "├── ");
        if (child instanceof Map) {
          lines.push(head + name + "/");
          walk(child, prefix + (last ? "    " : "│   "));
        } else {
          lines.push(`${head}${name}  (${child.kind}, ${child.bytes.length} bytes)`);
        }
      });
    };
    walk(top, "");
    return lines.join("\n") + "\n";
  }

  // ---------- base64 / hashing ----------
  function b64encode(bytes) {
    let s = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(s);
  }

  // Standard base64 in 76-column lines, each ending "\n".
  function b64lines(bytes) {
    const b = b64encode(bytes);
    let out = "";
    for (let i = 0; i < b.length; i += 76) out += b.slice(i, i + 76) + "\n";
    return out;
  }

  function b64decode(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function sha256hex(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // ---------- build ----------
  // {entries: [{path, bytes}] sorted by path, root, sha: bool} → array of string | Uint8Array parts for new Blob(parts).
  async function buildMd({ entries, root: rootName, sha }) {
    const typed = entries.map((e) => ({ path: e.path, bytes: e.bytes, kind: sniff(e.bytes) }));
    const tree = treeText(typed, rootName);
    const treeFence = fenceFor(enc.encode(tree));
    const parts = [
      MAGIC_LINE + "\n",
      `\n# folder2md: ${rootName}\n\nGenerated by folder2md ${VERSION}. Restore by dropping this file on folder2md.\n\n## Tree\n\n`,
      treeFence + "text\n", tree, treeFence + "\n",
    ];
    for (const e of typed) {
      const marker = { path: e.path, kind: e.kind };
      if (sha) marker.sha256 = await sha256hex(e.bytes);
      const fence = e.kind === "text" ? fenceFor(e.bytes) : "```";
      const info = e.kind === "text" ? infoFor(e.path) : "base64";
      parts.push(`\n---\n\n## ${e.path}\n\n${MARK_PRE}${JSON.stringify(marker)}${MARK_SUF}\n\n${fence}${info}\n`);
      if (e.kind === "text") parts.push(e.bytes, "\n");
      else parts.push(b64lines(e.bytes));
      parts.push(fence + "\n");
    }
    return parts;
  }

  // ---------- parse ----------
  function splitLines(bytes) {
    const lines = [];
    let start = 0;
    for (;;) {
      const i = bytes.indexOf(0x0a, start);
      if (i === -1) break;
      lines.push(bytes.subarray(start, i));
      start = i + 1;
    }
    lines.push(bytes.subarray(start));
    return lines;
  }

  function joinLines(lines) {
    let n = lines.length ? lines.length - 1 : 0;
    for (const l of lines) n += l.length;
    const out = new Uint8Array(n);
    let p = 0;
    lines.forEach((l, k) => {
      if (k) out[p++] = 0x0a;
      out.set(l, p);
      p += l.length;
    });
    return out;
  }

  // Bytes in → [{path, bytes}]. Any failure at any step → Error("md is broken").
  async function parseMd(bytes) {
    try {
      return await parseMdInner(bytes);
    } catch (e) {
      throw new Error("md is broken");
    }
  }

  async function parseMdInner(bytes) {
    const lines = splitLines(bytes);
    if (!MAGIC_RE.test(dec.decode(lines[0]))) throw new Error();
    const out = [];
    let i = 1;
    for (;;) {
      // 2. next marker line
      let marker = null;
      for (; i < lines.length; i++) {
        const s = dec.decode(lines[i]);
        if (s.startsWith(MARK_PRE) && s.endsWith(MARK_SUF)) {
          marker = JSON.parse(s.slice(MARK_PRE.length, -MARK_SUF.length));
          i++;
          break;
        }
      }
      if (marker === null) break;
      if (typeof marker.path !== "string" || !marker.path) throw new Error();
      // 3. next non-empty line must be a fence; collect until the closing fence
      while (i < lines.length && lines[i].length === 0) i++;
      if (i >= lines.length) throw new Error();
      const m = FENCE_RE.exec(dec.decode(lines[i]));
      if (!m) throw new Error();
      const fence = m[1];
      i++;
      const body = [];
      let closed = false;
      for (; i < lines.length; i++) {
        const l = lines[i];
        if (l.length === fence.length && dec.decode(l) === fence) { closed = true; i++; break; }
        body.push(l);
      }
      if (!closed) throw new Error();
      // 4. decode
      let data;
      if (marker.kind === "text") data = joinLines(body);
      else if (marker.kind === "binary") data = b64decode(body.map((l) => dec.decode(l)).join(""));
      else throw new Error();
      // 5. checksum, only when present
      if (marker.sha256 !== undefined && (await sha256hex(data)) !== marker.sha256) throw new Error();
      // 6. emit
      out.push({ path: marker.path, bytes: data });
    }
    if (out.length === 0) throw new Error();
    return out;
  }

  // ---------- zip ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const DOS_TIME = 0;               // 00:00:00
  const DOS_DATE = (1 << 5) | 1;    // 1980-01-01

  // entries: [{path, bytes}] → Uint8Array. STORE only, UTF-8 names (flag bit 11), no ZIP64.
  function zipWrite(entries) {
    const items = entries.map((e) => ({ name: enc.encode(e.path), bytes: e.bytes, crc: crc32(e.bytes) }));
    let localSize = 0, cdSize = 0;
    for (const it of items) {
      localSize += 30 + it.name.length + it.bytes.length;
      cdSize += 46 + it.name.length;
    }
    const buf = new Uint8Array(localSize + cdSize + 22);
    const dv = new DataView(buf.buffer);
    const offsets = [];
    let p = 0;
    for (const it of items) {
      offsets.push(p);
      dv.setUint32(p, 0x04034b50, true);
      dv.setUint16(p + 4, 20, true);          // version needed
      dv.setUint16(p + 6, 0x0800, true);      // flags: UTF-8 names
      dv.setUint16(p + 8, 0, true);           // method: STORE
      dv.setUint16(p + 10, DOS_TIME, true);
      dv.setUint16(p + 12, DOS_DATE, true);
      dv.setUint32(p + 14, it.crc, true);
      dv.setUint32(p + 18, it.bytes.length, true);
      dv.setUint32(p + 22, it.bytes.length, true);
      dv.setUint16(p + 26, it.name.length, true);
      dv.setUint16(p + 28, 0, true);
      buf.set(it.name, p + 30);
      buf.set(it.bytes, p + 30 + it.name.length);
      p += 30 + it.name.length + it.bytes.length;
    }
    const cdStart = p;
    items.forEach((it, k) => {
      dv.setUint32(p, 0x02014b50, true);
      dv.setUint16(p + 4, 20, true);          // version made by
      dv.setUint16(p + 6, 20, true);          // version needed
      dv.setUint16(p + 8, 0x0800, true);
      dv.setUint16(p + 10, 0, true);
      dv.setUint16(p + 12, DOS_TIME, true);
      dv.setUint16(p + 14, DOS_DATE, true);
      dv.setUint32(p + 16, it.crc, true);
      dv.setUint32(p + 20, it.bytes.length, true);
      dv.setUint32(p + 24, it.bytes.length, true);
      dv.setUint16(p + 28, it.name.length, true);
      dv.setUint16(p + 30, 0, true);          // extra length
      dv.setUint16(p + 32, 0, true);          // comment length
      dv.setUint16(p + 34, 0, true);          // disk number
      dv.setUint16(p + 36, 0, true);          // internal attributes
      dv.setUint32(p + 38, 0, true);          // external attributes
      dv.setUint32(p + 42, offsets[k], true);
      buf.set(it.name, p + 46);
      p += 46 + it.name.length;
    });
    dv.setUint32(p, 0x06054b50, true);
    dv.setUint16(p + 4, 0, true);
    dv.setUint16(p + 6, 0, true);
    dv.setUint16(p + 8, items.length, true);
    dv.setUint16(p + 10, items.length, true);
    dv.setUint32(p + 12, cdSize, true);
    dv.setUint32(p + 16, cdStart, true);
    dv.setUint16(p + 20, 0, true);
    return buf;
  }

  // Uint8Array → [{path, bytes}]. Method 0 or 8 only; anything else → Error("unsupported zip").
  async function zipRead(bytes) {
    const unsupported = () => new Error("unsupported zip");
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw unsupported();
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let n = 0; n < count; n++) {
      if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) throw unsupported();
      const flags = dv.getUint16(p + 8, true);
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true);
      const xlen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith("/")) continue;
      if (flags & 1) throw unsupported();
      if (off + 30 > bytes.length || dv.getUint32(off, true) !== 0x04034b50) throw unsupported();
      const dataStart = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
      const slice = bytes.subarray(dataStart, dataStart + csize);
      let data;
      if (method === 0) {
        data = slice.slice();
      } else if (method === 8) {
        const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } else {
        throw unsupported();
      }
      out.push({ path: name, bytes: data });
    }
    return out;
  }

  // Root for zip entries: the common first segment if every entry has one, else the zip's stem (entries get prefixed).
  function zipRoot(entries, stem) {
    const firsts = new Set(entries.map((e) => e.path.split("/")[0]));
    if (entries.length && firsts.size === 1 && entries.every((e) => e.path.includes("/"))) {
      return { root: [...firsts][0], entries };
    }
    return { root: stem, entries: entries.map((e) => ({ path: stem + "/" + e.path, bytes: e.bytes })) };
  }

  // ---------- detection ----------
  function isZip(bytes) {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }

  function isMd(bytes) {
    const nl = bytes.indexOf(0x0a);
    try {
      return MAGIC_RE.test(strictDec.decode(bytes.subarray(0, nl === -1 ? bytes.length : nl)));
    } catch (e) {
      return false;
    }
  }

  // files: [{path, bytes}] as given (a single loose file has no "/" in its path) → "md" | "zip" | "folder"
  function detect(files) {
    if (files.length === 1 && !files[0].path.includes("/")) {
      const f = files[0];
      if (isMd(f.bytes)) return "md";
      if (isZip(f.bytes) || f.path.toLowerCase().endsWith(".zip")) return "zip";
    }
    return "folder";
  }

  root.folder2md = {
    VERSION, TOOL, MAGIC_RE, MAGIC_LINE, IGNORES_TEXT: IGNORES,
    parseIgnores, isIgnored, isDotted, partition,
    sniff, fenceFor, infoFor, basename, treeText,
    b64encode, b64decode, sha256hex, crc32,
    buildMd, parseMd, zipRead, zipWrite, zipRoot, detect,
  };
})(typeof self !== "undefined" ? self : globalThis);
