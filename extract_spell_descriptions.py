import sys
import json
import re

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from pypdf import PdfReader

# ── Load canonical list names ───────────────────────────────────────────────
with open('src/data/spell_lists.json', encoding='utf-8') as f:
    spell_lists_data = json.load(f)

canonical_names = set(spell_lists_data.keys())
print(f"Loaded {len(canonical_names)} canonical list names from spell_lists.json")


# ── Helpers ──────────────────────────────────────────────────────────────────

def normalize_list_name(raw):
    """
    Normalize a raw string to canonical form:
    - Replace curly/smart apostrophes with straight apostrophe
    - Collapse multiple spaces to one
    - Strip surrounding whitespace
    """
    s = raw.replace('\u2019', "'").replace('\u2018', "'")
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def fuzzy_match_canonical(candidate, canonical_names):
    """
    Match a candidate string to a canonical list name, handling:
    - Curly apostrophes → straight apostrophes
    - Extra spaces (ligature split artifacts): "EV ASIONS" → "EVASIONS"
    """
    norm = normalize_list_name(candidate)
    if norm in canonical_names:
        return norm

    # Space-collapse comparison
    norm_nospace = norm.replace(' ', '').replace("'", '')
    for name in canonical_names:
        if name.replace(' ', '').replace("'", '') == norm_nospace:
            return name

    return None


def extract_list_name_before(text_before_lvl_spell):
    """
    Given the text that precedes 'Lvl Spell', find the list name.
    It's the last non-empty line before 'Lvl Spell' that matches a canonical name.
    """
    lines = text_before_lvl_spell.split('\n')
    for line in reversed(lines):
        if not line.strip():
            continue
        result = fuzzy_match_canonical(line, canonical_names)
        if result:
            return result
    return None


def clean_description(text):
    """Clean up a spell description string."""
    # Remove section header contamination at end of descriptions:
    # e.g., "...per round.\n6.1 - Open Channeling\nDETECTION MASTERY"
    # Pattern: optional period/newline then section reference "X.X - Name" or "X.X - Name X.X - Name"
    text = re.sub(r'[\n ]+\d+\.\d+\s*[-–]\s*[A-Za-z].*$', '', text, flags=re.DOTALL)
    # Join hyphenated line-breaks: "word -\n" (with space before hyphen)
    text = re.sub(r'\s*-\s*\n\s*', '', text)
    # Join slash+newline: "1 mile/\nlevel" → "1 mile/level"
    text = re.sub(r'/\s*\n\s*', '/', text)
    # Replace all remaining newlines with a space
    text = re.sub(r'\n', ' ', text)
    # Collapse multiple spaces (including those created by the joins above)
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()


def preprocess_text_block(text):
    """
    Fix common PDF extraction artifacts before parsing spell entries.
    - Insert newline when a sentence-ending period is immediately followed
      by a level number+period (e.g., "4 AP.1. Ready Weapon" → "4 AP.\n1. Ready Weapon")
    """
    # Pattern: word character, period, then immediately level number + period/space + uppercase
    # e.g. "4 AP.1. Ready Weapon" → "4 AP.\n1. Ready Weapon"
    # Only when the level number is followed by ". Capital" (spell entry format)
    text = re.sub(r'(\w)\.(\d{1,2}\.\s+[A-Z])', lambda m: m.group(1) + '.\n' + m.group(2), text)
    return text


def extract_entries_from_text_block(text_block):
    text_block = preprocess_text_block(text_block)
    """
    Parse spell entries of the form:
      N. Spell Name – Description text...
    Returns dict {level_str: description_str} for levels 1-20,25,30,35,40,50.

    Handles PDF artifacts:
    - Leading space before level number: " 8. Hawk Sense"
    - Missing period: "14 Telekinesis IV –"
    - Comma instead of period: "13, Greater Magic Lock –"
    - Entry follows another entry with no newline: "4 AP.1. Ready Weapon"
    - Hyphen as separator: "35. Following Fires True - As Following..."
    """
    valid_levels = set(list(range(1, 21)) + [25, 30, 35, 40, 50])
    entries = {}

    # Normalized separator: en-dash, em-dash, or ' - ' (space hyphen space)
    # Spell name ends at separator or newline
    # Level entry can start after: newline, space+newline, period, or string start
    # Level number followed by: period, comma, or space (but NOT another digit - avoid "14" in "140")
    pattern = re.compile(
        r'(?:(?<=\n) *|(?<=\A) *)'         # start of line (with optional spaces) or string
        r'(\d{1,2})'                         # level number
        r'[.,]?\s+'                          # optional period/comma, whitespace
        r'([^\n\u2013\u2014-][^\n\u2013\u2014]*?)'  # spell name
        r'\s*(?:[\u2013\u2014]| - )\s*'     # separator (en/em dash or ' - ')
        r'(.+?)'                             # description text
        r'(?='
            r'\n\s*\d{1,2}[.,]?\s+[A-Z]'   # next entry: level + capital letter
            r'|\Z'                           # end of string
        r')',
        re.DOTALL
    )

    for m in pattern.finditer(text_block):
        level = int(m.group(1))
        if level not in valid_levels:
            continue
        desc = clean_description(m.group(3))
        if desc:
            entries[str(level)] = desc

    return entries


