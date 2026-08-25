import type { Dictionary } from '@/i18n';
import { StatusBar } from '../PhoneFrame';
import { TabBar } from './ScreenDashboard';

/**
 * The assistant tab. Rendered on the server as ordinary text — the exchange is
 * the clearest explanation of what the product does, so it has to be readable
 * by a crawler and a screen reader, not just visible in a picture.
 *
 * The tool rows are the honest part: they show the assistant went and read the
 * car before it answered, which is the whole distinction from a chatbot that
 * guesses.
 */
function ToolRow({ name, arg, result }: { name: string; arg: string; result: string }) {
  return (
    <div className="num flex flex-wrap items-center gap-1 self-start rounded-lg bg-ai-soft px-2 py-1 text-[8.5px] text-ai">
      <svg
        viewBox="0 0 24 24"
        className="h-2.5 w-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="m8 6-5 6 5 6M16 6l5 6-5 6" />
      </svg>
      <span className="font-medium">{name}</span>
      <span className="opacity-55">({arg})</span>
      <span aria-hidden="true" className="opacity-55">
        →
      </span>
      <span className="font-bold">{result}</span>
    </div>
  );
}

export function ScreenChat({ dict }: { dict: Dictionary }) {
  const c = dict.screens.chat;

  return (
    <div className="flex h-full flex-col">
      <StatusBar />

      <div className="flex items-center gap-2 border-b border-hairline px-5 pb-3 pt-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft">
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-ai"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4 10.1 12.8 4.5 10.9 10.1 9 12 3.5Z" />
          </svg>
        </span>
        <div>
          <p className="eyebrow text-[7.5px]">{c.brand}</p>
          <p className="text-[13px] font-bold leading-tight text-ink">{c.title}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-hidden px-4 py-3">
        <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-accent px-3 py-2 text-[10.5px] leading-snug text-on-accent">
          {c.user}
        </p>
        <ToolRow name="read_pid" arg="COOLANT_TEMP" result="104 °C" />
        <ToolRow name="read_dtc" arg="stored" result="P0301" />
        <p className="max-w-[94%] self-start rounded-2xl rounded-bl-md bg-surface px-3 py-2.5 text-[10.5px] leading-relaxed text-ink-2">
          {c.reply}
        </p>
      </div>

      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-full border border-hairline bg-surface py-2 pl-4 pr-2">
          <span className="flex-1 text-[10px] text-ink-4">{c.placeholder}</span>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent">
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3 text-on-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </span>
        </div>
      </div>

      <TabBar dict={dict} active="ai" />
    </div>
  );
}
