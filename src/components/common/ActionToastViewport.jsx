import { useEffect } from 'react';
import useToast from '../../hooks/useToast';
import { APP_TOAST_EVENT } from '../../lib/actionNotifications';
import ToastContainer from './ToastContainer';

const ActionToastViewport = () => {
  const { toasts, removeToast, showToast } = useToast();

  useEffect(() => {
    const handleNotification = (event) => {
      const { message, type = 'success' } = event.detail || {};
      if (message) showToast(message, type);
    };

    window.addEventListener(APP_TOAST_EVENT, handleNotification);
    return () => window.removeEventListener(APP_TOAST_EVENT, handleNotification);
  }, [showToast]);

  return <ToastContainer toasts={toasts} removeToast={removeToast} />;
};

export default ActionToastViewport;
