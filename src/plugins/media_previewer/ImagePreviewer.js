import React, { useState, useEffect, useRef } from "preact/compat";
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
  getSharedImageObserver,
  registerImageIntersection,
  resetSharedImageObserverForTest,
} from "./image_preview_util.js";
import { _ } from "../../js/i18n.js";

const h = React.createElement;

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
  LazyInlineImage,
  getSharedImageObserver,
  resetSharedImageObserverForTest,
};

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

export const LoadingSpinner = ({ style, className = "" }) =>
  h(
    "svg",
    {
      className: `loading-spinner ${className}`,
      style: {
        display: "inline-block",
        verticalAlign: "middle",
        pointerEvents: "none",
        ...style,
      },
      viewBox: "0 0 24 24",
      width: "16",
      height: "16",
      fill: "none",
    },
    h("circle", {
      cx: "12",
      cy: "12",
      r: "9",
      stroke: "currentColor",
      strokeWidth: "3",
      strokeOpacity: "0.25",
    }),
    h("path", {
      d: "M12 3a9 9 0 0 1 9 9",
      stroke: "currentColor",
      strokeWidth: "3",
      strokeLinecap: "round",
    })
  );

export class ImagePreviewer extends React.PureComponent {
  state = {
    pending: undefined,
    value: undefined,
    error: undefined,
  };

  componentDidMount() {
    this._unmounted = false;
    this.handleStart();
  }

  componentDidUpdate(prevProps) {
    if (this.props.request !== prevProps.request) {
      this.handleStart();
    }
  }

  componentWillUnmount() {
    this._unmounted = true;
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
      let value = await request;
      if (typeof value === "string") {
        value =
          this.props.component === ImagePreviewer.OnHover
            ? await getCachedImageRequest(value)
            : { src: value };
      } else if (
        value &&
        typeof value.src === "string" &&
        value.width === undefined &&
        this.props.component === ImagePreviewer.OnHover
      ) {
        value = await getCachedImageRequest(value.src);
      }
      if (!this._unmounted && this.state.pending === request) {
        this.setState({ value, error: undefined });
      }
    } catch (error) {
      if (!this._unmounted && this.state.pending === request) {
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
  const src = typeof value === "string" ? value : value?.src;
  const targetUrl = href || src;
  if (targetUrl) {
    try {
      hostname = new URL(targetUrl).hostname;
    } catch (e) {}
  }

  const popupPos = getPopupPosition(safeLeft, safeTop);

  if (error) {
    return h(
      "div",
      {
        className: "image-preview-popup image-preview-error",
        style: {
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
        },
      },
      h("span", { style: { fontSize: "14px" } }, "⚠️"),
      h("span", null, _("imagePreview_failed")),
      hostname
        ? h("span", { style: { opacity: 0.6, fontSize: "11px" } }, `(${hostname})`)
        : null
    );
  } else if (value) {
    const renderedSize = getImageRenderedSize(value.width, value.height);
    return h(
      "div",
      {
        className: "image-preview-popup image-preview-loaded",
        style: {
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
        },
      },
      h("img", {
        src,
        referrerPolicy: "no-referrer",
        loading: "lazy",
        style: {
          display: "block",
          width: renderedSize.width,
          height: renderedSize.height,
          maxHeight: "80vh",
          maxWidth: "90vw",
          pointerEvents: "none",
        },
      })
    );
  } else {
    return h(
      "div",
      {
        className: "image-preview-popup image-preview-loading",
        style: {
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
        },
      },
      h(LoadingSpinner, { style: { width: 14, height: 14, flexShrink: 0 } }),
      h("span", null, _("imagePreview_loading")),
      hostname
        ? h("span", { style: { opacity: 0.6, fontSize: "11px" } }, `(${hostname})`)
        : null
    );
  }
};

const LazyInlineImage = ({ src }) => {
  const [isVisible, setIsVisible] = useState(() => {
    return typeof IntersectionObserver === "undefined";
  });
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (isVisible || !containerRef.current) return;
    return registerImageIntersection(containerRef.current, () => {
      setIsVisible(true);
    });
  }, [isVisible]);

  if (hasError) {
    return null;
  }

  return h(
    "div",
    {
      ref: containerRef,
      className: "easyReadingImgContainer",
      style: { minHeight: isVisible ? undefined : "24px" },
    },
    isVisible
      ? h("img", {
          className: "easyReadingImg hyperLinkPreview",
          src,
          referrerPolicy: "no-referrer",
          loading: "lazy",
          onError: () => setHasError(true),
        })
      : null
  );
};

ImagePreviewer.Inline = ({ value, error }) => {
  if (error) {
    return false;
  } else if (value) {
    const src = typeof value === "string" ? value : value.src;
    return h(LazyInlineImage, { src });
  } else {
    return h(LoadingSpinner);
  }
};

ImagePreviewer.HoverPreview = ({ request, href, left, top }) => {
  if (!request) return null;
  return h(ImagePreviewer, {
    request,
    component: ImagePreviewer.OnHover,
    href,
    left,
    top,
  });
};

export const createImagePreviewRequest = (href, whitelistOnly = true) => {
  const directSrc = resolveImageUrl(href, whitelistOnly);
  if (!directSrc) return null;
  return getCachedImageRequest(directSrc);
};

export default ImagePreviewer;
