import pypdf, sys, re, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
reader = pypdf.PdfReader('xSourcePDFs/Rolemaster-CoreLaw.pdf')

S_BLEED   = '\uf053'
S_STUN    = '\uf02b'
S_BREAK   = '\uf040'
S_STAGGER = '\uf0ae'
S_PRONE   = '\uf0ca'
S_KNOCKBK = '\uf05f'
S_GRAPPLE = '\uf022'
S_FATIGUE = '\uf0de'
S_ADDCRIT = '\uf0a5'
S_DEATH   = '\U0001f480'  # skull emoji

ROLL_LOCATIONS = [
    (1,1,'Head'),(2,3,'Chest'),(4,5,'Abdomen'),(6,10,'Leg'),(11,15,'Arm'),
    (16,20,'Head'),(21,25,'Chest'),(26,35,'Abdomen'),(36,45,'Leg'),(46,55,'Arm'),
    (56,65,'Arm'),(66,66,'Abdomen'),(67,75,'Leg'),(76,80,'Chest'),(81,85,'Head'),
    (86,90,'Arm'),(91,95,'Leg'),(96,100,'Abdomen'),
]

def get_location(mn, mx):
    for a, b, loc in ROLL_LOCATIONS:
        if mn >= a and mx <= b:
            return loc
    return 'Body'

def parse_stats(s):
    out = {
        'hits': 0, 'hpr': 0, 'stun_rounds': 0, 'stun_penalty': 0,
        'stagger': False, 'prone': False, 'breakage': False, 'breakage_mod': 0,
        'knockback': 0, 'grapple_pct': 0, 'fatigue_penalty': 0, 'injury_penalty': 0,
        'instant_death': False, 'additional_crit': ''
    }
    if S_DEATH in s:
        out['instant_death'] = True
    m = re.search(r'OO\s*\+\s*(\d+)', s)
    if m:
        out['hits'] = int(m.group(1))
    m = re.search(re.escape(S_BLEED) + r'(\d+)', s)
    if m:
        out['hpr'] = int(m.group(1))
    # Stun brackets: T[-25], T[-50], T[-75] optionally preceded by \uf02b
    for m in re.finditer(r'(\d+)?' + re.escape(S_STUN) + r'\s*\[-(25|50|75)\]', s):
        rds = int(m.group(1)) if m.group(1) else 1
        pen = int(m.group(2))
        if pen > out['stun_penalty']:
            out['stun_penalty'] = pen
            out['stun_rounds'] = rds
    # Stun without \uf02b prefix
    if out['stun_rounds'] == 0:
        for m in re.finditer(r'(\d+)?\[-(25|50|75)\]', s):
            rds = int(m.group(1)) if m.group(1) else 1
            pen = int(m.group(2))
            if pen > out['stun_penalty']:
                out['stun_penalty'] = pen
                out['stun_rounds'] = rds
    if S_STAGGER * 2 in s:
        out['stagger'] = True
    if S_PRONE in s:
        out['prone'] = True
    if S_BREAK * 2 in s:
        out['breakage'] = True
        m = re.search(re.escape(S_BREAK * 2) + r'[\s\(]*([+-]?\d+)', s)
        if m:
            out['breakage_mod'] = int(m.group(1))
    m = re.search(re.escape(S_KNOCKBK) + r'(\d+)\'', s)
    if m:
        out['knockback'] = int(m.group(1))
    m = re.search(re.escape(S_GRAPPLE * 2) + r'\s*(\d+)%', s)
    if m:
        out['grapple_pct'] = int(m.group(1))
    m = re.search(re.escape(S_FATIGUE) + r'\(?(-?\+?\d+)\)?', s)
    if m:
        out['fatigue_penalty'] = abs(int(m.group(1)))
    for m in re.finditer(r'(?<!\[)-(\d+)', s):
        v = int(m.group(1))
        if v > out['injury_penalty']:
            out['injury_penalty'] = v
    m = re.search(re.escape(S_ADDCRIT) + r'\(([A-E])\)', s)
    if m:
        out['additional_crit'] = m.group(1)
    return out

def is_stats_start(line):
    stripped = line.strip()
    return bool(re.match(r'^(OO|\U0001f480|[\uf000-\uf0ff]|\d[\d\[,\s]|-\d)', stripped))

def is_desc_start(line):
    stripped = line.strip()
    return bool(re.match(r'^[A-Z][a-zA-Z]', stripped)) and not stripped.startswith('OO')

def split_row_results(block):
    lines = [l.strip() for l in block.split('\n') if l.strip()]
    results = []
    cur_desc = []
    cur_stats = []
    in_stats = False
    for line in lines:
        if not in_stats:
            if is_stats_start(line):
                in_stats = True
                cur_stats = [line]
            else:
                cur_desc.append(line)
        else:
            if is_desc_start(line):
                results.append((' '.join(cur_desc), ' '.join(cur_stats)))
                cur_desc = [line]
                cur_stats = []
                in_stats = False
            else:
                cur_stats.append(line)
    if cur_desc or cur_stats:
        results.append((' '.join(cur_desc), ' '.join(cur_stats)))
    return results

