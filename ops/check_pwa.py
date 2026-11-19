#!/usr/bin/env python3
"""Static + Live HTTP PWA & Deployment Readiness Auditor for Marina Tracker.

Usage:
  python3 ops/check_pwa.py --static [--dist]
  python3 ops/check_pwa.py --url http://127.0.0.1:8098
  python3 ops/check_pwa.py --static --dist --url http://127.0.0.1:8098
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
PNG_SIG = b"\x89PNG\r\n\x1a\n"
NODE_BIN_DIR = "/home/ruslan_safaev/.nvm/versions/node/v22.23.2/bin"


@dataclass
class AuditReport:
    passed: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)

    def ok(self, msg: str) -> None:
        self.passed.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def fail(self, msg: str) -> None:
        self.failed.append(msg)

    def check(self, cond: bool, ok_msg: str, fail_msg: str) -> bool:
        if cond:
            self.ok(ok_msg)
        else:
            self.fail(fail_msg)
        return cond


class HeadMetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.metas: list[dict[str, str]] = []
        self.links: list[dict[str, str]] = []
        self.scripts: list[dict[str, str]] = []
        self.title: str = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {k.lower(): (v or "") for k, v in attrs}
        t = tag.lower()
        if t == "meta":
            self.metas.append(attr_map)
        elif t == "link":
            self.links.append(attr_map)
        elif t == "script":
            self.scripts.append(attr_map)
        elif t == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data


def png_dimensions(data: bytes) -> tuple[int, int] | None:
    if len(data) < 24 or not data.startswith(PNG_SIG):
        return None
    if data[12:16] != b"IHDR":
        return None
    w, h = struct.unpack(">II", data[16:24])
    return w, h


def find_node() -> str | None:
    candidate = Path(NODE_BIN_DIR) / "node"
    if candidate.is_file():
        return str(candidate)
    return shutil.which("node")


def audit_html(html_text: str, label: str, report: AuditReport) -> HeadMetaParser:
    parser = HeadMetaParser()
    parser.feed(html_text)

    meta_by_name = {m.get("name", "").lower(): m.get("content", "") for m in parser.metas if m.get("name")}
    vp = meta_by_name.get("viewport", "")
    report.check(
        "width=device-width" in vp and "viewport-fit=cover" in vp,
        f"{label}: viewport has width=device-width and viewport-fit=cover ({vp})",
        f"{label}: viewport missing width=device-width or viewport-fit=cover (got: {vp!r})",
    )
    report.check(
        meta_by_name.get("apple-mobile-web-app-capable", "").lower() == "yes",
        f"{label}: apple-mobile-web-app-capable=yes",
        f"{label}: missing <meta name='apple-mobile-web-app-capable' content='yes'>",
    )
    if meta_by_name.get("mobile-web-app-capable", "").lower() == "yes":
        report.ok(f"{label}: mobile-web-app-capable=yes")
    else:
        report.warn(f"{label}: missing <meta name='mobile-web-app-capable' content='yes'> (recommended for Chrome)")

    status_style = meta_by_name.get("apple-mobile-web-app-status-bar-style", "").lower()
    report.check(
        status_style in {"default", "black", "black-translucent"},
        f"{label}: apple-mobile-web-app-status-bar-style={status_style}",
        f"{label}: invalid or missing apple-mobile-web-app-status-bar-style (got: {status_style!r})",
    )

    app_title = meta_by_name.get("apple-mobile-web-app-title", "").strip()
    report.check(
        bool(app_title),
        f"{label}: apple-mobile-web-app-title={app_title!r}",
        f"{label}: missing apple-mobile-web-app-title",
    )

    theme_color = meta_by_name.get("theme-color", "").strip()
    report.check(
        bool(re.fullmatch(r"#[0-9a-fA-F]{3,8}", theme_color)),
        f"{label}: theme-color={theme_color}",
        f"{label}: missing or non-hex theme-color (got: {theme_color!r})",
    )

    manifest_links = [l for l in parser.links if "manifest" in l.get("rel", "").lower().split()]
    report.check(
        bool(manifest_links and manifest_links[0].get("href")),
        f"{label}: manifest link -> {manifest_links[0].get('href') if manifest_links else ''}",
        f"{label}: missing <link rel='manifest' ...>",
    )

    touch_icons = [l for l in parser.links if "apple-touch-icon" in l.get("rel", "").lower().split()]
    report.check(
        bool(touch_icons and touch_icons[0].get("href")),
        f"{label}: apple-touch-icon -> {touch_icons[0].get('href') if touch_icons else ''}",
        f"{label}: missing <link rel='apple-touch-icon' ...>",
    )

    favicons = [l for l in parser.links if "icon" in l.get("rel", "").lower().split()]
    report.check(
        bool(favicons),
        f"{label}: favicon link present ({favicons[0].get('href') if favicons else ''})",
        f"{label}: missing <link rel='icon' ...>",
    )

    # Check for external broken or unexpected CDN dependencies
    external_refs = []
    for l in parser.links:
        href = l.get("href", "")
        if href.startswith(("http://", "https://", "//")):
            external_refs.append(href)
    for s in parser.scripts:
        src = s.get("src", "")
        if src.startswith(("http://", "https://", "//")):
            external_refs.append(src)
    if external_refs:
        report.warn(f"{label}: external asset refs found (verify offline availability): {external_refs}")
    else:
        report.ok(f"{label}: zero external CDN dependencies in HTML (100% self-hosted)")

    return parser


def audit_manifest_json(
    manifest: dict,
    label: str,
    asset_resolver,
    report: AuditReport,
) -> None:
    report.check(bool(manifest.get("name")), f"{label}: name={manifest.get('name')!r}", f"{label}: missing name")
    report.check(
        bool(manifest.get("short_name")),
        f"{label}: short_name={manifest.get('short_name')!r}",
        f"{label}: missing short_name",
    )
    report.check(
        manifest.get("display") == "standalone",
        f"{label}: display=standalone",
        f"{label}: display must be 'standalone' (got: {manifest.get('display')!r})",
    )
    override = manifest.get("display_override") or []
    if isinstance(override, list) and "standalone" in override:
        report.ok(f"{label}: display_override includes 'standalone'")
    else:
        report.warn(f"{label}: display_override missing 'standalone' (got: {override!r})")

    report.check(
        bool(manifest.get("start_url")),
        f"{label}: start_url={manifest.get('start_url')!r}",
        f"{label}: missing start_url",
    )
    report.check(
        bool(manifest.get("scope")),
        f"{label}: scope={manifest.get('scope')!r}",
        f"{label}: missing scope",
    )
    report.check(
        bool(manifest.get("theme_color")) and bool(manifest.get("background_color")),
        f"{label}: theme_color={manifest.get('theme_color')} background_color={manifest.get('background_color')}",
        f"{label}: missing theme_color or background_color",
    )

    icons = manifest.get("icons")
    if not isinstance(icons, list) or not icons:
        report.fail(f"{label}: icons array is missing or empty")
        return

    seen_sizes: set[str] = set()
    has_maskable = False
    for icon in icons:
        src = icon.get("src", "")
        sizes = str(icon.get("sizes", "")).strip()
        mime = str(icon.get("type", "")).strip()
        purpose = str(icon.get("purpose", "any")).lower()
        if "maskable" in purpose:
            has_maskable = True
        for sz in sizes.split():
            seen_sizes.add(sz.lower())

        data, resolved_mime, err = asset_resolver(src)
        if err:
            report.fail(f"{label}: icon {src!r} failed: {err}")
            continue
        if mime == "image/png" or src.endswith(".png"):
            dims = png_dimensions(data)
            if dims is None:
                report.fail(f"{label}: icon {src!r} is NOT a valid PNG")
            else:
                expected = f"{dims[0]}x{dims[1]}"
                report.check(
                    expected == sizes.lower() or expected in sizes.lower().split(),
                    f"{label}: icon {src} valid PNG {expected} ({len(data)} B, purpose={purpose})",
                    f"{label}: icon {src} PNG dimensions {expected} do not match declared sizes={sizes!r}",
                )
            if resolved_mime and "image/png" not in resolved_mime.lower():
                report.fail(f"{label}: icon {src} served with MIME {resolved_mime!r}, expected image/png")
        elif mime == "image/svg+xml" or src.endswith(".svg"):
            report.check(
                b"<svg" in data[:512].lower(),
                f"{label}: icon {src} valid SVG ({len(data)} B)",
                f"{label}: icon {src} missing <svg> header",
            )
            if resolved_mime and "image/svg+xml" not in resolved_mime.lower():
                report.fail(f"{label}: icon {src} served with MIME {resolved_mime!r}, expected image/svg+xml")

    report.check("192x192" in seen_sizes, f"{label}: 192x192 icon declared", f"{label}: missing 192x192 icon")
    report.check("512x512" in seen_sizes, f"{label}: 512x512 icon declared", f"{label}: missing 512x512 icon")
    report.check(has_maskable, f"{label}: maskable icon declared", f"{label}: missing maskable icon")


def audit_sw_js(sw_path: Path, label: str, report: AuditReport) -> None:
    if not sw_path.is_file():
        report.fail(f"{label}: missing Service Worker at {sw_path}")
        return
    text = sw_path.read_text(encoding="utf-8")
    report.check(len(text.strip()) > 20, f"{label}: sw.js non-empty ({len(text)} B)", f"{label}: sw.js is empty")

    node = find_node()
    if node:
        proc = subprocess.run([node, "--check", str(sw_path)], capture_output=True, text=True)
        report.check(
            proc.returncode == 0,
            f"{label}: sw.js passed `node --check`",
            f"{label}: sw.js JS syntax error: {proc.stderr.strip() or proc.stdout.strip()}",
        )
    else:
        report.warn(f"{label}: node not found; skipped `node --check` on sw.js")

    for ev in ("install", "activate", "fetch"):
        report.check(
            re.search(rf"addEventListener\(\s*['\"]{ev}['\"]", text) is not None,
            f"{label}: sw.js handles '{ev}' event",
            f"{label}: sw.js missing '{ev}' event listener",
        )
    report.check(
        "/api" in text,
        f"{label}: sw.js explicitly handles /api routes (network-first/bypass)",
        f"{label}: sw.js does not mention /api routing guard",
    )


def audit_css_files(css_paths: list[Path], label: str, report: AuditReport) -> None:
    if not css_paths:
        report.fail(f"{label}: no CSS files found to audit")
        return
    combined = "\n".join(p.read_text(encoding="utf-8") for p in css_paths)

    report.check(
        "safe-area-inset-top" in combined,
        f"{label}: uses env(safe-area-inset-top) for Dynamic Island",
        f"{label}: missing env(safe-area-inset-top)",
    )
    report.check(
        "safe-area-inset-bottom" in combined,
        f"{label}: uses env(safe-area-inset-bottom) for Home Indicator",
        f"{label}: missing env(safe-area-inset-bottom)",
    )
    report.check(
        "100dvh" in combined or "dvh" in combined,
        f"{label}: uses dynamic viewport height (dvh)",
        f"{label}: missing dvh viewport sizing",
    )
    report.check(
        "backdrop-filter" in combined and "-webkit-backdrop-filter" in combined,
        f"{label}: uses backdrop-filter + -webkit-backdrop-filter",
        f"{label}: missing backdrop-filter or -webkit-backdrop-filter",
    )
    report.check(
        "touch-action" in combined,
        f"{label}: sets touch-action for crisp tap response",
        f"{label}: missing touch-action rule",
    )
    report.check(
        "-webkit-tap-highlight-color" in combined,
        f"{label}: sets -webkit-tap-highlight-color",
        f"{label}: missing -webkit-tap-highlight-color",
    )

    # Verify input/select/textarea font-size >= 16px rule (prevents iOS Safari auto-zoom)
    input_block_ok = False
    for match in re.finditer(r"([^{}]+)\{([^{}]+)\}", combined):
        sel = match.group(1).lower()
        body = match.group(2).lower()
        if all(tag in sel for tag in ("input", "select", "textarea")):
            fs = re.search(r"font-size\s*:\s*([0-9.]+)\s*(px|rem)", body)
            if fs:
                val = float(fs.group(1))
                unit = fs.group(2)
                if (unit == "px" and val >= 16) or (unit == "rem" and val >= 1.0):
                    input_block_ok = True
                    break
    # Also allow font-size: max(16px, ...) or CSS var that resolves to >= 16px
    if not input_block_ok:
        for match in re.finditer(r"([^{}]+)\{([^{}]+)\}", combined):
            sel = match.group(1).lower()
            body = match.group(2).lower()
            if "input" in sel and "select" in sel and "textarea" in sel:
                if re.search(r"font-size\s*:\s*(16px|1rem|var\(--text-input|max\(16px)", body):
                    input_block_ok = True
                    break

    report.check(
        input_block_ok,
        f"{label}: input/select/textarea enforce font-size >= 16px (prevents iOS Safari zoom)",
        f"{label}: could not verify input/select/textarea font-size >= 16px rule",
    )

    # Warn on any explicit <16px font-size on input/select/textarea selectors
    small_input_rules = []
    for match in re.finditer(r"([^{}]+)\{([^{}]+)\}", combined):
        sel = match.group(1).strip()
        sel_l = sel.lower()
        body = match.group(2).lower()
        if re.search(r"(^|[\s,+>])(input|select|textarea)([\s.:#\[]|$)", sel_l):
            for fs in re.finditer(r"font-size\s*:\s*([0-9.]+)\s*px", body):
                if float(fs.group(1)) < 16:
                    small_input_rules.append(f"{sel} -> {fs.group(0)}")
    if small_input_rules:
        report.fail(f"{label}: found <16px font-size on form controls (causes iOS zoom): {small_input_rules}")
    else:
        report.ok(f"{label}: no <16px font-size overrides on input/select/textarea")

    # Check external URLs in CSS
    ext_urls = [
        u for u in re.findall(r"url\(['\"]?(https?://[^)'\"]+)['\"]?\)", combined)
    ]
    if ext_urls:
        report.warn(f"{label}: external CSS url() found: {ext_urls}")
    else:
        report.ok(f"{label}: zero external CSS url() references")


def audit_ops_files(report: AuditReport) -> None:
    # run.sh
    run_sh = ROOT / "run.sh"
    if run_sh.is_file():
        text = run_sh.read_text(encoding="utf-8")
        proc = subprocess.run(["bash", "-n", str(run_sh)], capture_output=True, text=True)
        report.check(proc.returncode == 0, "ops: run.sh valid bash syntax", f"ops: run.sh syntax error: {proc.stderr}")
        report.check(
            "set -euo pipefail" in text,
            "ops: run.sh uses set -euo pipefail",
            "ops: run.sh missing set -euo pipefail",
        )
        report.check(
            "/home/ruslan_safaev/.local/bin" in text and "v22.23.2" in text,
            "ops: run.sh sets native Linux PATH for uv and Node 22.23.2",
            "ops: run.sh missing native Linux PATH export",
        )
        if not os.access(run_sh, os.X_OK):
            report.warn("ops: run.sh is not marked executable (chmod +x run.sh recommended)")
    else:
        report.fail("ops: missing run.sh")

    # Dockerfile
    dockerfile = ROOT / "Dockerfile"
    if dockerfile.is_file():
        text = dockerfile.read_text(encoding="utf-8")
        report.check(
            "FROM node:" in text and "FROM python:" in text,
            "ops: Dockerfile uses multi-stage Node + Python build",
            "ops: Dockerfile missing multi-stage Node/Python stages",
        )
        report.check(
            "0.0.0.0" in text or "ops/render/start.py" in text,
            "ops: Dockerfile binds 0.0.0.0 or uses ops/render/start.py",
            "ops: Dockerfile missing 0.0.0.0 host binding",
        )
        report.check(
            "PORT" in text or "ops/render/start.py" in text,
            "ops: Dockerfile respects Render $PORT",
            "ops: Dockerfile does not reference $PORT",
        )
        if "USER " in text:
            report.ok("ops: Dockerfile runs as non-root user")
        else:
            report.warn("ops: Dockerfile does not switch to a non-root USER")
    else:
        report.fail("ops: missing Dockerfile")

    # render.yaml
    render_yaml = ROOT / "render.yaml"
    if render_yaml.is_file():
        text = render_yaml.read_text(encoding="utf-8")
        report.check(
            "healthCheckPath: /api/health" in text,
            "ops: render.yaml defines healthCheckPath: /api/health",
            "ops: render.yaml missing healthCheckPath: /api/health",
        )
        report.check(
            "runtime: docker" in text,
            "ops: render.yaml uses runtime: docker",
            "ops: render.yaml missing runtime: docker",
        )
        report.check(
            "MARINA_DB_PATH" in text,
            "ops: render.yaml configures MARINA_DB_PATH",
            "ops: render.yaml missing MARINA_DB_PATH env var",
        )
    else:
        report.fail("ops: missing render.yaml")


def run_static_audit(check_dist: bool, report: AuditReport) -> None:
    index_html = ROOT / "index.html"
    if index_html.is_file():
        audit_html(index_html.read_text(encoding="utf-8"), "src/index.html", report)
    else:
        report.fail("src/index.html: file missing")

    def resolve_public(rel_url: str) -> tuple[bytes, str, str | None]:
        clean = rel_url.lstrip("/")
        p = ROOT / "public" / clean
        if not p.is_file():
            return b"", "", f"not found at {p}"
        return p.read_bytes(), "", None

    manifest_path = ROOT / "public" / "manifest.webmanifest"
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            audit_manifest_json(manifest, "public/manifest.webmanifest", resolve_public, report)
        except json.JSONDecodeError as exc:
            report.fail(f"public/manifest.webmanifest: invalid JSON ({exc})")
    else:
        report.fail("public/manifest.webmanifest: file missing")

    # Verify apple-touch-icon.png directly
    ati = ROOT / "public" / "icons" / "apple-touch-icon.png"
    if ati.is_file():
        dims = png_dimensions(ati.read_bytes())
        report.check(
            dims == (180, 180),
            f"public/icons/apple-touch-icon.png: valid 180x180 PNG ({ati.stat().st_size} B)",
            f"public/icons/apple-touch-icon.png: invalid PNG or wrong size ({dims})",
        )
    else:
        report.fail("public/icons/apple-touch-icon.png: file missing")

    audit_sw_js(ROOT / "public" / "sw.js", "public/sw.js", report)

    css_files = sorted((ROOT / "web" / "styles").glob("*.css")) if (ROOT / "web" / "styles").is_dir() else []
    audit_css_files(css_files, "web/styles/*.css", report)
    audit_ops_files(report)

    if check_dist:
        dist_dir = ROOT / "dist"
        if not dist_dir.is_dir():
            report.fail("dist/: directory missing (run `npm run build`)")
            return

        dist_index = dist_dir / "index.html"
        if dist_index.is_file():
            parser = audit_html(dist_index.read_text(encoding="utf-8"), "dist/index.html", report)
            # Verify every local link/script in dist/index.html exists in dist/
            for ref in [l.get("href", "") for l in parser.links] + [s.get("src", "") for s in parser.scripts]:
                if not ref or ref.startswith(("http://", "https://", "//", "data:")):
                    continue
                target = dist_dir / ref.lstrip("/")
                report.check(
                    target.is_file(),
                    f"dist asset exists: {ref}",
                    f"dist asset missing: {ref} (expected {target})",
                )
        else:
            report.fail("dist/index.html: file missing")

        def resolve_dist(rel_url: str) -> tuple[bytes, str, str | None]:
            p = dist_dir / rel_url.lstrip("/")
            if not p.is_file():
                return b"", "", f"not found at {p}"
            return p.read_bytes(), "", None

        dist_manifest = dist_dir / "manifest.webmanifest"
        if dist_manifest.is_file():
            try:
                audit_manifest_json(
                    json.loads(dist_manifest.read_text(encoding="utf-8")),
                    "dist/manifest.webmanifest",
                    resolve_dist,
                    report,
                )
            except json.JSONDecodeError as exc:
                report.fail(f"dist/manifest.webmanifest: invalid JSON ({exc})")
        else:
            report.fail("dist/manifest.webmanifest: file missing")

        audit_sw_js(dist_dir / "sw.js", "dist/sw.js", report)

        dist_css = sorted((dist_dir / "assets").glob("*.css")) if (dist_dir / "assets").is_dir() else []
        if dist_css:
            audit_css_files(dist_css, "dist/assets/*.css", report)
        else:
            report.fail("dist/assets/*.css: no built stylesheet found")


def http_get(base_url: str, path: str) -> tuple[int, dict[str, str], bytes, str | None]:
    url = urllib.parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    req = urllib.request.Request(url, headers={"User-Agent": "MarinaPWAudit/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            headers = {k.lower(): v for k, v in resp.headers.items()}
            return resp.status, headers, resp.read(), None
    except urllib.error.HTTPError as exc:
        headers = {k.lower(): v for k, v in exc.headers.items()} if exc.headers else {}
        return exc.code, headers, exc.read(), f"HTTP {exc.code}"
    except Exception as exc:  # noqa: BLE001
        return 0, {}, b"", str(exc)


def run_live_audit(base_url: str, report: AuditReport) -> None:
    # 1. /api/health
    status, headers, body, err = http_get(base_url, "/api/health")
    report.check(
        status == 200 and not err,
        f"live /api/health -> 200 ({body.decode('utf-8', 'replace')[:80]})",
        f"live /api/health failed: status={status} err={err}",
    )

    # 2. Root HTML
    status, headers, body, err = http_get(base_url, "/")
    if status != 200 or err:
        report.fail(f"live / failed: status={status} err={err}")
        return
    ct = headers.get("content-type", "")
    report.check(
        "text/html" in ct.lower(),
        f"live / -> 200 ({ct})",
        f"live / wrong Content-Type: {ct!r}",
    )
    html_text = body.decode("utf-8", "replace")
    parser = audit_html(html_text, "live /", report)

    # Verify all local assets referenced by live HTML return 200
    checked_refs: set[str] = set()
    for ref in [l.get("href", "") for l in parser.links] + [s.get("src", "") for s in parser.scripts]:
        if not ref or ref.startswith(("http://", "https://", "//", "data:")) or ref in checked_refs:
            continue
        checked_refs.add(ref)
        s, h, b, e = http_get(base_url, ref)
        report.check(
            s == 200 and not e and len(b) > 0,
            f"live asset {ref} -> 200 ({h.get('content-type', '')}, {len(b)} B)",
            f"live asset {ref} failed: status={s} err={e}",
        )

    # 3. Manifest
    status, headers, body, err = http_get(base_url, "/manifest.webmanifest")
    if status == 200 and not err:
        ct = headers.get("content-type", "").lower()
        report.check(
            "manifest+json" in ct or "application/json" in ct,
            f"live /manifest.webmanifest -> 200 ({ct})",
            f"live /manifest.webmanifest unexpected MIME: {ct!r}",
        )
        try:
            manifest = json.loads(body.decode("utf-8"))

            def resolve_live(rel_url: str) -> tuple[bytes, str, str | None]:
                s, h, b, e = http_get(base_url, rel_url)
                if s != 200 or e:
                    return b"", "", f"HTTP {s} {e or ''}".strip()
                return b, h.get("content-type", ""), None

            audit_manifest_json(manifest, "live /manifest.webmanifest", resolve_live, report)
        except json.JSONDecodeError as exc:
            report.fail(f"live /manifest.webmanifest invalid JSON: {exc}")
    else:
        report.fail(f"live /manifest.webmanifest failed: status={status} err={err}")

    # 4. apple-touch-icon.png
    status, headers, body, err = http_get(base_url, "/icons/apple-touch-icon.png")
    dims = png_dimensions(body) if status == 200 else None
    report.check(
        status == 200 and "image/png" in headers.get("content-type", "").lower() and dims == (180, 180),
        f"live /icons/apple-touch-icon.png -> 200 image/png 180x180 ({len(body)} B)",
        f"live /icons/apple-touch-icon.png failed: status={status} ct={headers.get('content-type')!r} dims={dims}",
    )

    # 5. Service Worker headers & JS validity
    status, headers, body, err = http_get(base_url, "/sw.js")
    if status == 200 and not err:
        ct = headers.get("content-type", "").lower()
        report.check(
            "javascript" in ct,
            f"live /sw.js -> 200 ({ct})",
            f"live /sw.js wrong MIME: {ct!r}",
        )
        cc = headers.get("cache-control", "").lower()
        report.check(
            any(tok in cc for tok in ("no-cache", "no-store", "max-age=0")),
            f"live /sw.js Cache-Control={headers.get('cache-control')!r}",
            f"live /sw.js missing Cache-Control: no-cache (got: {headers.get('cache-control')!r})",
        )
        swa = headers.get("service-worker-allowed", "")
        report.check(
            swa == "/",
            f"live /sw.js Service-Worker-Allowed={swa!r}",
            f"live /sw.js missing header 'Service-Worker-Allowed: /' (got: {swa!r})",
        )
    else:
        report.fail(f"live /sw.js failed: status={status} err={err}")

    # 6. SPA fallback route
    status, headers, body, err = http_get(base_url, "/goals")
    report.check(
        status == 200 and "text/html" in headers.get("content-type", "").lower(),
        f"live SPA fallback /goals -> 200 text/html",
        f"live SPA fallback /goals failed: status={status} ct={headers.get('content-type')!r}",
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="Marina Tracker PWA & Deployment Readiness Auditor")
    ap.add_argument("--static", action="store_true", help="Audit source files (index.html, public/, web/styles/, ops)")
    ap.add_argument("--dist", action="store_true", help="Also audit built dist/ artifacts")
    ap.add_argument("--url", default="", help="Live server base URL (e.g. http://127.0.0.1:8098)")
    ap.add_argument("--json", action="store_true", help="Output JSON report")
    args = ap.parse_args()

    if not args.static and not args.dist and not args.url:
        args.static = True
        args.dist = (ROOT / "dist").is_dir()

    report = AuditReport()
    if args.static or args.dist:
        run_static_audit(check_dist=args.dist, report=report)
    if args.url:
        run_live_audit(args.url, report)

    if args.json:
        print(
            json.dumps(
                {
                    "ok": len(report.failed) == 0,
                    "passed": report.passed,
                    "warnings": report.warnings,
                    "failed": report.failed,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        for msg in report.passed:
            print(f"[PASS] {msg}")
        for msg in report.warnings:
            print(f"[WARN] {msg}")
        for msg in report.failed:
            print(f"[FAIL] {msg}")
        print(
            f"\nSummary: {len(report.passed)} passed, {len(report.warnings)} warnings, {len(report.failed)} failed"
        )

    return 0 if not report.failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
