import cx from "classnames";
import React, { useRef, useLayoutEffect } from "react";
import { i18n } from "../../js/i18n";
import "./DropdownMenu.css";

const top = (mouseHeight, menuHeight) => {
  const pageHeight = typeof window !== "undefined" ? window.innerHeight : 600;

  // opening menu would pass the bottom of the page
  if (mouseHeight + menuHeight > pageHeight && menuHeight < mouseHeight) {
    return mouseHeight - menuHeight;
  }
  return mouseHeight;
};

const left = (mouseWidth, menuWidth) => {
  const pageWidth = typeof window !== "undefined" ? window.innerWidth : 800;

  // opening menu would pass the side of the page
  if (mouseWidth + menuWidth > pageWidth && menuWidth < mouseWidth) {
    return mouseWidth - menuWidth;
  }
  return mouseWidth;
};

const normalizeSelectedText = (selectedText) => {
  if (selectedText.length > 15) {
    return `${selectedText.slice(0, 15)} …`;
  }
  return selectedText;
};

const isMac = typeof navigator !== "undefined" && (
  /Mac|iPod|iPhone|iPad/i.test(navigator.platform || "") ||
  /Macintosh|Mac OS X/i.test(navigator.userAgent || "")
);

const MenuItem = ({
  eventKey,
  onSelect,
  onClick,
  divider,
  className,
  children,
  openedAtRef,
}) => {
  if (divider) {
    return <li role="separator" className="divider" />;
  }
  const handleClick = (e) => {
    e.preventDefault();
    if (openedAtRef && Date.now() < openedAtRef.current + 350) {
      return;
    }
    if (onSelect) onSelect(eventKey);
    if (onClick) onClick(e);
  };
  return (
    <li role="presentation" className={className}>
      <a role="menuitem" tabIndex="-1" href="#" onClick={handleClick}>
        {children}
      </a>
    </li>
  );
};

export const DropdownMenu = ({
  open,
  pageX,
  pageY,
  anchorRect,
  urlEnabled,
  normalEnabled,
  selEnabled,
  mouseBrowsingEnabled,
  selectedText,
  onMenuSelect,
  onInputHelperClick,
  onSettingsClick,
}) => {
  const menuRef = useRef(null);
  const openedAtRef = useRef(0);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    if (!open) {
      el.style.visibility = "hidden";
      return;
    }

    openedAtRef.current = Date.now();

    const updatePosition = () => {
      el.style.visibility = "hidden";
      const pageHeight =
        typeof window !== "undefined" ? window.innerHeight : 600;
      const pageWidth =
        typeof window !== "undefined" ? window.innerWidth : 800;

      if (anchorRect) {
        const isBottomHalf = anchorRect.top > pageHeight / 2;
        if (isBottomHalf) {
          const menuTop = Math.max(8, anchorRect.top - el.clientHeight - 6);
          el.style.top = `${menuTop}px`;
        } else {
          const menuTop = Math.min(
            pageHeight - el.clientHeight - 8,
            anchorRect.bottom + 6
          );
          el.style.top = `${menuTop}px`;
        }
        const menuLeft = Math.max(
          8,
          Math.min(
            pageWidth - el.clientWidth - 8,
            anchorRect.right - el.clientWidth
          )
        );
        el.style.left = `${menuLeft}px`;
      } else {
        el.style.top = `${top(pageY, el.clientHeight)}px`;
        el.style.left = `${left(pageX, el.clientWidth)}px`;
      }
      el.style.visibility = "visible";
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, pageX, pageY, anchorRect]);

  const handleContextMenu = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <ul
      className="dropdown-menu DropdownMenu--reset"
      ref={menuRef}
      onContextMenu={handleContextMenu}
      onClickCapture={(e) => {
        if (Date.now() < openedAtRef.current + 350) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {selEnabled && (
        <React.Fragment>
          <MenuItem eventKey="copy" onSelect={onMenuSelect}>
            {i18n("cmenu_copy")}
            <span className="DropdownMenu__Item__HotKey">
              {isMac ? "⌘C" : "Ctrl+C"}
            </span>
          </MenuItem>
          <MenuItem eventKey="copyAnsi" onSelect={onMenuSelect}>
            {i18n("cmenu_copyAnsi")}
          </MenuItem>
        </React.Fragment>
      )}
      {normalEnabled && (
        <MenuItem eventKey="paste" onSelect={onMenuSelect}>
          {i18n("cmenu_paste")}
          <span className="DropdownMenu__Item__HotKey">
            {isMac ? "⌘V" : "Shift+Insert"}
          </span>
        </MenuItem>
      )}
      {selEnabled && (
        <MenuItem eventKey="searchGoogle" onSelect={onMenuSelect}>
          {i18n("cmenu_searchGoogle")}{" "}
          <span>'{normalizeSelectedText(selectedText)}'</span>
        </MenuItem>
      )}
      {urlEnabled && (
        <React.Fragment>
          <MenuItem eventKey="openUrlNewTab" onSelect={onMenuSelect}>
            {i18n("cmenu_openUrlNewTab")}
          </MenuItem>
          <MenuItem eventKey="copyLinkUrl" onSelect={onMenuSelect}>
            {i18n("cmenu_copyLinkUrl")}
          </MenuItem>
        </React.Fragment>
      )}
      <MenuItem divider />
      {normalEnabled && (
        <React.Fragment>
          <MenuItem eventKey="selectAll" onSelect={onMenuSelect}>
            {i18n("cmenu_selectAll")}
            <span className="DropdownMenu__Item__HotKey">
              {isMac ? "⌘A" : "Ctrl+A"}
            </span>
          </MenuItem>
          <MenuItem
            eventKey="mouseBrowsing"
            onSelect={onMenuSelect}
            className={cx({
              "DropdownMenu__Item--checked": mouseBrowsingEnabled,
            })}
          >
            {i18n("cmenu_mouseBrowsing")}
          </MenuItem>
          <MenuItem onClick={onInputHelperClick}>
            {i18n("cmenu_showInputHelper")}
          </MenuItem>
          <MenuItem divider />
        </React.Fragment>
      )}
      <MenuItem onClick={onSettingsClick}>{i18n("cmenu_settings")}</MenuItem>
    </ul>
  );
};

export default DropdownMenu;
