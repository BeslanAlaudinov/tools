'use client';

import { Pill } from '@tools/ui';
import { useEffect, useState } from 'react';

const KEY = 'tools.mobileNotice.dismissed';
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * The tools are desktop only for now. On a phone or a touch tablet this covers the page and says so; CSS decides
 * where it shows, so there is no flash on load. "Всё равно посмотреть" hides it until the tab is closed.
 */
export function MobileNotice() {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(KEY) === '1');
    } catch {
      /* storage unavailable: the notice simply shows */
    }
  }, []);
  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* storage unavailable: hidden for this page only */
    }
  };

  return (
    <div className="t-mobile" role="dialog" aria-modal="true" aria-labelledby="t-mobile-title">
      <div className="t-mobile-card">
        <img
          className="t-mobile-img"
          src={`${base}/mobile-cat.png`}
          alt="Рыжий кот с любопытством заглядывает в камеру"
          onError={e => (e.currentTarget.hidden = true)}
        />
        <h1 id="t-mobile-title">Пока только для компьютера</h1>
        <p>Инструменты рассчитаны на большой экран, мобильную версию сделаем позже. Откройте сайт с компьютера.</p>
        <Pill variant="quiet" size="sm" onClick={dismiss}>
          Всё равно посмотреть
        </Pill>
      </div>
    </div>
  );
}
