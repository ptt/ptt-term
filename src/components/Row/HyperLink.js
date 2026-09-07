export const HyperLink = ({
  col,
  row,
  href,
  inner,
  onMouseOver,
  onMouseOut
}) => {
  const isAction = typeof href === "string" && href.includes("#aid=");
  return (
    <a
      onMouseOver={onMouseOver}
      onMouseOut={onMouseOut}
      scol={col} // FIXME: data-?
      srow={row} // FIXME: data-?
      className={isAction ? "aid-action" : "y"}
      href={href}
      rel={isAction ? undefined : "noreferrer"}
      target={isAction ? undefined : "_blank"}
    >
      {inner}
    </a>
  );
};

export default HyperLink;
