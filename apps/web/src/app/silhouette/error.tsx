'use client';

import { Pill } from '@tools/ui';
import { useEffect } from 'react';

/** Shown instead of a blank screen when the tool crashes while rendering. */
export default function SilhouetteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="t-app" style={{ display: 'grid', placeItems: 'center' }}>
      <div className="t-card" style={{ maxWidth: 420, textAlign: 'center' }}>
        <h3 style={{ margin: 0 }}>Силуэт не открылся</h3>
        <p className="t-note">
          Что-то сломалось при запуске. Попробуйте ещё раз; если не поможет, сбросьте сохранённые настройки — силуэт
          откроется с настройками по умолчанию.
        </p>
        <div className="t-actions">
          <Pill
            onClick={() => {
              try {
                localStorage.removeItem('tools.silhouette');
              } catch {
                /* storage unavailable */
              }
              reset();
            }}
          >
            Сбросить настройки
          </Pill>
          <Pill variant="primary" onClick={reset}>
            Попробовать снова
          </Pill>
        </div>
      </div>
    </div>
  );
}
