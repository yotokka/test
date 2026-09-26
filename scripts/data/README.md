# Импорт исторических данных

```bash
pip install pyreadr            # чтение .rda-файлов R
npm run data:fetch             # загрузка в .cache/raw с проверкой MD5 по манифестам пакетов
npm run data:build             # сборка src/history/data/*.json
```

| Шаг | Что происходит |
|---|---|
| `fetch.mjs` | Загружает файлы пакетов cshapes 2.0, states и peacesciencer из зеркала github.com/cran; сверяет MD5 с файлом `MD5` пакета; распаковывает CShapes; пишет `.cache/raw/fetch-log.json`. |
| `rda_to_json.py` | Конвертирует `gwstates`, `ucdp_acd`, `archigos`, `gw_capitals`, `ps_data_version` в JSON. |
| `build-history.mjs` | Фильтрует записи CShapes (с 1970-01-01), выравнивает обход колец, строит общую топологию, упрощает без потери островов (с проверкой), вычисляет спорные участки, субъекты и преемственность, собирает события и манифест. |

Результат детерминирован для одних и тех же входных файлов. `IMPORTED_AT=ГГГГ-ММ-ДД` задаёт дату добавления в базу (поле `recordedAt` событий); иначе берётся текущая дата. Идентификатор сборки (`buildId` в `manifest.json`) — хеш геометрии и событий: по нему видно, что данные изменились.

Исходные файлы наборов в репозиторий не включаются (`.cache` в `.gitignore`). Условия использования — `docs/history/data-licenses.md`.
