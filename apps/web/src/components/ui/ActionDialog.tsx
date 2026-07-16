import type { ReactNode } from 'react';
import {
  Button,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from 'react-aria-components';

import styles from './ActionDialog.module.css';

export function ActionDialog({
  eyebrow,
  title,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <ModalOverlay
      className={styles.overlay}
      isOpen
      isDismissable
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Modal className={styles.modal}>
        <Dialog className={styles.dialog}>
          <div className={styles.heading}>
            <div>
              <p>{eyebrow}</p>
              <Heading slot="title">{title}</Heading>
            </div>
            <Button
              className={styles.closeButton}
              aria-label="Close"
              onPress={onClose}
            >
              ×
            </Button>
          </div>
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
