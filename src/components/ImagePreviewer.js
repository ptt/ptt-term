import React from "react";

const B58_ALPHABET = "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

function base58Decode(str) {
  let num = 0;
  for (let i = 0; i < str.length; i++) {
    const idx = B58_ALPHABET.indexOf(str[i]);
    if (idx === -1) return 0;
    num = num * 58 + idx;
  }
  return num;
}

const noop = () => {};

export const of = async src => ({ src });

export const resolveSrcToImageUrl = async ({ src }) =>
  await imageUrlResolvers.find(r => r.test(src)).request(src);

export const resolveWithImageDOM = ({ src }) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        src,
        height: img.height
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
    error: undefined
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
      error: undefined
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
      error: this.state.error
    });
  }
}

const getTop = (top, height) => {
  const pageHeight = window.innerHeight;
  const safeTop = typeof top === "number" && !isNaN(top) ? top : 20;
  const safeHeight = typeof height === "number" && !isNaN(height) ? height : 0;

  // opening image would pass the bottom of the page
  if (safeTop + safeHeight / 2 > pageHeight - 20) {
    if (safeHeight / 2 < safeTop) {
      return pageHeight - 20 - safeHeight;
    }
  } else if (safeTop - 20 > safeHeight / 2) {
    return safeTop - safeHeight / 2;
  }
  return 20;
};

ImagePreviewer.OnHover = ({ left, top, value, error }) => {
  const safeLeft = typeof left === "number" && !isNaN(left) ? left + 20 : 20;
  const safeTop = typeof top === "number" && !isNaN(top) ? top : 20;

  if (error) {
    return false;
  } else if (value) {
    return (
      <img
        src={value.src}
        style={{
          display: "block",
          position: "absolute",
          left: safeLeft,
          top: getTop(safeTop, value.height),
          maxHeight: "80%",
          maxWidth: "90%",
          zIndex: 2
        }}
      />
    );
  } else {
    return (
      <LoadingSpinner
        style={{
          position: "absolute",
          left: safeLeft,
          top: safeTop,
          zIndex: 2
        }}
      />
    );
  }
};

ImagePreviewer.Inline = ({ value, error }) => {
  if (error) {
    return false;
  } else if (value) {
    return <img className="easyReadingImg hyperLinkPreview" src={value.src} />;
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

const imageUrlResolvers = [
  {
    /*
     * Default
     */
    test() {
      return true;
    },
    async request() {
      throw new Error("Unimplemented");
    }
  }
];

const registerImageUrlResolver = imageUrlResolvers.unshift.bind(
  imageUrlResolvers
);

registerImageUrlResolver({
  /*
   * Flic.kr
   */
  regex: /flic\.kr\/p\/(\w+)|flickr\.com\/photos\/[\w@]+\/(\d+)/,
  test(src) {
    return this.regex.test(src);
  },
  async request(src) {
    const [, flickrBase58Id, flickrPhotoId] = src.match(this.regex);
    const photoId = flickrBase58Id ? base58Decode(flickrBase58Id) : flickrPhotoId;

    const params = new URLSearchParams({
      method: "flickr.photos.getInfo",
      api_key: "c8c95356e465b8d7398ff2847152740e",
      photo_id: photoId,
      format: "json",
      nojsoncallback: "1"
    });
    const apiURL = `https://api.flickr.com/services/rest/?${params.toString()}`;
    const res = await fetch(apiURL, { mode: "cors" });
    const data = await res.json();
    if (!data.photo) {
      throw new Error("Not found");
    }
    const { farm, server: svr, id, secret } = data.photo;
    return {
      src: `https://farm${farm}.staticflickr.com/${svr}/${id}_${secret}.jpg`
    };
  }
});

registerImageUrlResolver({
  /*
   * imgur.com
   */
  regex: /^https?:\/\/(?:i\.)?imgur\.com\/([^.]+)(?:\.(.*))?/,
  test(src) {
    return this.regex.test(src);
  },
  async request(src) {
    const [_, photoId, extension = "jpg"] = this.regex.exec(src);
    return {
      src: `https://i.imgur.com/${photoId}.${extension}`
    };
  }
});

export const createImagePreviewRequest = async (href) => {
  const { src } = await of(href);
  const resolved = await resolveSrcToImageUrl({ src });
  return await resolveWithImageDOM(resolved);
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
