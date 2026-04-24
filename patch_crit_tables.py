import sys
import json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

with open('src/data/crit_tables.json', encoding='utf-8') as f:
    data = json.load(f)

# ---------- EMPTY FIELDS ----------

# 1. Grapple / E / index 18 (rolls 98-99)
data['Grapple']['E'][18]['result'] = (
    "Unbreakable pressure on foe's chest, starving the body of oxygen, will render foe unconscious in six more rounds of near complete helplessness."
)

# 2. Heat / E / index 18 (rolls 98-99)
data['Heat']['E'][18]['result'] = (
    "Solid blast knocks back foe, while any held weapon goes flying."
)

# 3. Holy / E / index 6 (rolls 21-25)
data['Holy']['E'][6]['result'] = (
    "A hurricane force wind that only your foe can feel roars for a moment."
)

# 4. Holy / E / index 19 (roll 100)
data['Holy']['E'][19]['result'] = (
    "A liquid flow of white spreads from the point of impact, foe is left as a solid statue of bone."
)

# 5. Puncture / E / index 0 (roll 1)
data['Puncture']['E'][0]['result'] = (
    "A little wound to the side of foe's head begins to bleed, and it does not stop."
)

# 6. Unbalancing / E / index 6 (rolls 21-25)
data['Unbalancing']['E'][6]['result'] = (
    "A broken rib now pushes back against the lung."
)

# ---------- TRUNCATED FIELDS ----------

# 7. Acid / C / index 19 (rolls 96-100)
data['Acid']['C'][19]['result'] = (
    "Acid takes out foe's eyes on the way to his brain. Foe dies instantly, while you feel energized (lose up to -20 in accumulated fatigue)."
)

# 8. Cold / B / index 18 (rolls 96-97)
data['Cold']['B'][18]['result'] = (
    "Cold is too diffuse to do much specific damage (touch of frostbite), but core temperature drops lethally. Death in 10 rounds."
)

# 9. Cold / C / index 17 (rolls 91-95)
data['Cold']['C'][17]['result'] = (
    "Foe winded as stomach tightens under oppressive cold. Core temperature plummets; foe dies in 9 rounds."
)

# 10. Cold / E / index 16 (rolls 81-85)
data['Cold']['E'][16]['result'] = (
    "Foe's leg is covered in ice, limiting foe to 10% movement. Foe will freeze to death in 10 rounds."
)

# 11. Electricity / E / index 13 (rolls 67-75)
data['Electricity']['E'][13]['result'] = (
    "Direct strike momentarily pauses foe's heart, leaving that organ damaged. Foe at -25 to Endurance until healed."
)

# 12. Heat / C / index 19 (rolls 96-100)
data['Heat']['C'][19]['result'] = (
    "Foe's face burns while he screams for 2 rounds. Then foe collapses and dies 9 rounds later."
)

# 13. Puncture / D / index 17 (rolls 91-95)
data['Puncture']['D'][17]['result'] = (
    "Strike sinks deep into foe's side, damaging intestines. Foe will die in 8 rounds."
)

# 14. Slash / E / index 16 (rolls 81-85)
data['Slash']['E'][16]['result'] = (
    "Nasty cut across both legs knocks foe down. Foe struggles back on his feet for 5 more rounds, then his femoral arteries burst in a gout of blood, killing him."
)

# 15. Subdual / B / index 7 (rolls 26-35)
data['Subdual']['B'][7]['result'] = (
    "Fake high, strike low, catch foe in the groin. Foe is wary and fights you at -15 for the rest of the battle."
)

# 16. Subdual / C / index 5 (rolls 11-15)
data['Subdual']['C'][5]['result'] = (
    "Hard bonk to head causes foe to bite tongue and mouth fills with blood. Foe is unable to speak or scream for 2 rounds."
)

# 17. Sweeps / D / index 17 (rolls 91-95)
data['Sweeps']['D'][17]['result'] = (
    "Foe tossed 10' in the direction of your choice, lands hard with own elbow in the gut. Liver and spleen damaged, death in 5 rounds."
)

# ---------- WRITE BACK ----------
with open('src/data/crit_tables.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Done. 17 entries patched.")

# ---------- VERIFY ----------
checks = [
    ('Grapple', 'E', 18),
    ('Heat',    'E', 18),
    ('Holy',    'E',  6),
    ('Holy',    'E', 19),
    ('Puncture','E',  0),
    ('Unbalancing','E',6),
    ('Acid',    'C', 19),
    ('Cold',    'B', 18),
    ('Cold',    'C', 17),
    ('Cold',    'E', 16),
    ('Electricity','E',13),
    ('Heat',    'C', 19),
    ('Puncture','D', 17),
    ('Slash',   'E', 16),
    ('Subdual', 'B',  7),
    ('Subdual', 'C',  5),
    ('Sweeps',  'D', 17),
]
for table, sev, idx in checks:
    r = data[table][sev][idx]['result']
    ok = '✓' if r.strip() else '✗ STILL EMPTY'
    print(f"  {ok}  {table}/{sev}/{idx}: {r[:80]}")
