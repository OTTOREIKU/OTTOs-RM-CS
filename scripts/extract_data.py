"""Extract Rolemaster Excel data to JSON files for the web app."""
import sys
import json
import openpyxl
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

XLSX = Path(__file__).parent.parent / "RMU - Character Sheet 3.0 - _blank_.xlsx"
OUT = Path(__file__).parent.parent / "src" / "data"
OUT.mkdir(parents=True, exist_ok=True)

wb = openpyxl.load_workbook(str(XLSX), data_only=True)

def all_rows(sheet_name):
    ws = wb[sheet_name]
    return list(ws.iter_rows(min_row=1, values_only=True))

def save(name, data):
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
    count = len(data) if isinstance(data, (list, dict)) else "N/A"
    print(f"  {path.name} ({count})")

def ival(x):
    if x is None: return 0
    try: return int(float(x))
    except: return 0

def fval(x, default=0.0):
    if x is None: return default
    try: return float(x)
    except: return default

# ── STAT BONUS TABLE ──────────────────────────────────────────────────────────
stat_bonuses = {}
ranges = [
    (1,1,-25),(2,2,-20),(3,3,-15),(4,5,-12),(6,8,-10),(9,11,-9),(12,14,-8),
    (15,17,-7),(18,20,-6),(21,23,-5),(24,26,-4),(27,29,-3),(30,32,-3),
    (33,35,-2),(36,38,-2),(39,41,-1),(42,44,-1),(45,47,-1),(48,50,0),
    (51,53,0),(54,56,1),(57,59,1),(60,62,2),(63,65,2),(66,68,3),(69,71,3),
    (72,74,4),(75,77,4),(78,80,5),(81,83,5),(84,86,6),(87,89,7),(90,92,8),
    (93,95,9),(96,96,10),(97,97,11),(98,98,12),(99,99,13),(100,100,15),
]
for lo, hi, bonus in ranges:
    for v in range(lo, hi+1):
        stat_bonuses[str(v)] = bonus
save("stat_bonuses", stat_bonuses)

# ── SKILLS ───────────────────────────────────────────────────────────────────
skills = []
current_category = None
for row in all_rows("Skills"):
    name = row[0]
    if name is None:
        continue
    dev_cost = str(row[2]).strip() if row[2] is not None else ""
    prof_type = str(row[3]).strip() if row[3] is not None else ""
    stat_keys = str(row[6]).strip() if row[6] is not None else ""

    is_category = dev_cost and "/" in dev_cost and prof_type == "" and isinstance(name, str)
    is_skill = dev_cost and "/" in dev_cost and prof_type and isinstance(name, str)

    if is_category:
        current_category = name.strip()
        continue
    if is_skill:
        skills.append({
            "category": current_category,
            "name": name.strip(),
            "dev_cost": dev_cost,
            "prof_type": prof_type,
            "stat_keys": stat_keys,
        })

# Deduplicate
seen = set()
unique_skills = []
for s in skills:
    key = (s["category"], s["name"])
    if key not in seen:
        seen.add(key)
        unique_skills.append(s)
save("skills", unique_skills)

# ── SKILL CATEGORIES ─────────────────────────────────────────────────────────
categories = []
seen_cats = set()
for row in all_rows("Skills"):
    name = row[0]
    if name is None: continue
    dev_cost = str(row[2]).strip() if row[2] is not None else ""
    prof_type = str(row[3]).strip() if row[3] is not None else ""
    stat_keys = str(row[6]).strip() if row[6] is not None else ""
    if dev_cost and "/" in dev_cost and prof_type == "" and isinstance(name, str):
        n = name.strip()
        if n not in seen_cats:
            seen_cats.add(n)
            categories.append({"name": n, "dev_cost": dev_cost, "stat_keys": stat_keys})
save("skill_categories", categories)

# ── RACES ────────────────────────────────────────────────────────────────────
STAT_COLS = ["Agility","Constitution","Empathy","Intuition","Memory","Presence",
             "Quickness","Reasoning","Self Discipline","Strength"]
