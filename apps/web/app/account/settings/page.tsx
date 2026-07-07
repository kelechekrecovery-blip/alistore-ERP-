'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import { useAuth } from '@/lib/auth';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <MobileAppFrame title="Настройки" subtitle="Профиль, безопасность и управление данными." backHref="/account">
      <div className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
        <div className="text-[12px] uppercase text-[#8A7F76]">Аккаунт</div>
        <div className="mt-2 font-display text-lg font-bold">{user?.phone ?? 'Гость'}</div>
        <div className="mt-1 font-mono text-[11px] text-[#6E645C]">{user?.customerId ?? 'Войдите по OTP'}</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href="/account/notifications" className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
          <div className="text-2xl">🔔</div>
          <div className="mt-2 text-[13px] font-semibold">Уведомления</div>
        </Link>
        <Link href="/account/addresses" className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
          <div className="text-2xl">📍</div>
          <div className="mt-2 text-[13px] font-semibold">Адреса</div>
        </Link>
      </div>

      <div className="mt-3 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
        <div className="text-sm font-semibold">Безопасность</div>
        <div className="mt-2 flex items-center justify-between py-2 text-[13px] text-[#A79C92]">
          <span>Вход по телефону и OTP</span>
          <span className="text-lime">активен</span>
        </div>
        <div className="flex items-center justify-between border-t border-[#2E2822] py-2 text-[13px] text-[#A79C92]">
          <span>Сессия</span>
          <span>обновляется автоматически</span>
        </div>
      </div>

      <button
        type="button"
        onClick={async () => { await logout(); router.push('/'); }}
        className="mt-4 w-full rounded-[13px] border border-[#FF8A7A]/30 bg-[#FF8A7A]/5 py-3.5 text-center text-[13px] font-semibold text-[#FF8A7A]"
      >
        Выйти из аккаунта
      </button>
    </MobileAppFrame>
  );
}
