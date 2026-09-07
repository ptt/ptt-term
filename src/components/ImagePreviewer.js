import React from "react";
import {
  TRUSTED_IMAGE_DOMAINS,
  isTrustedImageDomain,
  resolveImageUrl,
  getImageRenderedSize,
  getTop,
  getLeft,
  getPopupPosition,
  initialImagePreviewState,
  resetImagePreviewState,
  updateImagePreviewMove,
} from "../js/image_preview_util";
import { i18n } from "../js/i18n";

export {
  TRUSTED_IMAGE_DOMAINS,
  isTrustedImageDomain,
  resolveImageUrl,
  getImageRenderedSize,
  getTop,
  getLeft,
  getPopupPosition,
  initialImagePreviewState,
  resetImagePreviewState,
  updateImagePreviewMove,
};

const noop = () => {};

export const of = async (src) => ({ src });

export const resolveSrcToImageUrl = async ({ src }, whitelistOnly = true) => {
  const directSrc = resolveImageUrl(src, whitelistOnly);
  if (!directSrc) throw new Error("Unsupported image URL");
  return { src: directSrc };
};

export const resolveWithImageDOM = ({ src }, timeoutMs = 10000) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    let timer = null;
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      if (timer) clearTimeout(timer);
      resolve({
        src,
        height: img.height,
        width: img.width,
      });
    };
    img.onerror = () => {
      if (timer) clearTimeout(timer);
      reject(new Error("Failed to load image"));
    };
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        img.src = "";
        reject(new Error("Image load timed out"));
      }, timeoutMs);
    }
    img.src = src;
  });

const imageCache = new Map();
const MAX_CACHE_SIZE = 100;

export const getCachedImageRequest = (src, timeoutMs = 10000) => {
  if (imageCache.has(src)) {
    return imageCache.get(src);
  }
  const promise = resolveWithImageDOM({ src }, timeoutMs).catch((err) => {
    imageCache.delete(src);
    throw err;
  });
  if (imageCache.size >= MAX_CACHE_SIZE) {
    const firstKey = imageCache.keys().next().value;
    imageCache.delete(firstKey);
  }
  imageCache.set(src, promise);
  return promise;
};

export const clearImagePreviewCache = () => {
  imageCache.clear();
};

export const LoadingSpinner = ({ style, className = "" }) => (
  <svg
    className={`loading-spinner ${className}`}
    style={{
      display: "inline-block",
      verticalAlign: "middle",
      pointerEvents: "none",
      ...style,
    }}
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
  >
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke="currentColor"
      strokeWidth="3"
      strokeOpacity="0.25"
    />
    <path
      d="M12 3a9 9 0 0 1 9 9"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

export class ImagePreviewer extends React.PureComponent {
  state = {
    pending: undefined,
    value: undefined,
    error: undefined,
  };

  componentDidMount() {
    this.handleStart();
  }

  componentDidUpdate(prevProps) {
    if (this.props.request !== prevProps.request) {
      this.handleStart();
    }
  }

  handleStart(props) {
    const { request } = this.props;
    if (!request) return;
    this.setState({
      pending: request,
      value: undefined,
      error: undefined,
    });
    this.loadRequest(request);
  }

  async loadRequest(request) {
    try {
      const value = await request;
      if (this.state.pending === request) {
        this.setState({ value, error: undefined });
      }
    } catch (error) {
      if (this.state.pending === request) {
        this.setState({ error, value: undefined });
      }
    }
  }

  render() {
    return React.createElement(this.props.component, {
      ...this.props,
      component: undefined,
      request: undefined,
      value: this.state.value,
      error: this.state.error,
    });
  }
}

ImagePreviewer.OnHover = ({ left, top, value, error, href }) => {
  const safeLeft = typeof left === "number" && !isNaN(left) ? left : 20;
  const safeTop = typeof top === "number" && !isNaN(top) ? top : 20;

  let hostname = "";
  const targetUrl = href || (value && value.src);
  if (targetUrl) {
    try {
      hostname = new URL(targetUrl).hostname;
    } catch (e) {}
  }

  const popupPos = getPopupPosition(safeLeft, safeTop);

  if (error) {
    return (
      <div
        className="image-preview-popup image-preview-error"
        style={{
          position: "fixed",
          left: popupPos.left,
          top: popupPos.top,
          zIndex: 100,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 14px",
          backgroundColor: "rgba(35, 20, 20, 0.92)",
          color: "#ff9999",
          borderRadius: "6px",
          border: "1px solid rgba(255, 100, 100, 0.3)",
          boxShadow: "0 6px 20px rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          fontSize: "12px",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          whiteSpace: "nowrap",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: "14px" }}>⚠️</span>
        <span>{i18n("imagePreview_failed") || "無法載入圖片預覽"}</span>
        {hostname && (
          <span style={{ opacity: 0.6, fontSize: "11px" }}>({hostname})</span>
        )}
      </div>
    );
  } else if (value) {
    const renderedSize = getImageRenderedSize(value.width, value.height);
    return (
      <div
        className="image-preview-popup image-preview-loaded"
        style={{
          position: "fixed",
          left: getLeft(safeLeft, renderedSize.width),
          top: getTop(safeTop, renderedSize.height),
          zIndex: 100,
          pointerEvents: "none",
          lineHeight: 0,
          borderRadius: "6px",
          overflow: "hidden",
          boxShadow: "0 8px 28px rgba(0, 0, 0, 0.65)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          userSelect: "none",
        }}
      >
        <img
          src={value.src}
          referrerPolicy="no-referrer"
          style={{
            display: "block",
            width: renderedSize.width,
            height: renderedSize.height,
            maxHeight: "80vh",
            maxWidth: "90vw",
            pointerEvents: "none",
          }}
        />
      </div>
    );
  } else {
    return (
      <div
        className="image-preview-popup image-preview-loading"
        style={{
          position: "fixed",
          left: popupPos.left,
          top: popupPos.top,
          zIndex: 100,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 14px",
          backgroundColor: "rgba(25, 25, 25, 0.92)",
          color: "#e0e0e0",
          borderRadius: "6px",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 6px 20px rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          fontSize: "12px",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          whiteSpace: "nowrap",
          userSelect: "none",
        }}
      >
        <LoadingSpinner style={{ width: 14, height: 14, flexShrink: 0 }} />
        <span>{i18n("imagePreview_loading") || "載入圖片中..."}</span>
        {hostname && (
          <span style={{ opacity: 0.6, fontSize: "11px" }}>({hostname})</span>
        )}
      </div>
    );
  }
};

ImagePreviewer.Inline = ({ value, error }) => {
  if (error) {
    return false;
  } else if (value) {
    return (
      <img
        className="easyReadingImg hyperLinkPreview"
        src={value.src}
        referrerPolicy="no-referrer"
      />
    );
  } else {
    return <LoadingSpinner />;
  }
};

ImagePreviewer.HoverPreview = ({ request, href, left, top }) => {
  if (!request) return null;
  return (
    <ImagePreviewer
      request={request}
      component={ImagePreviewer.OnHover}
      href={href}
      left={left}
      top={top}
    />
  );
};

export const createImagePreviewRequest = (href, whitelistOnly = true) => {
  const directSrc = resolveImageUrl(href, whitelistOnly);
  if (!directSrc) return null;
  return getCachedImageRequest(directSrc);
};

export default ImagePreviewer;


