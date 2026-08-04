import { renderPaymentTemplateParts } from '../utils/paymentTemplate';

/**
 * Renders team payment instructions with `{balance}`-style tokens resolved and
 * any URLs (including token-built pay links) turned into anchors.
 *
 * @param {object} props
 * @param {string} props.template Raw instructions authored in Team Settings.
 * @param {Record<string, {text: string, url: string}>} props.tokens From buildPaymentTokens().
 * @param {string} [props.className] Applied to the wrapping paragraph.
 */
export default function PaymentInstructionsText({ template, tokens, className = '' }) {
  const parts = renderPaymentTemplateParts(template, tokens);
  if (parts.length === 0) return null;

  return (
    <p className={`whitespace-pre-wrap ${className}`}>
      {parts.map((part, i) =>
        part.type === 'link' ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 dark:text-blue-400 underline break-all"
          >
            {part.label}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </p>
  );
}