races = []
for row in all_rows("Racial Bonuses"):
    if row[0] is None or not isinstance(row[0], str): continue
    n = row[0].strip()
    if n in ("Race", " ", ""): continue
    races.append({
        "name": n,
        "stat_bonuses": {STAT_COLS[i]: ival(row[i+1]) for i in range(10)},
        "channeling_rr": ival(row[11]),
        "essence_rr": ival(row[12]),
        "mentalism_rr": ival(row[13]),
        "physical_rr": ival(row[14]),
        "endurance": ival(row[15]),
        "base_hits": ival(row[16]),
        "recovery_mult": fval(row[17], 1.0),
    })
save("races", races)

# ── PROFESSIONS / CLASS MATRICES ─────────────────────────────────────────────
mat_rows = all_rows("Class Matricies")
prof_headers = [str(p).strip() for p in mat_rows[0][3:] if p is not None]
professions = [p for p in prof_headers if p]

skill_costs = {}
for row in mat_rows[2:]:
    cat = str(row[2]).strip() if row[2] is not None else None
    if not cat: continue
    costs = {}
    for i, prof in enumerate(professions):
        idx = 3 + i
        costs[prof] = str(row[idx]).strip() if idx < len(row) and row[idx] is not None else "?/?"
    skill_costs[cat] = costs

save("professions", professions)
save("skill_costs", skill_costs)

# ── CULTURES ─────────────────────────────────────────────────────────────────
# Culture list is in column 7 (index 7) of CulturesRace Size Reference
cultures = []
for row in all_rows("CulturesRace Size Reference"):
    val = row[7] if len(row) > 7 else None
    if val and isinstance(val, str) and val.strip() not in ("Culture List", ""):
        cultures.append(val.strip())
save("cultures", cultures)

# ── ARMOR ────────────────────────────────────────────────────────────────────
armor_sections = {"full_suit": [], "torso": [], "legs": [], "arms": [], "head": []}
section_map = {"Full Suit": "full_suit", "Torso": "torso", "Legs": "legs", "Arms": "arms", "Head": "head"}
section = None
for row in all_rows("Armor"):
    label = str(row[1]).strip() if row[1] is not None else ""
    if label in section_map:
        section = section_map[label]
        continue
    if section and label == "Armor Type":
        continue
    if section and isinstance(row[1], (int, float)) and row[2] is not None:
        armor_sections[section].append({
            "at": int(row[1]),
            "name": str(row[2]).strip(),
            "encumbrance": fval(row[3]),
            "maneuver_penalty": fval(row[4]),
            "ranged_penalty": fval(row[5]),
            "perception_penalty": fval(row[6]),
        })
save("armor", armor_sections)

# ── SPELLS (detailed with descriptions, from 'Spells' sheet) ─────────────────
# Structure: list-header rows have row[2]="Ranks", row[4]=LIST_NAME
# Spell rows: row[2]=level(float), row[3]=spell_name, row[5]=AoE, row[6]=dur, row[7]=rng, row[8]=type, row[9]=notes
spell_lists_detailed = {}
current_list = None
current_section = None

for row in all_rows("Spells"):
    r1 = row[1]
    r2 = str(row[2]).strip() if row[2] is not None else ""

    # Section header: row[1]=float, row[2]="Base Lists" etc (unicode)
    if r1 is not None and isinstance(r1, float) and r2 in (
        "Bᴀsᴇ Lɪsᴛs", "Oᴘᴇɴ Lɪsᴛs", "Cʟᴏsᴇᴅ Lɪsᴛs", "Eᴠɪʟ Lɪsᴛs"
    ):
        current_section = r2
        continue

    # List header: row[2]="Ranks", row[4]=list name
    if r2 == "Ranks" and row[4] is not None:
        list_name = str(row[4]).strip()
        current_list = list_name
        if current_list not in spell_lists_detailed:
            spell_lists_detailed[current_list] = {
                "section": current_section,
                "spells": []
            }
        continue

    # Column headers row
    if r2 == "Level":
        continue

    # Spell row: row[2] is numeric level
    if current_list and row[2] is not None and isinstance(row[2], (int, float)):
        spell_lists_detailed[current_list]["spells"].append({
            "level": ival(row[2]),
            "name": str(row[3]).strip() if row[3] else "",
            "aoe": str(row[5]).strip() if row[5] else "",
            "duration": str(row[6]).strip() if row[6] else "",
            "range": str(row[7]).strip() if row[7] else "",
            "type": str(row[8]).strip() if row[8] else "",
            "notes": str(row[9]).strip() if row[9] else "",
        })

