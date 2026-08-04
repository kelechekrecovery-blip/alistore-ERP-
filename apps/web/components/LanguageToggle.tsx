'use client';

import { LOCALES, LOCALE_LABEL } from '@/lib/i18n/dictionaries';
import { useT } from '@/lib/i18n/locale';

/** RU / KY switch. Persists via LocaleProvider; default is Russian. */
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useT();
  return (
    <div className={`inline-flex overflow-hidden rounded-[8px] border border-white/15 ${className ?? ''}`} role="group" aria-label="Язык / Тил">
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={`px-2.5 py-1 text-xs font-bold transition ${locale === code ? 'bg-coral text-white' : 'text-white/60 hover:text-white'}`}
        >
          {LOCALE_LABEL[code]}
        </button>
      ))}
    </div>
  );
}
