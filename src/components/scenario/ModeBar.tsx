export type WorldMode = 'history' | 'edit' | 'play';

export const MODE_RU: Record<WorldMode, string> = {
  history: 'Историческое воспроизведение',
  edit: 'Редактирование сценария',
  play: 'Воспроизведение сценария',
};

/** Переключатель трёх связанных состояний мира. */
export function ModeBar({ mode, onMode, hasScenario, scenarioTitle }: { mode: WorldMode; onMode: (m: WorldMode) => void; hasScenario: boolean; scenarioTitle: string | null }) {
  return (
    <nav className="sc-modes" aria-label="Режим">
      <div className="speed-group" role="group" aria-label="Режим мира">
        {(['history', 'edit', 'play'] as WorldMode[]).map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => onMode(m)} title={m !== 'history' && !hasScenario ? 'Сначала создайте ветку или откройте сценарий' : undefined}>
            {MODE_RU[m]}
          </button>
        ))}
      </div>
      <span className="xs muted sc-modes-note">
        {hasScenario ? (
          <>
            Сценарий: <strong>{scenarioTitle}</strong>
            {mode === 'history' ? ' — сохранён; историческая база показана без изменений' : ''}
          </>
        ) : (
          'Сценария нет: создайте ветку от выбранной даты или откройте готовый учебный сценарий'
        )}
      </span>
    </nav>
  );
}
