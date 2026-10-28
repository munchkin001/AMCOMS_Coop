import { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react';
import { sanitizeRichTextHtml } from '../../lib/richText';

const fonts = ['Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Courier New'];
const sizes = [
  ['1', 'Small'],
  ['2', 'Small/medium'],
  ['3', 'Normal'],
  ['4', 'Large'],
  ['5', 'Larger'],
  ['6', 'Heading'],
  ['7', 'Title']
];

const RichTextEditor = ({ id, value, onChange, placeholder, className = '' }) => {
  const editorRef = useRef(null);
  const selectionRef = useRef(null);
  const syncedValueRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;
    if (syncedValueRef.current === value) return;
    const safeValue = sanitizeRichTextHtml(value);
    if (editorRef.current.innerHTML !== safeValue) editorRef.current.innerHTML = safeValue;
    syncedValueRef.current = value;
  }, [value]);

  const saveSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
    selectionRef.current = selection.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (!selectionRef.current) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(selectionRef.current);
  };

  const applyCommand = (command, valueArgument) => {
    restoreSelection();
    document.execCommand(command, false, valueArgument);
    saveSelection();
    if (editorRef.current) {
      syncedValueRef.current = editorRef.current.innerHTML;
      onChange(editorRef.current.innerHTML);
    }
  };

  const toolbarButton = (label, Icon, command, valueArgument) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(event) => {
        event.preventDefault();
        saveSelection();
      }}
      onClick={() => applyCommand(command, valueArgument)}
      className="inline-flex size-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
    >
      <Icon aria-hidden="true" size={16} />
    </button>
  );

  return (
    <div className={`overflow-hidden rounded-lg border border-slate-300 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20 ${className}`}>
      <div role="toolbar" aria-label="Text formatting" className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
        {toolbarButton('Bold', Bold, 'bold')}
        {toolbarButton('Italic', Italic, 'italic')}
        {toolbarButton('Underline', Underline, 'underline')}
        <span aria-hidden="true" className="mx-1 h-6 border-l border-slate-300" />
        {toolbarButton('Bulleted list', List, 'insertUnorderedList')}
        {toolbarButton('Numbered list', ListOrdered, 'insertOrderedList')}
        <label className="sr-only" htmlFor={`${id}-font`}>Font</label>
        <select
          id={`${id}-font`}
          aria-label="Font"
          defaultValue="Arial"
          onMouseDown={saveSelection}
          onChange={(event) => applyCommand('fontName', event.target.value)}
          className="h-9 max-w-36 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
        >
          {fonts.map((font) => <option key={font} value={font}>{font}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${id}-size`}>Text size</label>
        <select
          id={`${id}-size`}
          aria-label="Text size"
          defaultValue="3"
          onMouseDown={saveSelection}
          onChange={(event) => applyCommand('fontSize', event.target.value)}
          className="h-9 max-w-32 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
        >
          {sizes.map(([size, label]) => <option key={size} value={size}>{label}</option>)}
        </select>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-xs font-medium text-slate-700 hover:bg-slate-100">
          <span>Text color</span>
          <input
            type="color"
            aria-label="Text color"
            defaultValue="#1f2937"
            onMouseDown={saveSelection}
            onChange={(event) => applyCommand('foreColor', event.target.value)}
            className="size-5 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
      </div>
      <div
        id={id}
        ref={editorRef}
        role="textbox"
        aria-label={placeholder}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(event) => {
          syncedValueRef.current = event.currentTarget.innerHTML;
          onChange(event.currentTarget.innerHTML);
        }}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onBlur={(event) => {
          if (event.currentTarget.parentElement?.contains(event.relatedTarget)) return;
          selectionRef.current = null;
          const safeValue = sanitizeRichTextHtml(event.currentTarget.innerHTML);
          if (event.currentTarget.innerHTML !== safeValue) event.currentTarget.innerHTML = safeValue;
          syncedValueRef.current = safeValue;
          onChange(safeValue);
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
        className="min-h-56 whitespace-pre-wrap break-words px-3.5 py-3 text-sm leading-6 text-slate-900 before:text-slate-400 before:content-[attr(data-placeholder)] empty:before:pointer-events-none"
      />
    </div>
  );
};

export default RichTextEditor;
