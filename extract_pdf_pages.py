import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from pypdf import PdfReader

pdf_path = r"E:\ClaudeProjects\RolemasterCharacterSheet\xSourcePDFs\Rolemaster-CoreLaw.pdf"
reader = PdfReader(pdf_path)

# Page indices (0-based) for affected tables
pages = {
    "Acid": 226,
    "Cold": 227,
    "Electricity": 228,
    "Grapple": 229,
    "Heat": 230,
    "Holy": 231,
    "Puncture": 234,
    "Slash": 235,
    "Subdual": 238,
    "Sweeps": 239,
    "Unbalancing": 240,
}

for name, page_idx in pages.items():
    page = reader.pages[page_idx]
    text = page.extract_text()
    print(f"\n{'='*80}")
    print(f"PAGE {page_idx} — {name}")
    print('='*80)
    print(text)
