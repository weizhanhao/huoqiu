import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkProperties = Readonly<{
  children: ReactNode;
  href: string;
}> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export default function Link({
  children,
  href,
  ...properties
}: LinkProperties) {
  return (
    <a href={href} {...properties}>
      {children}
    </a>
  );
}
