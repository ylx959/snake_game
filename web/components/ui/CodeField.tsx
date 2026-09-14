"use client";

/**
 * The room-code box.
 *
 * Six characters, upper case, from an alphabet with no `O`, `0`, `I` or `1` -
 * the pairs people get wrong reading a code off somebody's screen. The input
 * folds case and drops anything outside that alphabet as it is typed, so a
 * player who types the letter O simply never sees it appear rather than being
 * told off for it afterwards.
 */

import { useId } from "react";

export const CODE_ALPHABET = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;
export const CODE_LENGTH = 6;

export function CodeField({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
}) {
  const id = useId();

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        Room code
      </label>
      <input
        id={id}
        className="field__input field__input--code"
        value={value}
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        placeholder="ABC234"
        onChange={(event) =>
          onChange(event.target.value.toUpperCase().replace(CODE_ALPHABET, "").slice(0, CODE_LENGTH))
        }
        onKeyDown={(event) => {
          if (event.key === "Enter" && value.length === CODE_LENGTH) {
            event.preventDefault();
            onSubmit?.();
          }
        }}
      />
      <p className="field__note">Six characters, from whoever made the room</p>
    </div>
  );
}
