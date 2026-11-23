import type { Wallet } from "./wallet";

// The official wallet marks for the upgrade pop-up's black pay button: Apple Pay (white Apple
// logo + "Pay", per Apple's Apple Pay guidelines) and Google Pay (four-colour "G" + "Pay", per the
// Google Pay brand guidelines). Inline SVG, decorative: the button carries the aria-label.

function AppleLogo({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`fill-current ${className}`}>
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function GoogleG({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function WalletMark({ wallet }: { wallet: Exclude<Wallet, "none"> }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center justify-center gap-[3px]">
      {wallet === "apple" ? <AppleLogo /> : <GoogleG />}
      <span
        className={
          wallet === "apple"
            ? "text-[19px] leading-none font-medium tracking-[-0.01em]"
            : "ml-[3px] text-[19px] leading-none font-medium text-white/90"
        }
      >
        Pay
      </span>
    </span>
  );
}

export const WALLET_LABEL: Record<Exclude<Wallet, "none">, string> = {
  apple: "Pay with Apple Pay",
  google: "Pay with Google Pay",
};

// The accepted-payments row under the pay buttons (approved 24 Nov): small card-shaped marks,
// muted but recognisable. One label for the row; each mark is decorative.
export const ACCEPTED_LABEL = "Accepted: Apple Pay, Google Pay, Visa, Mastercard, American Express";

const CHIP =
  "inline-flex h-5 w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] border";

function VisaMark() {
  return (
    <span className={`${CHIP} border-line-strong bg-white`}>
      <svg viewBox="0 0 48 16" aria-hidden="true" className="h-[9px] w-auto">
        <text
          x="24"
          y="13.5"
          textAnchor="middle"
          fill="#1A1F71"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="16"
          fontStyle="italic"
          fontWeight="900"
          letterSpacing="-0.5"
        >
          VISA
        </text>
      </svg>
    </span>
  );
}

function MastercardMark() {
  return (
    <span className={`${CHIP} border-line-strong bg-white`}>
      <svg viewBox="0 0 32 20" aria-hidden="true" className="h-[14px] w-auto">
        <circle cx="12" cy="10" r="8" fill="#EB001B" />
        <circle cx="20" cy="10" r="8" fill="#F79E1B" />
        <path d="M16 3.07a8 8 0 0 1 0 13.86 8 8 0 0 1 0-13.86z" fill="#FF5F00" />
      </svg>
    </span>
  );
}

function AmexMark() {
  return (
    <span className={`${CHIP} border-transparent bg-[#006FCF]`}>
      <svg viewBox="0 0 48 16" aria-hidden="true" className="h-[8px] w-auto">
        <text
          x="24"
          y="13"
          textAnchor="middle"
          fill="#fff"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="14"
          fontWeight="900"
          letterSpacing="0.5"
        >
          AMEX
        </text>
      </svg>
    </span>
  );
}

function ApplePayMark() {
  return (
    <span className={`${CHIP} gap-px border-black bg-black text-white`}>
      <AppleLogo className="h-[10px] w-[10px]" />
      <span className="text-[9.5px] leading-none font-semibold">Pay</span>
    </span>
  );
}

function GooglePayMark() {
  return (
    <span className={`${CHIP} border-line-strong gap-px bg-white`}>
      <GoogleG className="h-[9px] w-[9px]" />
      <span className="text-[9.5px] leading-none font-semibold text-[#5F6368]">Pay</span>
    </span>
  );
}

/** Apple Pay · Google Pay · Visa · Mastercard · Amex, under the pay buttons. */
export function AcceptedMarks() {
  return (
    <div
      role="img"
      aria-label={ACCEPTED_LABEL}
      className="flex flex-wrap items-center justify-center gap-2 opacity-75 saturate-[0.6]"
    >
      <span aria-hidden="true" className="contents">
        <ApplePayMark />
        <GooglePayMark />
        <VisaMark />
        <MastercardMark />
        <AmexMark />
      </span>
    </div>
  );
}
