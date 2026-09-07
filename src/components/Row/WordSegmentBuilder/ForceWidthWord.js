export const forceWidthStyle = (forceWidth) =>
  typeof forceWidth === "number"
    ? {
        display: "inline-block",
        width: `${forceWidth}px`,
      }
    : undefined;

export const ForceWidthWord = ({ forceWidth, inner }) => (
  <span className="wpadding" style={forceWidthStyle(forceWidth)}>
    {inner}
  </span>
);

export default ForceWidthWord;
