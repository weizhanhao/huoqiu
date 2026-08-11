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
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    window.history.pushState({}, "", href);
    document.body.dataset.lastNavigation = href;
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <a href={href} onClick={navigate} {...properties}>
      {children}
    </a>
  );
}
