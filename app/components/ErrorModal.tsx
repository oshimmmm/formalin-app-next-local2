// app/components/ErrorModal.tsx
"use client";

import React from "react";

interface ModalProps {
  visible: boolean;
  title?: string;
  message: string;
  onClose: () => void;
}

export default function Modal({ visible, title = "お知らせ", message, onClose }: ModalProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-1/3 max-w-md p-6">
        <h2 className="text-2xl font-semibold mb-4">{title}</h2>
        <p className="mb-6">{message}</p>
        <div className="text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
