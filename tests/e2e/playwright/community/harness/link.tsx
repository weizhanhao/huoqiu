import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkProperties = Readonly<
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }
>;

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