CRIT_PAGES = {
    'Acid': 226, 'Cold': 227, 'Electricity': 228, 'Grapple': 229, 'Heat': 230,
    'Holy': 231, 'Impact': 232, 'Krush': 233, 'Puncture': 234, 'Slash': 235,
    'Steam': 236, 'Strike': 237, 'Subdual': 238, 'Sweeps': 239, 'Unbalancing': 240,
}
CRIT_CODES = {
    'Acid': 'Ac', 'Cold': 'O', 'Electricity': 'L', 'Grapple': 'G', 'Heat': 'H',
    'Holy': 'Ho', 'Impact': 'I', 'Krush': 'K', 'Puncture': 'P', 'Slash': 'S',
    'Steam': 'St', 'Strike': 'T', 'Subdual': 'Su', 'Sweeps': 'Sw', 'Unbalancing': 'U',
}
CRIT_COLORS = {
    'Slash': '#ef4444', 'Krush': '#f97316', 'Puncture': '#eab308', 'Unbalancing': '#22c55e',
    'Grapple': '#14b8a6', 'Cold': '#60a5fa', 'Heat': '#fb923c', 'Electricity': '#a855f7',
    'Impact': '#6b7280', 'Acid': '#84cc16', 'Holy': '#fbbf24', 'Steam': '#67e8f9',
    'Strike': '#fb923c', 'Subdual': '#94a3b8', 'Sweeps': '#34d399',
}
CRIT_DESCS = {
    'Slash': 'Slashing attacks from edged weapons',
    'Krush': 'Crushing blunt weapons like maces and clubs',
    'Puncture': 'Piercing attacks from pointed weapons and arrows',
    'Unbalancing': 'Secondary criticals from powerful unbalancing blows',
    'Grapple': 'Unarmed grappling, wrestling, and entanglement attacks',
    'Cold': 'Elemental cold and freezing attacks',
    'Heat': 'Fire, heat, and elemental burning attacks',
    'Electricity': 'Lightning and electrical attacks',
    'Impact': 'Blunt force over large areas; falls and rams',
    'Acid': 'Caustic or acidic attacks',
    'Holy': 'Divine weapons or spells from a holy source',
    'Steam': 'Scalding water vapor and heated steam',
    'Strike': 'Unarmed punching and kicking attacks',
    'Subdual': 'Non-lethal attacks intended to subdue',
    'Sweeps': 'Unarmed throws and sweeping takedown attacks',
}
SEVERITIES = ['A', 'B', 'C', 'D', 'E']

all_tables = {}

for crit_name, page_idx in CRIT_PAGES.items():
    text = reader.pages[page_idx].extract_text() or ''

    header_pos = text.find('Roll A B C D E')
    if header_pos < 0:
        print(f'WARNING: No header for {crit_name}')
        continue
    data_text = text[header_pos + len('Roll A B C D E'):]

    # Known roll ranges — use exact patterns to avoid false positives from description text
    KNOWN_RANGES = [
        (1,1),(2,3),(4,5),(6,10),(11,15),(16,20),(21,25),(26,35),(36,45),(46,55),
        (56,65),(66,66),(67,75),(76,80),(81,85),(86,90),(91,95),(96,97),(98,99),(100,100),
    ]
    markers = []
    for mn, mx in KNOWN_RANGES:
        if mn == mx:
            pat = re.compile(r'(?:(?:Head|Chest|Abdomen|Leg|Arm)\s*)?' + str(mn) + r'\s*[\n ]')
        else:
            pat = re.compile(r'(?:(?:Head|Chest|Abdomen|Leg|Arm)\s*)?' + str(mn) + r'\s*[-\u2013]\s*' + str(mx))
        m = pat.search(data_text)
        if m:
            markers.append((m.end(), mn, mx))
        else:
            print(f'  WARNING: range {mn}-{mx} not found in {crit_name}')
    markers.sort(key=lambda x: x[0])

    rows_data = {}
    for i, (pos, mn, mx) in enumerate(markers):
        end_pos = markers[i + 1][0] if i + 1 < len(markers) else len(data_text)
        m = re.match(r'[\d\s\-\u2013]+', data_text[pos:])
        block_start = pos + (len(m.group()) if m else 0)
        block = data_text[block_start:end_pos].strip()
        results = split_row_results(block)
        rows_data[(mn, mx)] = results

    sev_arrays = {s: [] for s in SEVERITIES}
    for (mn, mx), results in sorted(rows_data.items()):
        loc = get_location(mn, mx)
        for si, sev in enumerate(SEVERITIES):
            if si < len(results):
                desc, stats_str = results[si]
                entry = parse_stats(stats_str)
                entry['min'] = mn
                entry['max'] = mx
                entry['location'] = loc
                entry['result'] = desc
            else:
                entry = {
                    'min': mn, 'max': mx, 'location': loc, 'result': '',
                    'hits': 0, 'hpr': 0, 'stun_rounds': 0, 'stun_penalty': 0,
                    'stagger': False, 'prone': False, 'breakage': False, 'breakage_mod': 0,
                    'knockback': 0, 'grapple_pct': 0, 'fatigue_penalty': 0,
                    'injury_penalty': 0, 'instant_death': False, 'additional_crit': ''
                }
            sev_arrays[sev].append(entry)

    all_tables[crit_name] = {
        'label': crit_name,
        'code': CRIT_CODES[crit_name],
        'color': CRIT_COLORS.get(crit_name, '#888888'),
        'desc': CRIT_DESCS.get(crit_name, crit_name + ' criticals'),
        **sev_arrays
    }
    total = sum(len(v) for v in sev_arrays.values())
    print(f'{crit_name}: {total} entries across {len(rows_data)} rows')

with open('src/data/crit_tables.json', 'w', encoding='utf-8') as f:
    json.dump(all_tables, f, indent=2, ensure_ascii=False)
print('Saved crit_tables.json')
