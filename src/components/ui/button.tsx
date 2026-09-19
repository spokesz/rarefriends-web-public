"use client";


import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { Icon } from "./icon";
import type { Size, Variant } from "./types";

type ButtonProps = {
  children: ReactNode;
  href?: string;
  target?: string;
  rel?: string;
  download?: boolean | string;
  variant?: Variant;
  size?: Size;
  icon?: string;
  iconRight?: string;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  brackets?: boolean;
  preserveCase?: boolean;
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit" | "reset";
};

export function Button({
  children,
  href,
  target,
  rel,
  download,
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  disabled = false,
  block = false,
  brackets = true,
  preserveCase = false,
  className = "",
  onClick,
  type = "button",
}: ButtonProps) {
  function leadingGlyph() {
    if (loading) return <span className="rf-spinner" aria-hidden />;
    if (icon) return <Icon name={icon} size={12} />;
    return null;
  }

  const content = (
    <>
      {leadingGlyph()}
      <span>{children}</span>
      {iconRight && !loading ? <Icon name={iconRight} size={12} /> : null}
    </>
  );

  const attrs = {
    className: `rf-btn ${className}`.trim(),
    "data-variant": variant,
    "data-size": size,
    "data-brackets": brackets,
    "data-block": block,
    "data-loading": loading,
    "data-case": preserveCase ? "preserve" : undefined,
    "aria-busy": loading || undefined,
  };

  if (href && !disabled && download !== undefined && download !== false) {
    return (
      <a href={href} target={target} rel={rel} download={download} {...attrs}>
        {content}
      </a>
    );
  }

  if (href && !disabled) {
    return (
      <Link href={href} target={target} rel={rel} {...attrs}>
        {content}
      </Link>
    );
  }

  return (
    <button {...attrs} type={type} onClick={onClick} disabled={disabled || loading}>
      {content}
    </button>
  );
}
