import React, { ReactNode, useEffect } from 'react';
import { XIcon } from './icons';

interface ModalProps {
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const Modal: React.FC<ModalProps> = ({ onClose, title, children }) => {
   useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex justify-center items-center p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-secondary/20">
          <h2 className="text-xl font-semibold text-on-surface">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-secondary/20 focus:outline-none"
            aria-label="Close modal"
          >
            <XIcon className="h-6 w-6 text-on-surface" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
