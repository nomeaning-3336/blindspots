"use client";

import { useState } from "react";

export type FaqItem = {
  question: string;
  answer: string;
};

export function PublicFaq({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="border-t border-[var(--app-border)]">
      {items.map((item, index) => {
        const isOpen = index === openIndex;

        return (
          <button
            key={item.question}
            type="button"
            className="grid w-full cursor-pointer border-b border-[var(--app-border)] py-5 text-left"
            onClick={() => setOpenIndex((current) => (current === index ? -1 : index))}
            aria-expanded={isOpen}
          >
            <span className="flex items-center justify-between gap-5 text-base font-bold text-[var(--app-text)]">
              {item.question}
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--app-border)] text-[var(--app-accent)]">
                {isOpen ? "-" : "+"}
              </span>
            </span>
            {isOpen ? (
              <span className="mt-4 max-w-3xl text-sm leading-7 text-[var(--app-muted)]">
                {item.answer}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
