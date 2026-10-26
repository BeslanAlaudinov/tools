'use client';

import {
  COUNTRY_NAMES,
  DEFAULT_VIEW,
  GlobeEngine,
  PRESETS,
  applyPreset,
  loadCities,
  searchCities,
  type City,
  type GlobeSettings,
  type Marker,
  type Preset,
} from '@tools/globe';
import { ConfirmPopover, Dropdown, IconButton, Icons, NumberField, Pill, Segmented, Toggle } from '@tools/ui';
import { useEffect, useMemo, useState } from 'react';
import { formatLatLon, useGlobeTool } from './context';
import { useGlobeStore } from './store';

const useSettings = () => useGlobeStore(s => s.settings);
const useSet = () => useGlobeStore(s => s.set);
const nextId = (items: { id: number }[]) => items.reduce((m, x) => Math.max(m, x.id), 0) + 1;

// ---------- presets ----------

/** Preset previews are rendered once by an offscreen engine. */
export function PresetsSection() {
  const settings = useSettings();
  const replace = useGlobeStore(s => s.replace);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!GlobeEngine.isSupported()) return;
    const canvas = document.createElement('canvas');
    const base = {
      ...useGlobeStore.getState().settings,
      markers: [],
      routes: [],
      countries: [],
      zoom: 0.82,
      offX: 0,
      offY: 0,
    };
    const engine = new GlobeEngine({ canvas, settings: base, view: DEFAULT_VIEW });
    engine.setPlaying(false);
    const out: Record<string, string> = {};
    PRESETS.forEach((p, i) => {
      engine.setSettings({ ...applyPreset(base, p), fxOn: false });
      engine.setView({ yaw: -20 + i * 40, pitch: 24 });
      out[p.id] = engine.renderImage(240, 240).canvas.toDataURL('image/png');
    });
    engine.destroy();
    setThumbs(out);
  }, []);
  // A preset replaces the whole look. Hand-made changes (preset === null) would be lost, so ask first.
  const [asking, setAsking] = useState<Preset | null>(null);
  const apply = (p: Preset) => {
    setAsking(null);
    replace(applyPreset(useGlobeStore.getState().settings, p));
  };
  return (
    // anchored to the whole grid so the question opens beside it and covers no other preset
    <ConfirmPopover
      open={asking !== null}
      onOpenChange={open => !open && setAsking(null)}
      title={`Применить «${asking?.name ?? ''}»?`}
      note="Ваши настройки точек, цвета, фона и анимации заменятся пресетом. Страны, метки и маршруты останутся. Вернуть можно через Ctrl+Z."
      confirmLabel="Применить"
      onConfirm={() => asking && apply(asking)}
    >
      <div className="t-presets">
        {PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            className="t-preset"
            aria-pressed={settings.preset === p.id}
            data-pending={asking?.id === p.id || undefined}
            onClick={() => {
              if (settings.preset === p.id) return;
              if (settings.preset === null) setAsking(p);
              else apply(p);
            }}
          >
            {thumbs[p.id] ? <img src={thumbs[p.id]} alt="" /> : <span className="t-preset-img" />}
            {p.name}
          </button>
        ))}
      </div>
    </ConfirmPopover>
  );
}

// ---------- countries ----------

