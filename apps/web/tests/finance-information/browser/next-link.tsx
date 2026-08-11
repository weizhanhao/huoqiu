import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

type LinkProperties = Readonly<{
  children: ReactNode;
  href: string;
}> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export default function Link({
  children,
  href,
  onClick,
  ...properties
}: LinkProperties) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    document.body.dataset.lastNavigation = href;
  };

  return (
    <a href={href} onClick={handleClick} {...properties}>
      {children}
    </a>
  );
}
