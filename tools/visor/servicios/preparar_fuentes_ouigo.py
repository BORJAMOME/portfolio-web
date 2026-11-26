"""servicios-fuentes.json → ouigo: relaciones y variantes desde ouigo-horario-2026-2027.json (trenes leídos del PDF oficial).
Uso: python preparar_fuentes_ouigo.py fuentes"""
import json, sys
from collections import defaultdict, OrderedDict
M = sys.argv[1]
H = json.load(open(M + '/ouigo-horario-2026-2027.json', encoding='utf-8'))
F = json.load(open(M + '/servicios-fuentes.json', encoding='utf-8'), object_pairs_hook=OrderedDict)
GT = {'ALBACETE':'Albacete-Los Llanos','ALICANTE':'Alicante/Alacant-Terminal','BARCELONA':'Barcelona-Sants','CUENCA':'Cuenca-Fernando Zóbel',
      'CÓRDOBA':'Córdoba-Julio Anguita','ELCHE':'Elche/Elx AV','MURCIA':'Murcia del Carmen','MÁLAGA':'Málaga María Zambrano','SEGOVIA':'Segovia-Guiomar',
      'SEVILLA':'Sevilla-Santa Justa','TARRAGONA':'Camp de Tarragona','VALENCIA':'València-Joaquín Sorolla','VALLADOLID':'Valladolid-Campo Grande','ZARAGOZA':'Zaragoza Delicias'}
MAD = {'Atocha':'Madrid-Puerta de Atocha-Almudena Grandes','Chamartín':'Madrid-Chamartín-Clara Campoamor'}
SHORT = {'MADRID':'mad','BARCELONA':'bcn','VALENCIA':'vlc','ALICANTE':'ali','MURCIA':'mur','VALLADOLID':'vll','SEVILLA':'sev','MÁLAGA':'mal','ZARAGOZA':'zgz'}
# orden canónico de los extremos: Madrid primero; si no hay Madrid, el más al norte/este según esta lista
RANK = ['MADRID','BARCELONA','ZARAGOZA','VALLADOLID','VALENCIA','ALICANTE','MURCIA','SEVILLA','MÁLAGA']
rel = defaultdict(lambda: {'variants': [], 'n': defaultdict(int), 'madrid': set()})
for t in H['trenes']:
    seq = [s for s, _, _ in t['paradas']]
    a, b = seq[0], seq[-1]
    if RANK.index(a) > RANK.index(b): seq = seq[::-1]; a, b = b, a
    names = [MAD[t['estacion_madrid']] if s == 'MADRID' else GT[s] for s in seq]
    r = rel[(a, b)]
    if names[1:-1] not in r['variants']: r['variants'].append(names[1:-1])
    r['n'][t['paradas'][0][0]] += 1
    r['first'] = names[0]; r['last'] = names[-1]
    if t['estacion_madrid']: r['madrid'].add(t['estacion_madrid'])
out = []
for (a, b), r in sorted(rel.items(), key=lambda kv: (RANK.index(kv[0][0]), RANK.index(kv[0][1]))):
    ida, vuelta = r['n'][a], r['n'][b]
    T = lambda x: x.capitalize()
    parts = [f"{n} {T(o)}→{T(d)}" for n, o, d in ((ida, a, b), (vuelta, b, a)) if n]
    cal = ' y '.join(parts) + ' al día como máximo'
    item = OrderedDict(id='ouigo-' + SHORT[a] + '-' + SHORT[b], origin=r['first'], destination=r['last'], variants=sorted(r['variants'], key=len), calendar=cal)
    if a == 'MADRID' and b in ('BARCELONA', 'VALENCIA'): item['madrid_assumed'] = True
    out.append(item)
F['ouigo'] = out
F['sources']['ouigo-horarios'] = {'title': 'OUIGO España · Horarios OUIGO 2026-2027 (PDF oficial)', 'url': H['fuente'],
    'edition': 'Horario válido hasta el 14-06-2027', 'consulted': '2026-11-19', 'valid_from': '2026-11-19', 'valid_to': '2027-06-14'}
F['ouigo_note'] = ('Trenes reconstruidos del PDF oficial de horarios 2026-2027 (válido hasta el 14-06-2027). Estación de Madrid confirmada en las páginas de ruta: '
    'Atocha para Andalucía, Zaragoza y Tarragona; Chamartín para Levante y Valladolid. Madrid–Barcelona (Atocha) y Madrid–Valencia (Chamartín) se asignan por corredor. '
    'Elche: estación de alta velocidad. Madrid–Andalucía suspendido por el cierre de la línea tras el accidente de Urda, al menos hasta el 29-11-2026.')
for r in out: print(r['id'], r['origin'], '->', r['destination'], r['calendar'], len(r['variants']), 'variantes')
json.dump(F, open(M + '/servicios-fuentes.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