def process_page(text):
    """
    Process a page of text and return a list of (list_name_or_sentinel, entries) tuples.

    Returns list of tuples:
      - ('FOUND', list_name, entries)     — list name identified on this page
      - ('BEFORE', entries)               — entries from before the table (continuation)
      - ('AFTER_REVERSED', entries)       — entries from after the table (reversed layout)

    The caller resolves 'BEFORE' list names from neighboring pages.
    """
    results = []

    stats_idx = text.find('\nLvl Spell')

    if stats_idx == -1:
        # No stats table: entire page is either a continuation or has no spells
        entries = extract_entries_from_text_block(text)
        if entries:
            results.append(('NO_TABLE', entries))
        return results

    before_table = text[:stats_idx]
    after_table = text[stats_idx:]

    # Find the list name from the stats table header
    list_name = extract_list_name_before(before_table)

    has_desc_before = bool(re.search(r'\n\d{1,2}\.\s+[^\n\u2013\u2014]+[\u2013\u2014]', before_table))
    has_desc_after = bool(re.search(r'\n\d{1,2}\.\s+[^\n\u2013\u2014]+[\u2013\u2014]', after_table))

    if has_desc_before and has_desc_after:
        # Combined page:
        # The text before the table contains descriptions that may belong to:
        #   (a) This same list (when this page is both a continuation AND has a reversed section)
        #   (b) The previous list (when this page is a continuation of one list followed by next list)
        # We can distinguish: if list_name is found in the before_table footer text,
        # then BOTH sections belong to list_name.
        # Otherwise, before belongs to prev list.

        before_entries = extract_entries_from_text_block(before_table)
        after_desc_match = re.search(r'\n\d{1,2}\.\s+[^\n\u2013\u2014]+[\u2013\u2014]', after_table)
        after_block = after_table[after_desc_match.start():] if after_desc_match else ''
        after_entries = extract_entries_from_text_block(after_block) if after_block else {}

        if list_name:
            # Combine both before and after under the same list name
            if before_entries:
                results.append(('FOUND', list_name, before_entries))
            if after_entries:
                results.append(('FOUND', list_name, after_entries))
        else:
            # list_name unknown — before entries go to prev list, after unknown
            if before_entries:
                results.append(('BEFORE', before_entries))
            if after_entries:
                results.append(('AFTER_UNKNOWN', after_entries))

    elif has_desc_after and not has_desc_before:
        # Reversed layout: stats table first, then descriptions
        desc_match = re.search(r'\n\d{1,2}\.\s+[^\n\u2013\u2014]+[\u2013\u2014]', after_table)
        if desc_match:
            after_block = after_table[desc_match.start():]
            entries = extract_entries_from_text_block(after_block)
            if entries and list_name:
                results.append(('FOUND', list_name, entries))
            elif entries:
                results.append(('AFTER_UNKNOWN', entries))

    elif has_desc_before:
        # Normal layout: descriptions before the stats table
        entries = extract_entries_from_text_block(before_table)
        if entries and list_name:
            results.append(('FOUND', list_name, entries))
        elif entries:
            # List name is in the table footer on this page but not found?
            results.append(('NO_TABLE', entries))  # will be resolved

    return results


# ── Main extraction ──────────────────────────────────────────────────────────

reader = PdfReader('xSourcePDFs/Rolemaster-SpellLaw.pdf')
total_pages = len(reader.pages)
print(f"PDF has {total_pages} pages")

# First pass: process all pages
page_texts = []
page_results = []
page_list_names = []  # canonical list name from table footer (None if no table)

