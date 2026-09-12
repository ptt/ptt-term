import cx from "classnames";
import { termColors, getContrastColor } from "../../../js/color_schemes";

export const ColorSpan = ({ className, colorState, inner }) => {
  let style;
  const minContrast = termColors.minimumContrast;
  if (minContrast > 0 && !termColors.forcePlainText && colorState.bg) {
    const fgIdx = colorState.fg !== undefined ? colorState.fg : 7;
    const bgIdx = colorState.bg;
    const baseFg = fgIdx === 7 ? termColors.defaultFg : termColors[fgIdx];
    const baseBg = termColors[bgIdx] || termColors.defaultBg;
    const adjustedFg = getContrastColor(baseFg, baseBg, minContrast);
    if (adjustedFg && adjustedFg !== baseFg) {
      style = { color: adjustedFg };
    }
  }
  return (
    <span
      className={cx(className, `q${colorState.fg}`, `b${colorState.bg}`, {
        qq: colorState.blink
      })}
      style={style}
    >
      {inner}
    </span>
  );
};

export default ColorSpan;
