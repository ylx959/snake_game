"use client";

/**
 * The nickname box.
 *
 * A one-off label, not an account: there is no password, no email and nothing
 * to recover. The last one used is remembered in `localStorage` purely so the
 * box comes back filled in - the server neither sees nor trusts that.
 *
 * The rule it enforces is the same one the server enforces
 * (`backend/room/nickname.py`); running it here just means the player finds out
 * while typing rather than after a round trip.
 */

import { useId, useState } from "react";

import { MAX_NICKNAME, cleanNickname, nicknameProblem } from "@/lib/nickname";

export function NicknameField({
  value,
  onChange,
  onSubmit,
  label = "Your name",
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  label?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const problem = nicknameProblem(value);

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field__input"
        value={value}
        // One over the limit, so typing past it shows the message instead of
        // silently swallowing the keystroke.
        maxLength={MAX_NICKNAME + 1}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder="Snake"
        onBlur={() => setTouched(true)}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !problem) {
            event.preventDefault();
            onChange(cleanNickname(value));
            onSubmit?.();
          }
        }}
      />
      <p className="field__note" data-bad={touched && problem ? "" : undefined}>
        {touched && problem ? problem : `${MAX_NICKNAME} characters, one round only`}
      </p>
    </div>
  );
}