for page_idx in range(total_pages):
    text = reader.pages[page_idx].extract_text() or ''
    page_texts.append(text)
    results = process_page(text)
    page_results.append(results)

    # Determine the list name for this page (from its stats table)
    found_name = None
    for r in results:
        if r[0] == 'FOUND':
            found_name = r[1]
            break
    page_list_names.append(found_name)


def find_list_for_continuation(page_idx, kind):
    """
    For BEFORE/NO_TABLE/AFTER_UNKNOWN entries on page_idx, find the list name.

    Strategy:
    - 'BEFORE': on a combined page, the before-section already has list_name from the footer.
      This function is only called if list_name was None — look backward.
    - 'NO_TABLE': pure continuation page (no stats table at all).
      These are the SECOND half of a 2-page list. The list's table is on a PREVIOUS or NEXT page.
      Look backward first (more common: description page N, then table page N+1).
      But also check forward for cases where table comes on next page.
    - 'AFTER_UNKNOWN': rare fallback, look in both directions.
    """
    if kind == 'NO_TABLE':
        # Pure continuation — look backward first (prev page has the table)
        for offset in range(1, 5):
            idx = page_idx - offset
            if idx >= 0 and page_list_names[idx] is not None:
                return page_list_names[idx]
        # Then forward
        for offset in range(1, 5):
            idx = page_idx + offset
            if idx < len(page_list_names) and page_list_names[idx] is not None:
                return page_list_names[idx]
    else:
        # BEFORE or AFTER_UNKNOWN — look backward first
        for offset in range(1, 5):
            idx = page_idx - offset
            if idx >= 0 and page_list_names[idx] is not None:
                return page_list_names[idx]
        for offset in range(1, 5):
            idx = page_idx + offset
            if idx < len(page_list_names) and page_list_names[idx] is not None:
                return page_list_names[idx]
    return None


# Second pass: resolve list names and accumulate descriptions
all_descriptions = {}
pages_with_spells = 0
unresolved_pages = []

for page_idx in range(total_pages):
    results = page_results[page_idx]
    if not results:
        continue

    for r in results:
        kind = r[0]

        if kind == 'FOUND':
            _, list_name, entries = r
            pages_with_spells += 1
            if list_name not in all_descriptions:
                all_descriptions[list_name] = {}
            for level, desc in entries.items():
                if level not in all_descriptions[list_name]:
                    all_descriptions[list_name][level] = desc

        elif kind in ('BEFORE', 'NO_TABLE', 'AFTER_UNKNOWN'):
            entries = r[1]
            # Resolve list name from neighboring pages
            list_name = find_list_for_continuation(page_idx, kind)
            if list_name:
                pages_with_spells += 1
                if list_name not in all_descriptions:
                    all_descriptions[list_name] = {}
                for level, desc in entries.items():
                    if level not in all_descriptions[list_name]:
                        all_descriptions[list_name][level] = desc
            else:
                unresolved_pages.append(page_idx + 1)
                print(f"  WARNING: Page {page_idx+1} has {len(entries)} entries but no list name found (kind={kind})")


# ── Sort output ──────────────────────────────────────────────────────────────
sorted_output = {}
for list_name in sorted(all_descriptions.keys()):
    levels = all_descriptions[list_name]
    sorted_levels = dict(sorted(levels.items(), key=lambda x: int(x[0])))
    sorted_output[list_name] = sorted_levels


# ── Write output ─────────────────────────────────────────────────────────────
output_path = 'src/data/spell_descriptions.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(sorted_output, f, ensure_ascii=False, indent=2)


# ── Summary ──────────────────────────────────────────────────────────────────
total_lists_covered = len(sorted_output)
total_descriptions = sum(len(v) for v in sorted_output.values())

print(f"\n=== EXTRACTION SUMMARY ===")
print(f"Pages processed with spell entries: {pages_with_spells}")
print(f"Lists covered: {total_lists_covered} / {len(canonical_names)}")
print(f"Total descriptions extracted: {total_descriptions}")

missing_lists = sorted(canonical_names - set(sorted_output.keys()))
if missing_lists:
    print(f"\nLists with 0 descriptions ({len(missing_lists)}):")
    for name in missing_lists:
        print(f"  - {name}")
else:
    print("\nAll canonical lists have at least one description!")

print(f"\nLists with fewer than 25 descriptions:")
for name, levels in sorted(sorted_output.items()):
    count = len(levels)
    if count < 25:
        print(f"  {name}: {count} descriptions")

print(f"\nOutput written to {output_path}")