save("spell_lists_detailed", spell_lists_detailed)

# ── SPELLS (compact from realm sheets) ───────────────────────────────────────
# Structure: section (e.g. "Open Channeling"), list name (e.g. "BARRIER LAW"),
# headers row (Lvl/Spell/AoE/Dur./Range/Type), then spell rows (level as string)
def extract_realm_spells(sheet_name, realm):
    lists = {}
    section = None
    current = None
    for row in all_rows(sheet_name):
        r0 = str(row[0]).strip() if row[0] is not None else ""
        r1 = row[1]

        # Section: row[0] has text, all others None
        if r0 and r1 is None and row[2] is None:
            if any(k in r0 for k in ("Open", "Closed", "Evil", "Base", "Healer", "Hybrid", "Sorcerer", "Mystic")):
                section = r0
                current = None
            elif r0 not in ("Lvl",):
                # List name
                current = r0
                if current not in lists:
                    lists[current] = {"realm": realm, "section": section, "spells": []}
            continue

        # Column header row
        if r0 == "Lvl":
            continue

        # Spell row: r0 is numeric string
        if current and r0:
            try:
                level = int(r0)
            except ValueError:
                # Another list name
                current = r0
                if current not in lists:
                    lists[current] = {"realm": realm, "section": section, "spells": []}
                continue
            if r1 is not None:
                lists[current]["spells"].append({
                    "level": level,
                    "name": str(r1).strip(),
                    "aoe": str(row[2]).strip() if row[2] else "",
                    "duration": str(row[3]).strip() if row[3] else "",
                    "range": str(row[4]).strip() if row[4] else "",
                    "type": str(row[5]).strip() if row[5] else "",
                })
    return lists

channeling = extract_realm_spells("Channeling_Spells", "Channeling")
essence    = extract_realm_spells("Essence_Spells",    "Essence")
mentalism  = extract_realm_spells("Mentalism_Spells",  "Mentalism")
hybrid     = extract_realm_spells("Hybrid_Spells",     "Hybrid")

all_spell_lists = {**channeling, **essence, **mentalism, **hybrid}

# Merge descriptions from spell_lists_detailed into all_spell_lists
for list_name, detail in spell_lists_detailed.items():
    spell_map = {s["level"]: s for s in detail["spells"]}
    if list_name in all_spell_lists:
        for sp in all_spell_lists[list_name]["spells"]:
            if sp["level"] in spell_map:
                sp["notes"] = spell_map[sp["level"]].get("notes", "")
    else:
        all_spell_lists[list_name] = detail

save("spell_lists", all_spell_lists)
save("channeling_spells", channeling)
save("essence_spells",    essence)
save("mentalism_spells",  mentalism)
save("hybrid_spells",     hybrid)

# ── WEAPONS ──────────────────────────────────────────────────────────────────
weapons = []
seen_w = set()
for row in all_rows("WT_Ref"):
    name = row[0]
    if name and isinstance(name, str) and name.strip() and name.strip() not in seen_w:
        seen_w.add(name.strip())
        weapons.append(name.strip())
save("weapons", weapons)

# ── SPELL MATRICES (which profession can use which spell list) ────────────────
mat = all_rows("Spell Matricies")
if mat:
    prof_header = [str(c).strip() if c else "" for c in mat[0]]
    spell_prof_matrix = {}
    for row in mat[1:]:
        list_name = str(row[0]).strip() if row[0] else None
        if not list_name: continue
        access = {}
        for i, prof in enumerate(prof_header[1:], 1):
            if prof and i < len(row):
                access[prof] = str(row[i]).strip() if row[i] else ""
        spell_prof_matrix[list_name] = access
    save("spell_matrices", spell_prof_matrix)

print("\nDone!")
