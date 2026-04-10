export const clerkAuthAppearance = {
  variables: {
    colorBackground: "var(--app-panel-solid)",
    colorInputBackground: "var(--app-surface-input)",
    colorInputText: "var(--app-text)",
    colorText: "var(--app-text)",
    colorTextSecondary: "var(--app-muted)",
    colorPrimary: "var(--app-accent)",
    colorDanger: "#fb7185",
    borderRadius: "0px",
    fontFamily: "var(--font-mono), monospace",
    colorTextOnPrimaryBackground: "var(--app-accent-contrast)",
  },
  elements: {
    rootBox: "mx-auto flex w-full max-w-[440px] justify-center",
    cardBox: "mx-auto w-full max-w-[440px] shadow-none",
    card:
      "border-0 bg-transparent shadow-none p-0 gap-0 rounded-none",
    header: "hidden",
    footer: "mt-5 border-t border-[var(--app-border)] bg-transparent px-0 pt-5 pb-0",
    footerActionText:
      "text-[11px] uppercase tracking-[0.18em] text-[var(--app-muted)]",
    footerActionLink:
      "font-bold uppercase tracking-[0.18em] text-[var(--app-accent)] hover:text-[var(--app-text)]",
    socialButtonsBlockButton:
      "h-12 border border-[var(--app-border)] bg-transparent text-[var(--app-text)] shadow-none hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)] hover:text-[var(--app-accent)] transition",
    socialButtonsBlockButtonText:
      "text-sm font-bold tracking-[0.06em] text-inherit",
    socialButtonsProviderIcon: "scale-110",
    dividerLine: "bg-[var(--app-border)]",
    dividerText:
      "text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--app-muted)]",
    formFieldLabel:
      "mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-text)]",
    formFieldInput:
      "h-12 border border-[var(--app-border)] bg-[var(--app-surface-input)] text-[15px] text-[var(--app-text)] shadow-none placeholder:text-[var(--app-muted-soft)] focus:border-[var(--app-accent)] focus:ring-0",
    formButtonPrimary:
      "app-clerk-btn-glow h-12 border-2 border-[var(--app-accent)] bg-[var(--app-accent)] text-[13px] font-bold uppercase tracking-[0.18em] hover:border-[var(--app-text)] hover:bg-[var(--app-text)] hover:text-[var(--app-bg)] transition",
    identityPreviewText:
      "text-sm font-bold uppercase tracking-[0.08em] text-[var(--app-text)]",
    identityPreviewEditButton:
      "text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-accent)] hover:text-[var(--app-text)]",
    formResendCodeLink:
      "text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-accent)] hover:text-[var(--app-text)]",
    otpCodeFieldInput:
      "border border-[var(--app-border)] bg-[var(--app-surface-input)] text-[var(--app-text)] focus:border-[var(--app-accent)] focus:ring-0",
    alert:
      "border border-rose-400/35 bg-rose-400/10 text-rose-100 shadow-none",
    alertText: "text-sm leading-6",
    developmentModeWarning:
      "border border-[var(--app-accent)]/30 bg-[var(--app-accent-soft)] text-[var(--app-accent)]",
    developmentModeWarningText:
      "text-[var(--app-accent)]",
    formFieldWarningText: "text-[var(--app-accent)]",
    formFieldErrorText: "text-rose-300",
    formHeaderTitle:
      "text-[28px] font-bold uppercase tracking-[0.14em] text-[var(--app-text)]",
    formHeaderSubtitle:
      "text-sm leading-7 text-[var(--app-muted)]",
  },
} as const;
