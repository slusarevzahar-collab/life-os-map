// LifeMap UI V2 — rename/create/delete modal (Stage 5A).
import { useEffect, useRef, useState } from 'react';

export function TextInputDialogV2({ dialog, busy, error, onSubmit, onCancel }) {
  const [value, setValue] = useState(dialog?.initialValue || '');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setValue(dialog?.initialValue || '');
  }, [dialog?.id, dialog?.initialValue]);

  useEffect(() => {
    if (!dialog) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      if (dialog.mode === 'confirm') rootRef.current?.querySelector('[data-confirm-danger]')?.focus();
      else inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [dialog?.id, dialog?.mode]);

  if (!dialog) return null;
  const isConfirm = dialog.mode === 'confirm';
  const isCreate = dialog.mode === 'create';

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (busy) return;
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = rootRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])');
    if (!focusables?.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = (event) => {
    event?.preventDefault?.();
    if (busy) return;
    onSubmit(isConfirm ? true : value);
  };

  const busyLabel = isConfirm ? 'Удаляю…' : isCreate ? 'Создаю…' : 'Сохраняю…';

  return (
    <div
      className="lifemapV2DialogOverlay"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        ref={rootRef}
        className="lifemapV2Dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lifemapV2DialogTitle"
        aria-describedby={isConfirm ? 'lifemapV2DialogDescription' : undefined}
        onKeyDown={handleKeyDown}
        onSubmit={submit}
      >
        <span className="lifemapV2DialogEyebrow">
          {isConfirm ? 'ПОДТВЕРЖДЕНИЕ' : isCreate ? 'НОВЫЙ ОБЪЕКТ' : 'ПЕРЕИМЕНОВАНИЕ'}
        </span>
        <h2 id="lifemapV2DialogTitle" className="lifemapV2DialogTitle">{dialog.title}</h2>
        {isConfirm ? (
          <p id="lifemapV2DialogDescription" className="lifemapV2DialogBody">{dialog.message}</p>
        ) : (
          <label className="lifemapV2DialogField">
            <span>{dialog.label}</span>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={dialog.placeholder}
              aria-label={dialog.label}
              disabled={busy}
            />
          </label>
        )}
        {error ? <div className="lifemapV2DialogError" role="alert">{error}</div> : null}
        <div className="lifemapV2DialogActions">
          <button type="button" className="lifemapV2DialogCancel" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
          <button
            type="submit"
            data-confirm-danger={isConfirm ? 'true' : undefined}
            className={isConfirm ? 'lifemapV2DialogDanger' : 'lifemapV2DialogConfirm'}
            disabled={busy || (!isConfirm && !value.trim())}
          >
            {busy ? busyLabel : isConfirm ? dialog.confirmText || 'Удалить' : dialog.confirmText || (isCreate ? 'Создать' : 'Сохранить')}
          </button>
        </div>
      </form>
    </div>
  );
}
