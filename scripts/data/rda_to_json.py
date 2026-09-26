"""Конвертация R-наборов (.rda) из .cache/raw в JSON. Требуется: pip install pyreadr."""
import json, math, pyreadr, datetime as dt

RAW = '.cache/raw'
SETS = {
    'states__data__gwstates.rda': 'gwstates',
    'peacesciencer__data__ucdp_acd.rda': 'ucdp_acd',
    'peacesciencer__data__archigos.rda': 'archigos',
    'peacesciencer__data__gw_capitals.rda': 'gw_capitals',
    'peacesciencer__data__ps_data_version.rda': 'ps_data_version',
}

def clean(v):
    if v is None: return None
    if isinstance(v, float) and math.isnan(v): return None
    if isinstance(v, (dt.date, dt.datetime)): return v.isoformat()[:10]
    if hasattr(v, 'item'): v = v.item()
    if isinstance(v, float) and v.is_integer(): return int(v)
    return v

for f, name in SETS.items():
    df = list(pyreadr.read_r(f'{RAW}/{f}').values())[0]
    rows = [{k: clean(v) for k, v in r.items()} for r in df.to_dict(orient='records')]
    with open(f'{RAW}/{name}.json', 'w') as fh:
        json.dump(rows, fh, ensure_ascii=False)
    print(f'✓ {name}: {len(rows)} записей')
