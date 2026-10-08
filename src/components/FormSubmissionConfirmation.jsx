import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CircleHelp } from 'lucide-react';

const FormSubmissionConfirmation = () => {
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const pendingSubmissionRef = useRef(null);
  const replayingFormRef = useRef(null);
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    pendingSubmissionRef.current = null;
    setIsOpen(false);

    if (pathname.startsWith('/login/')) return undefined;

    const confirmBeforeSubmit = (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      if (replayingFormRef.current === form) {
        replayingFormRef.current = null;
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      if (pendingSubmissionRef.current) return;

      pendingSubmissionRef.current = {
        form,
        submitter: event.submitter
      };
      setIsOpen(true);
    };

    document.addEventListener('submit', confirmBeforeSubmit, true);
    return () => document.removeEventListener('submit', confirmBeforeSubmit, true);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return undefined;

    cancelButtonRef.current?.focus();
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      pendingSubmissionRef.current = null;
      setIsOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const cancelSubmission = () => {
    const pendingSubmission = pendingSubmissionRef.current;
    pendingSubmissionRef.current = null;
    setIsOpen(false);
    requestAnimationFrame(() => pendingSubmission?.submitter?.focus?.());
  };

  const continueSubmission = () => {
    const pendingSubmission = pendingSubmissionRef.current;
    pendingSubmissionRef.current = null;
    setIsOpen(false);

    if (!pendingSubmission?.form.isConnected) return;

    const { form, submitter } = pendingSubmission;
    replayingFormRef.current = form;

    if (submitter instanceof HTMLElement && submitter.isConnected) {
      form.requestSubmit(submitter);
    } else {
      form.requestSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="submission-confirmation-title"
        aria-describedby="submission-confirmation-message"
        className="w-full max-w-sm rounded-xl border border-[#e9c46a]/50 bg-white p-6 shadow-2xl"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f6f0e3] text-[#956621]">
          <CircleHelp aria-hidden="true" size={26} />
        </div>
        <h2 id="submission-confirmation-title" className="text-center text-lg font-semibold text-slate-900">
          Are you sure you want to continue?
        </h2>
        <p id="submission-confirmation-message" className="mt-2 text-center text-sm leading-6 text-slate-600">
          This will submit the information you entered.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={cancelSubmission}
            className="min-h-11 flex-1 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c49a45]"
          >
            Go back
          </button>
          <button
            type="button"
            onClick={continueSubmission}
            className="min-h-11 flex-1 rounded-lg bg-[#c49a45] px-4 text-sm font-semibold text-[#183c30] transition-colors hover:bg-[#b18835] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#956621] focus-visible:ring-offset-2"
          >
            Continue
          </button>
        </div>
      </section>
    </div>
  );
};

export default FormSubmissionConfirmation;