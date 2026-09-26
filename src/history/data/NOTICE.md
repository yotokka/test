# Условия для файлов этой папки

Файлы сгенерированы скриптом `scripts/data/build-history.mjs` и являются производными данными.

- `geo.topo.json` — производное от CShapes 2.0 (авторы пакета: N. B. Weidmann, G. Schvitz, L. Girardin). Распространяется на условиях **CC BY-NC-SA 4.0**: указание авторства, только некоммерческое использование, производные — на тех же условиях.
- `land.topo.json` — Natural Earth 1:110m land 4.1.0 (public domain по сведениям проекта), через npm world-atlas 2.0.2 (ISC).
- `entities.json`, `events.json` — производные от CShapes 2.0, списка Gleditsch & Ward (пакет states, MIT), UCDP ACD и Archigos 4.1 (через пакет peacesciencer, GPL-2). Условия правообладателей UCDP, Archigos и Gleditsch & Ward не проверены — см. `docs/history/data-licenses.md`.
- `conflicts.json` — производное от UCDP ACD; `leaders.json` — от Archigos 4.1.

Объединённый набор не является свободным для любого использования.
