import type { Dictionary } from '@/i18n';
import { StatusBar } from '../PhoneFrame';
import { TabBar } from './ScreenDashboard';

/** The trouble-codes screen: what the ECU has stored, in the order the app shows it. */
export function ScreenCodes({ dict }: { dict: Dictionary }) {
  const s = dict.screens.codesScreen;
  const tones = ['var(--fault)', 'var(--warn)', 'var(--ink-3)'];

  return (
    <div className="flex h-full flex-col">
      <StatusBar />

      <div className="px-5 pb-3 pt-2">
        <p className="eyebrow text-[8px]">{s.brand}</p>
        <p className="mt-0.5 text-[17px] font-bold leading-tight text-ink">{s.title}</p>
      </div>

      <div className="mx-4 flex items-center gap-2 rounded-2xl bg-fault-soft px-3 py-2.5">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-fault">
          <span className="num text-[9px] font-bold text-white">3</span>
        </span>
        <span className="text-[10px] font-medium text-fault">{s.found}</span>
      </div>

      <ul className="mt-3 flex flex-col gap-2 px-4">
        {s.items.map((item, index) => (
          <li
            key={item.code}
            className="rounded-2xl border border-hairline bg-surface px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="num text-[13px] font-bold text-ink">{item.code}</span>
              <span
                className="eyebrow rounded-full px-1.5 py-0.5 text-[7px]"
                style={{ color: tones[index], background: 'var(--surface-muted)' }}
              >
                {item.kind}
              </span>
            </div>
            <p className="mt-1 text-[9.5px] leading-snug text-ink-2">{item.desc}</p>
          </li>
        ))}
      </ul>

      <TabBar dict={dict} active="garage" />
    </div>
  );
}
