"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { IconButton } from "@/src/components/ui/icon-button";

/** Game panels stay inside the demo and leave the surrounding page available. */
export function FishingDialog({ title, expanded, busy, actions, footer, onClose, children }: {
  title: string;
  expanded: boolean;
  busy: boolean;
  actions?: ReactNode;
  footer?: ReactNode;
  onClose(): void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.querySelector(".rf-dialog-body")?.scrollTo(0, 0);
  }, [title]);

  return <div className="create-fishing-dialog-backdrop" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <div ref={panel} className="rf-dialog" role="dialog" aria-labelledby={titleId} tabIndex={-1} onKeyDown={event => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
      if (!expanded || event.key !== "Tab") return;
      const stops = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      if (!stops.length) { event.preventDefault(); return; }
      const first = stops[0], last = stops.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}>
      <div className="rf-dialog-title">
        <span id={titleId}>{title}</span>
        <span className="create-fishing-dialog-controls" data-theme="invert">{actions}<IconButton icon="close" label="Close panel" variant="ghost" size="sm" disabled={busy} onClick={onClose} /></span>
      </div>
      <div className="rf-dialog-body">{children}</div>
      {footer && <div className="rf-dialog-foot">{footer}</div>}
    </div>
  </div>;
}
