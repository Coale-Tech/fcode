import { useTranslation } from "react-i18next";
import type { UiMessage } from "@pi-desktop/shared";
import { useReferencedImageDataUrl } from "../../../lib/use-referenced-image-data-url";
import { toolResultPayload } from "../../../lib/tool-presentation";

/*
 * Screenshot and inline image rendering for tool rows that produce images:
 *   - browser: `details.screenshots[].dest` (file paths, loaded via IPC)
 *   - computer: `details.screenshots[].path` (file paths, loaded via IPC)
 *   - eval: `details.images[]` (base64 ImageContent blocks, rendered directly)
 *
 * Rendered after ToolDetailBlocks, inside the disclosure body so it only
 * appears when the row is expanded.  Returns null for all other tool names.
 */

/** One file-path screenshot loaded via IPC (browser or computer tools). */
function FileScreenshot({ path, mimeType, alt }: { path: string; mimeType?: string; alt: string }) {
  const dataUrl = useReferencedImageDataUrl(path, mimeType);
  if (!dataUrl) return null;
  return (
    <div className="tool-screenshot">
      <img src={dataUrl} alt={alt} className="tool-screenshot-img" />
    </div>
  );
}

/** One base64 image from eval `details.images[]`. */
function InlineImage({ data, mimeType, alt }: { data: string; mimeType: string; alt: string }) {
  const src = `data:${mimeType};base64,${data}`;
  return (
    <div className="tool-screenshot">
      <img src={src} alt={alt} className="tool-screenshot-img" />
    </div>
  );
}

/** Safely extract an array from a details record field. */
function safeArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Screenshot strip for browser/computer/eval tool rows.
 * Returns null when the tool produces no visual output.
 */
export function ToolScreenshots({ message }: { message: UiMessage }) {
  const { t } = useTranslation();
  const toolName = (message.toolName ?? "").toLowerCase();
  const payload = toolResultPayload(message);
  const details = asRecord(payload);
  const alt = t("chat.toolScreenshot");

  if (toolName === "browser") {
    const screenshots = safeArray(details?.screenshots);
    if (!screenshots || screenshots.length === 0) return null;
    return (
      <div className="tool-screenshots">
        {screenshots.map((raw, i) => {
          const shot = asRecord(raw);
          const dest = typeof shot?.dest === "string" ? shot.dest : null;
          const mimeType = typeof shot?.mimeType === "string" ? shot.mimeType : undefined;
          return dest ? (
            <FileScreenshot key={i} path={dest} mimeType={mimeType} alt={alt} />
          ) : null;
        })}
      </div>
    );
  }

  if (toolName === "computer") {
    const screenshots = safeArray(details?.screenshots);
    if (!screenshots || screenshots.length === 0) return null;
    return (
      <div className="tool-screenshots">
        {screenshots.map((raw, i) => {
          const shot = asRecord(raw);
          const path = typeof shot?.path === "string" ? shot.path : null;
          return path ? <FileScreenshot key={i} path={path} alt={alt} /> : null;
        })}
      </div>
    );
  }

  if (toolName === "eval") {
    const images = safeArray(details?.images);
    if (!images || images.length === 0) return null;
    return (
      <div className="tool-screenshots">
        {images.map((raw, i) => {
          const img = asRecord(raw);
          const data = typeof img?.data === "string" ? img.data : null;
          const mimeType = typeof img?.mimeType === "string" ? img.mimeType : "image/png";
          return data ? (
            <InlineImage key={i} data={data} mimeType={mimeType} alt={alt} />
          ) : null;
        })}
      </div>
    );
  }

  return null;
}
