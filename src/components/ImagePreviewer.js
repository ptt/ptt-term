import React from "react";
import {
  TRUSTED_IMAGE_DOMAINS,
  isTrustedImageDomain,
  resolveImageUrl,
  getImageRenderedSize,
  getTop,
  getLeft,
} from "../js/image_preview_util";

export {
  TRUSTED_IMAGE_DOMAINS,
  isTrustedImageDomain,
  resolveImageUrl,
  getImageRenderedSize,
  getTop,
  getLeft,
};

const noop = () => {};

export const of = async (src) => ({ src });

export const resolveSrcToImageUrl = async ({ src }, whitelistOnly = true) => {
  const directSrc = resolveImageUrl(src, whitelistOnly);
  if (!directSrc) throw new Error("Unsupported image URL");
  return { src: directSrc };
};

export const resolveWithImageDOM = ({ src }) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.onload = () =>
      resolve({
        src,
        height: img.height,
        width: img.width,
      });
    img.onerror = reject;
    img.src = src;
  });

export const LoadingSpinner = ({ style, className = "" }) => (
  <svg
    className={`loading-spinner ${className}`}
    style={{ display: "inline-block", verticalAlign: "middle", ...style }}
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

ImagePreviewer.OnHover = ({ left, top, value, error }) => {
  const safeLeft = typeof left === "number" && !isNaN(left) ? left : 20;
  const safeTop = typeof top === "number" && !isNaN(top) ? top : 20;

  if (error) {
    return false;
  } else if (value) {
    const renderedSize = getImageRenderedSize(value.width, value.height);
    return (
      <img
        src={value.src}
        referrerPolicy="no-referrer"
        style={{
          display: "block",
          position: "fixed",
          left: getLeft(safeLeft, renderedSize.width),
          top: getTop(safeTop, renderedSize.height),
          maxHeight: "80vh",
          maxWidth: "90vw",
          zIndex: 100,
        }}
      />
    );
  } else {
    return (
      <LoadingSpinner
        style={{
          position: "fixed",
          left: safeLeft + 20,
          top: safeTop,
          zIndex: 100,
        }}
      />
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

ImagePreviewer.HoverPreview = ({ request, left, top }) => {
  if (!request) return null;
  return (
    <ImagePreviewer
      request={request}
      component={ImagePreviewer.OnHover}
      left={left}
      top={top}
    />
  );
};

export const createImagePreviewRequest = (href, whitelistOnly = true) => {
  const directSrc = resolveImageUrl(href, whitelistOnly);
  if (!directSrc) return null;
  return resolveWithImageDOM({ src: directSrc });
};

export const initialImagePreviewState = {
  currentImagePreview: undefined,
  left: undefined,
  top: undefined,
};

export const resetImagePreviewState = () => ({
  currentImagePreview: undefined,
  left: undefined,
  top: undefined,
});

export const updateImagePreviewMove = (state, clientX, clientY) => {
  if (state.currentImagePreview) {
    return { left: clientX, top: clientY };
  }
  return null;
};

export default ImagePreviewer;
