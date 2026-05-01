"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type Props = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function CommandInput({
  onSubmit,
  disabled = false,
  placeholder = "> ENTER COMMAND …",
}: Props) {
  const [value, setValue] = useState("");
  const [cursorLeft, setCursorLeft] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const syncCursor = useCallback(() => {
    const input = inputRef.current;
    const measure = measureRef.current;
    if (!input || !measure) return;
    const pos = input.selectionStart ?? valueRef.current.length;
    measure.textContent = valueRef.current.slice(0, pos);
    setCursorLeft(measure.offsetWidth);
  }, []);

  useEffect(() => {
    syncCursor();
  }, [value, syncCursor]);

  const submit = useCallback(() => {
    const t = valueRef.current.trim();
    if (!t || disabled) return;
    onSubmit(t);
    setValue("");
  }, [disabled, onSubmit]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }
    requestAnimationFrame(syncCursor);
  };

  return (
    <div className="w-full pb-1" style={{ borderBottom: "1px solid var(--color-outline-variant)" }}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 select-none py-2 text-[color:var(--color-primary)]" aria-hidden>
          ▸
        </span>
        <div className="relative min-w-0 flex-1 py-2" style={{ fontFamily: "ui-monospace, monospace" }}>
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            value={value}
            placeholder={placeholder}
            onChange={(e) => {
              setValue(e.target.value);
              requestAnimationFrame(syncCursor);
            }}
            onKeyDown={onKeyDown}
            onKeyUp={syncCursor}
            onSelect={syncCursor}
            onClick={syncCursor}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full border-0 bg-transparent p-0 text-sm text-[color:var(--color-on-surface)] outline-none placeholder:text-[color:var(--color-outline)]"
            style={{
              caretColor: "transparent",
              letterSpacing: "0.045em",
            }}
          />
          <span
            ref={measureRef}
            className="pointer-events-none invisible absolute top-2 left-0 whitespace-pre text-sm"
            aria-hidden
            style={{ letterSpacing: "0.045em" }}
          />
          <span
            className="terminal-cursor-block pointer-events-none absolute top-2 translate-y-[0.125em]"
            aria-hidden
            style={{
              left: `${cursorLeft}px`,
              display: disabled ? "none" : "inline-block",
            }}
          />
        </div>
      </div>
    </div>
  );
}