export function CountriesSection() {
  const settings = useSettings();
  const set = useSet();
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return COUNTRY_NAMES.map((name, i) => ({ name, index: i + 1 }))
      .filter(c => c.name.toLowerCase().includes(q) && !settings.countries.includes(c.index))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
      .slice(0, 6);
  }, [query, settings.countries]);
  const add = (index: number) => {
    set({ countries: [...settings.countries, index] });
    setQuery('');
  };
  return (
    <>
      <div className="t-stack">
        <label className="t-search">
          <Icons.Search size={16} />
          <input
            placeholder="Найти страну"
            aria-label="Найти страну"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && matches[0]) add(matches[0].index);
              if (e.key === 'Escape') setQuery('');
            }}
          />
        </label>
        {matches.length > 0 && (
          <div className="t-suggest" role="listbox" aria-label="Страны">
            {matches.map((m, i) => (
              <button
                key={m.index}
                type="button"
                role="option"
                aria-selected={i === 0}
                data-active={i === 0 || undefined}
                onClick={() => add(m.index)}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
        {query.trim() && !matches.length && <p className="t-note">Такой страны нет в списке.</p>}
      </div>
      {settings.countries.length > 0 ? (
        <div className="t-tags">
          {settings.countries.map(c => (
            <span key={c} className="t-tag">
              <i />
              {COUNTRY_NAMES[c - 1]}
              <button
                type="button"
                aria-label={`Снять выделение: ${COUNTRY_NAMES[c - 1]}`}
                onClick={() => set({ countries: settings.countries.filter(x => x !== c) })}
              >
                <Icons.Close size={12} />
              </button>
            </span>
          ))}
          {settings.countries.length > 1 && (
            <button type="button" className="t-linkbtn" onClick={() => set({ countries: [] })}>
              Снять все
            </button>
          )}
        </div>
      ) : (
        <p className="t-note">Ничего не выделено. Найдите страну выше или включите выделение кликом.</p>
      )}
    </>
  );
}

// ---------- markers ----------

type AddMode = 'city' | 'coords' | 'center';

export function MarkersSection() {
  const settings = useSettings();
  const set = useSet();
  const { engine, notify } = useGlobeTool();
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<AddMode>('city');
  const [cityQuery, setCityQuery] = useState('');
  const [pick, setPick] = useState(0);
  const [label, setLabel] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');

  // the full city list is a separate download, fetched the first time the city search opens
  const [allCities, setAllCities] = useState<readonly City[] | 'loading' | 'failed'>('loading');
  const searching = adding && mode === 'city';
  useEffect(() => {
    if (!searching || Array.isArray(allCities)) return;
    let alive = true;
    setAllCities('loading');
    loadCities().then(
      list => alive && setAllCities(list),
      () => alive && setAllCities('failed'),
    );
    return () => {
      alive = false;
    };
    // runs when the search opens; a failed load is retried on the next opening
  }, [searching]);
  const cities = useMemo(
    () => (Array.isArray(allCities) ? searchCities(allCities, cityQuery) : []),
    [allCities, cityQuery],
  );
  const center = engine.current?.center() ?? [0, 0];

  const add = (m: Omit<Marker, 'id'>) => {
    set({ markers: [...settings.markers, { id: nextId(settings.markers), ...m }] });
    setAdding(false);
    setCityQuery('');
    setLabel('');
    setLat('');
    setLon('');
  };
  const confirm = () => {
    if (mode === 'city') {
      const c = cities[pick] ?? cities[0];
      if (c) add({ label: c.name, lat: c.lat, lon: c.lon });
    } else if (mode === 'coords') {
      const a = parseFloat(lat.replace(',', '.'));
      const o = parseFloat(lon.replace(',', '.'));
      if (!(a >= -90 && a <= 90) || !(o >= -180 && o <= 180)) {
        notify({ text: 'Широта от −90 до 90, долгота от −180 до 180' });
        return;
      }
      add({ label: label.trim() || `Метка ${settings.markers.length + 1}`, lat: a, lon: o });
    } else {
      const [cLat, cLon] = engine.current?.center() ?? [0, 0];
      add({
        label: label.trim() || `Метка ${settings.markers.length + 1}`,
        lat: +cLat.toFixed(2),
        lon: +cLon.toFixed(2),
      });
    }
  };
  const rename = (id: number, value: string) =>
    set({ markers: settings.markers.map(m => (m.id === id ? { ...m, label: value } : m)) }, { continuous: true });
  const remove = (id: number) =>
    set({
      markers: settings.markers.filter(m => m.id !== id),
      routes: settings.routes.filter(r => r.from !== id && r.to !== id),
    });

  return (
    <>
      {settings.markers.length > 0 && (
        <div className="t-items">
          {settings.markers.map(m => (
            <div key={m.id} className="t-item">
              <span className="t-item-ico">
                <Icons.Pin size={16} />
              </span>
              <div className="t-item-txt">
                <input
                  className="t-item-name"
                  value={m.label}
                  aria-label="Подпись метки"
                  maxLength={40}
                  onChange={e => rename(m.id, e.target.value)}
                />
                <span>{formatLatLon(m.lat, m.lon)}</span>
              </div>
              <div className="t-item-acts">
                <IconButton
                  size="sm"
                  label="Повернуть глобус к метке"
                  onClick={() => engine.current?.flyTo(m.lat, m.lon)}
                >
                  <Icons.Target size={16} />
                </IconButton>
                <IconButton size="sm" label="Удалить метку" onClick={() => remove(m.id)}>
                  <Icons.Close size={14} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}
      {!adding ? (
        <button type="button" className="t-addbtn" onClick={() => setAdding(true)}>
          <Icons.Plus size={14} />
          Добавить метку
        </button>
      ) : (
        <div className="t-sheet">
          <Segmented<AddMode>
            size="sm"
            label="Как добавить"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'city', label: 'Город' },
              { value: 'coords', label: 'Координаты' },
              { value: 'center', label: 'Центр кадра' },
            ]}
          />
          {mode === 'city' && (
            <div className="t-stack">
              <label className="t-search">
                <Icons.Search size={15} />
                <input
                  autoFocus
                  placeholder="Найти город"
                  aria-label="Найти город"
                  value={cityQuery}
                  onChange={e => {
                    setCityQuery(e.target.value);
                    setPick(0);
                  }}
                  onKeyDown={e => e.key === 'Enter' && confirm()}
                />
              </label>
              <div className="t-suggest" role="listbox" aria-label="Города">
                {cities.map((c, i) => (
                  <button
                    key={`${c.name}|${c.lat}|${c.lon}`}
                    type="button"
                    role="option"
                    aria-selected={i === pick}
                    data-active={i === pick || undefined}
                    onClick={() => setPick(i)}
                  >
                    {c.name}
                    <small>{c.country || formatLatLon(c.lat, c.lon)}</small>
                  </button>
                ))}
                {allCities === 'loading' && <p className="t-note">Загружаю города…</p>}
                {allCities === 'failed' && (
                  <p className="t-note">
                    Не удалось загрузить города. Проверьте интернет или добавьте метку по координатам.
                  </p>
                )}
                {Array.isArray(allCities) && !cities.length && (
                  <p className="t-note">Такого города нет. Добавьте его по координатам.</p>
                )}
              </div>
            </div>
          )}
          {mode === 'coords' && (
            <div className="t-stack">
              <label className="t-field">
                <input
                  placeholder="Подпись"
                  aria-label="Подпись"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                />
              </label>
              <div className="t-two">
                <label className="t-field">
                  <input
                    inputMode="decimal"
                    placeholder="55.75"
                    aria-label="Широта"
                    value={lat}
                    onChange={e => setLat(e.target.value)}
                  />
                  <i>шир.</i>
                </label>
                <label className="t-field">
                  <input
                    inputMode="decimal"
                    placeholder="37.62"
                    aria-label="Долгота"
                    value={lon}
                    onChange={e => setLon(e.target.value)}
                  />
                  <i>долг.</i>
                </label>
              </div>
            </div>
          )}
          {mode === 'center' && (
            <div className="t-stack">
              <label className="t-field">
                <input
                  placeholder={`Метка ${settings.markers.length + 1}`}
                  aria-label="Подпись"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                />
              </label>
              <p className="t-note">Поставится в точку под центром кадра: {formatLatLon(center[0], center[1])}.</p>
            </div>
          )}
          <div className="t-sheet-actions">
            <Pill size="sm" onClick={() => setAdding(false)}>
              Отмена
            </Pill>
            <Pill size="sm" variant="primary" onClick={confirm}>
              Добавить
            </Pill>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- routes ----------

export function RoutesSection() {
  const settings = useSettings();
  const set = useSet();
  const { notify } = useGlobeTool();
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const options = settings.markers.map(m => ({ value: m.id, label: m.label || 'Без подписи' }));
  const exists = (a: number, b: number) =>
    settings.routes.some(r => (r.from === a && r.to === b) || (r.from === b && r.to === a));

  const startAdding = () => {
    setFrom(settings.markers[0]?.id ?? null);
    setTo(settings.markers[1]?.id ?? null);
    setAdding(true);
  };
  const confirm = () => {
    if (from === null || to === null || from === to) {
      notify({ text: 'Выберите две разные метки' });
      return;
    }
    if (exists(from, to)) {
      notify({ text: 'Такой маршрут уже есть' });
      return;
    }
    set({ routes: [...settings.routes, { id: nextId(settings.routes), from, to }] });
    setAdding(false);
  };
  const connectAll = () => {
    const [hub, ...rest] = settings.markers;
    if (!hub || !rest.length) return;
    const routes = [...settings.routes];
    for (const m of rest)
      if (!routes.some(r => (r.from === hub.id && r.to === m.id) || (r.from === m.id && r.to === hub.id)))
        routes.push({ id: nextId(routes), from: hub.id, to: m.id });
    set({ routes });
  };
  const update = (id: number, patch: { from?: number; to?: number }) =>
    set({ routes: settings.routes.map(r => (r.id === id ? { ...r, ...patch } : r)) });

  if (settings.markers.length < 2) return <p className="t-note">Для маршрута нужны хотя бы две метки.</p>;
  return (
    <>
      {settings.routes.length > 0 && (
        <div className="t-stack">
          {settings.routes.map(r => (
            <div key={r.id} className="t-route">
              <Dropdown label="Откуда" value={r.from} options={options} onChange={v => update(r.id, { from: v })} />
              <IconButton
                size="sm"
                label="Поменять направление"
                onClick={() => update(r.id, { from: r.to, to: r.from })}
              >
                <Icons.Swap size={14} />
              </IconButton>
              <Dropdown label="Куда" value={r.to} options={options} onChange={v => update(r.id, { to: v })} />
              <IconButton
                size="sm"
                label="Удалить маршрут"
                onClick={() => set({ routes: settings.routes.filter(x => x.id !== r.id) })}
              >
                <Icons.Close size={14} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      {!adding ? (
        <button type="button" className="t-addbtn" onClick={startAdding}>
          <Icons.Plus size={14} />
          Добавить маршрут
        </button>
      ) : (
        <div className="t-sheet">
          <div className="t-route-build">
            <div className="t-route-end">
              Откуда
              <Dropdown label="Откуда" value={from} options={options} onChange={setFrom} />
            </div>
            <IconButton
              label="Поменять местами"
              onClick={() => {
                setFrom(to);
                setTo(from);
              }}
            >
              <Icons.Swap size={16} />
            </IconButton>
            <div className="t-route-end">
              Куда
              <Dropdown label="Куда" value={to} options={options} onChange={setTo} />
            </div>
          </div>
          <p className="t-note">Нет нужной точки — сначала добавьте её в метки.</p>
          <div className="t-sheet-actions">
            <Pill size="sm" onClick={() => setAdding(false)}>
              Отмена
            </Pill>
            <Pill size="sm" variant="primary" onClick={confirm}>
              Добавить маршрут
            </Pill>
          </div>
        </div>
      )}
      <button type="button" className="t-linkbtn" onClick={connectAll}>
        Соединить все метки с первой
      </button>
    </>
  );
}

// ---------- custom frame ----------

export function CustomFrameSection() {
  const settings = useSettings();
  const set = useSet();
  const [lock, setLock] = useState(false);
  const ratio = settings.customW / settings.customH;
  const setW = (w: number) => set(lock ? { customW: w, customH: Math.round(w / ratio) } : { customW: w });
  const setH = (h: number) => set(lock ? { customH: h, customW: Math.round(h * ratio) } : { customH: h });
  return (
    <div className="t-custom-frame">
      <NumberField label="Ширина кадра" value={settings.customW} min={64} max={8192} unit="px" onChange={setW} />
      <span className="t-lbl">×</span>
      <NumberField label="Высота кадра" value={settings.customH} min={64} max={8192} unit="px" onChange={setH} />
      <span title="Сохранять пропорции">
        <Toggle label="Сохранять пропорции" checked={lock} onChange={setLock} />
      </span>
    </div>
  );
}

export type { GlobeSettings };
