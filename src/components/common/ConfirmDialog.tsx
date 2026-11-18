"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog } from "./Dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <Dialog title={title} onClose={onCancel}>
      <div className="confirm-dialog-body">
        <div className={`confirm-dialog-icon ${destructive ? "is-destructive" : ""}`}>
          <AlertTriangle size={22} />
        </div>
        <h2 className="confirm-dialog-title">{title}</h2>
        <p className="confirm-dialog-desc">{description}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="quiet-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`primary-button ${destructive ? "is-destructive" : ""}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
