import React, { useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog } from '@/components/ui/dialog';
import WinEffects from './WinEffects';

const GameDialog = ({ title, backdropClassName, className, onClose, celebrate = false, children }) => {
  const previousFocus = useRef(globalThis.document?.activeElement);
  return (
  <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={backdropClassName} style={{ fontFamily: 'var(--font-ui)' }}>
        {celebrate ? <WinEffects fullscreen /> : null}
        <DialogPrimitive.Content
          className={className}
          dir="rtl"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (previousFocus.current?.isConnected) previousFocus.current.focus();
          }}
          style={{ maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', overscrollBehavior: 'contain', fontFamily: 'var(--font-ui)' }}
        >
          <DialogPrimitive.Title className="sr-only" style={{ position: 'absolute' }}>{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  </Dialog>
  );
};

export default GameDialog;
