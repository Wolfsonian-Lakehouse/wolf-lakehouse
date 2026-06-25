import pandas as pd
import logging
import sys
import re
import unicodedata
from pathlib import Path

UNIFIED_CATALOG = Path('/app/data/gold/unified_catalog.parquet')
OUTPUT_PARQUET  = Path('/app/data/gold/unified_catalog_normalized.parquet')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ---------------------------------------------------------------------------
# GENRE NORMALIZATION
# Map every known raw value (from both Alma and Proficio) to a clean label.
# Add more entries as you discover new values in Metabase.
# ---------------------------------------------------------------------------
GENRE_MAP = {
    # Posters
    'POSTER': 'POSTER', 'POSTERS': 'POSTER', 'BROADSIDE': 'POSTER',
    # Pamphlets
    'PAMPHLET': 'PAMPHLET', 'PAMPHLETS': 'PAMPHLET',
    'BROCHURE': 'PAMPHLET', 'LEAFLET': 'PAMPHLET',
    # Books
    'BOOK': 'BOOKS', 'BOOKS': 'BOOKS', 'MONOGRAPH': 'BOOKS',
    # Periodicals
    'PERIODICAL': 'PERIODICAL', 'JOURNAL': 'PERIODICAL',
    'MAGAZINE': 'PERIODICAL', 'SERIAL': 'PERIODICAL',
    # Photographs
    'PHOTOGRAPH': 'PHOTOGRAPH', 'PHOTO': 'PHOTOGRAPH',
    'PHOTOGRAPHY': 'PHOTOGRAPH', 'NEGATIVE': 'PHOTOGRAPH',
    'SLIDE': 'PHOTOGRAPH',
    # Drawings
    'DRAWING': 'DRAWING', 'DRAWINGS': 'DRAWING', 'SKETCH': 'DRAWING',
    # Prints
    'PRINT': 'PRINT', 'PRINTS': 'PRINT', 'LITHOGRAPH': 'PRINT',
    'ETCHING': 'PRINT', 'WOODCUT': 'PRINT', 'ENGRAVING': 'PRINT',
    # Postcards
    'POSTCARD': 'POSTCARD', 'POST CARD': 'POSTCARD', 'POSTCARDS': 'POSTCARD',
    # Ephemera
    'EPHEMERA': 'EPHEMERA', 'EPHEMERAL': 'EPHEMERA', 'ADVERTISING EPHEMERA': 'EPHEMERA',
    # Mixed media / objects
    'MIXED MEDIA': 'MIXED MEDIA', 'MIXED-MEDIA': 'MIXED MEDIA',
    'OBJECT': 'OBJECT', 'OBJECTS': 'OBJECT', 'MUSEUM OBJECT': 'OBJECT',
    # Paintings / art
    'PAINTING': 'PAINTING', 'PAINTINGS': 'PAINTING',
    'SCULPTURE': 'SCULPTURE', 'STATUE': 'SCULPTURE',
    'TEXTILE': 'TEXTILE', 'TEXTILES': 'TEXTILE', 'FABRIC': 'TEXTILE', 'CLOTHING': 'TEXTILE',
    # Maps
    'MAP': 'MAP', 'MAPS': 'MAP', 'CARTOGRAPHIC': 'MAP',
    # Furniture / design
    'FURNITURE': 'FURNITURE', 'DECORATIVE ARTS': 'FURNITURE',
    # Library Specifics
    'EXHIBITION CATALOGS': 'EXHIBITION CATALOG', 'EXHIBITION CATALOG': 'EXHIBITION CATALOG',
    'BIBLIOGRAPHY': 'BOOKS', 'CATALOGS': 'CATALOG', 'COLLECTION': 'COLLECTION',
}

def normalize_genre(val):
    if pd.isna(val) or str(val).strip() == '' or str(val).lower() == 'none':
        return pd.NA
    
    # Strip whitespace and make uppercase
    raw_val = str(val).strip().upper()
    # Remove any trailing punctuation (.,;:)
    clean_val = re.sub(r'[.,;:!]$', '', raw_val).strip()
    
    if clean_val in GENRE_MAP:
        return GENRE_MAP[clean_val]
    
    # If not in map, just return the cleaned uppercase version
    return clean_val

def normalize_subject(val):
    if pd.isna(val) or str(val).strip() == '' or str(val).lower() == 'none':
        return pd.NA
    # If it's a pipe-separated list, clean each item
    parts = [p.strip().rstrip('.') for p in str(val).split('|')]
    # Remove 'subject:' prefix if it exists
    parts = [re.sub(r'^subject:', '', p, flags=re.IGNORECASE).strip() for p in parts]
    return ' | '.join([p for p in parts if p]) if parts else pd.NA


# ---------------------------------------------------------------------------
# DATE NORMALIZATION
# Extract the earliest 4-digit year from any date string for numeric analysis.
# ---------------------------------------------------------------------------
def extract_year(val):
    if pd.isna(val):
        return pd.NA
    match = re.search(r'\b(1[5-9]\d{2}|20[0-2]\d)\b', str(val))
    return int(match.group(1)) if match else pd.NA

def year_to_decade(year):
    if pd.isna(year):
        return pd.NA
    return (int(year) // 10) * 10


# ---------------------------------------------------------------------------
# CREATOR NORMALIZATION
# Alma stores agents as "Last, First||role". Strip the role suffix.
# Proficio stores free-text. Both become a clean display name.
# ---------------------------------------------------------------------------
def normalize_creator(val):
    if pd.isna(val) or str(val).strip() == '':
        return pd.NA
        
    # Some older pipelines used '||', standard is '|'
    val_str = str(val).replace('||', '|')
    agents = val_str.split('|')
    clean_agents = []
    
    # Add mapping dictionary for common name spelling variants (lowercase keys)
    CREATOR_ALIASES = {
        'josef grof': 'József Gróf',
        'josef gróf': 'József Gróf',
        'wiener werkstaette': 'Wiener Werkstätte',
        'wiener werkstatte': 'Wiener Werkstätte',
        'wiener werkstätte': 'Wiener Werkstätte',
        # Add more mappings here as you find them!
    }
    
    for agent in agents:
        agent = agent.strip()
        # Check for RDF mapping format "relators:role:person:Name"
        parts = agent.split(':')
        if len(parts) >= 4 and parts[0] == 'relators' and parts[2] == 'person':
            name = ':'.join(parts[3:]).strip()
        else:
            name = agent
            
        # Remove trailing punctuation common in MARC (period, comma)
        name = name.rstrip('.,;')
        
        # Apply alias mapping if it exists
        lower_name = name.lower()
        if lower_name in CREATOR_ALIASES:
            name = CREATOR_ALIASES[lower_name]
            
        if name:
            clean_agents.append(name)
            
    return ' | '.join(clean_agents) if clean_agents else pd.NA


# ---------------------------------------------------------------------------
# TITLE NORMALIZATION
# MARC titles often end with a trailing period. Strip it.
# ---------------------------------------------------------------------------
def normalize_title(val):
    if pd.isna(val) or str(val).strip() == '':
        return pd.NA
    return str(val).strip().rstrip('.')


# ---------------------------------------------------------------------------
# PLACE PUBLISHED NORMALIZATION
# Cleans up MARC brackets, trailing punctuation, and "unknown" variants.
# ---------------------------------------------------------------------------
def normalize_place_published(val):
    if pd.isna(val) or str(val).strip() == '':
        return pd.NA
        
    val_str = str(val).strip()
    
    # Remove leading brackets and quotes
    val_str = re.sub(r'^\[?\"?\[?', '', val_str)
    
    # Remove trailing brackets, quotes, and punctuation
    val_str = re.sub(r'[\]\"\'.,;:!?\s]+$', '', val_str)
    
    # Handle "Place of publication not identified" variants
    lower_val = val_str.lower()
    if 'place of publication not identified' in lower_val or 's.l' in lower_val or 's.i.' in lower_val or 'n.l.' in lower_val:
        return 'Unknown'
        
    if not val_str or val_str in ['?', '-']:
        return 'Unknown'
        
    # Handle hierarchical pipes (e.g. "United States |New York |New York")
    val_str = val_str.replace(' |', ', ').replace('|', ', ')
    
    # Clean up any double commas or trailing commas from empty pipe sections
    val_str = re.sub(r',\s*,', ',', val_str)
    val_str = val_str.strip(' ,')
    
    return val_str

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    if not UNIFIED_CATALOG.exists():
        logging.warning(f'Unified catalog not found at {UNIFIED_CATALOG}. Run export_gold_unified_catalog.py first.')
        return

    logging.info('--- 🔄 GENERATE GOLD NORMALIZED CATALOG ---')
    df = pd.read_parquet(UNIFIED_CATALOG)
    logging.info(f'Loaded {len(df)} records from unified catalog.')

    # --- Genre ---
    if 'field_genre' in df.columns:
        df['field_genre'] = df['field_genre'].apply(normalize_genre)
        logging.info('✅ Normalized field_genre.')
        # Diagnostic: show top 5 genres
        top_genres = df['field_genre'].value_counts().head(5).to_dict()
        logging.info(f"Top 5 Genres: {top_genres}")

    # --- Subject ---
    if 'field_subject' in df.columns:
        df['field_subject'] = df['field_subject'].apply(normalize_subject)
        logging.info('✅ Normalized field_subject.')

    # --- Title ---
    if 'title' in df.columns:
        df['title'] = df['title'].apply(normalize_title)
        logging.info('✅ Normalized title.')

    # --- Creator ---
    if 'field_linked_agent' in df.columns:
        df['field_linked_agent'] = df['field_linked_agent'].apply(normalize_creator)
        logging.info('✅ Normalized field_linked_agent.')

    # --- Place Published ---
    if 'field_place_published' in df.columns:
        df['field_place_published'] = df['field_place_published'].apply(normalize_place_published)
        logging.info('✅ Normalized field_place_published.')

    # --- Dates: extract derived year + decade columns for any date fields ---
    date_columns = [
        'field_edtf_date_created', 
        'original_date'   # Add any other date columns you want to normalize here!
    ]
    
    for date_col in date_columns:
        if date_col in df.columns:
            year_col = f"{date_col}_year"
            decade_col = f"{date_col}_decade"
            
            df[year_col] = df[date_col].apply(extract_year).astype('Int64')
            df[decade_col] = df[year_col].apply(year_to_decade).astype('Int64')
            logging.info(f'✅ Derived {year_col} and {decade_col} from {date_col}.')
            
    # For backwards compatibility with any existing dashboards, 
    # alias the primary date fields
    if 'field_edtf_date_created_year' in df.columns:
        df['year_created'] = df['field_edtf_date_created_year']
        df['decade_created'] = df['field_edtf_date_created_decade']

    # --- Images: Check local directory for completeness flag ---
    OUTPUT_DIR = Path('/app/data/gold/images')
    if OUTPUT_DIR.exists():
        existing_dest_images = set(f.name for f in OUTPUT_DIR.glob('*.jpg'))
        
        def check_has_image(identifier):
            if pd.isna(identifier) or not identifier:
                return False
            identifier_str = str(identifier).strip()
            id_parts = [p.strip() for p in identifier_str.split(';') if p.strip()]
            primary_id = id_parts[0] if id_parts else identifier_str
            if len(primary_id) > 200:
                return False
            return f"{primary_id}.jpg" in existing_dest_images

        if 'field_identifier' in df.columns:
            df['has_image'] = df['field_identifier'].apply(check_has_image)
            logging.info('✅ Normalized has_image completeness flag.')
    else:
        df['has_image'] = False

    # --- Search Optimization ---
    logging.info('Creating normalized search_text column...')
    def remove_accents(input_str):
        if pd.isna(input_str):
            return ''
        nfd_form = unicodedata.normalize('NFD', str(input_str))
        return ''.join([c for c in nfd_form if not unicodedata.combining(c)])

    search_cols = ['title', 'field_identifier', 'field_collection_type', 'field_collection_note', 'field_credit_line', 'field_extent', 'field_physical_form', 'field_genre', 'field_description_long', 'field_linked_agent', 'field_subject', 'field_place_published', 'source_system']
    search_cols = [c for c in search_cols if c in df.columns]
    
    df['search_text'] = df[search_cols].fillna('').astype(str).agg(' '.join, axis=1)
    df['search_text'] = df['search_text'].apply(remove_accents).str.lower()
    logging.info('✅ Created search_text column.')

    # --- Drop fully empty columns ---
    before = len(df.columns)
    df = df.dropna(axis=1, how='all')
    logging.info(f'Dropped {before - len(df.columns)} fully empty columns.')

    OUTPUT_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUTPUT_PARQUET, index=False)
    logging.info(f'💾 Saved Normalized Catalog: {OUTPUT_PARQUET}')
    logging.info(f'Final Shape: {len(df)} records, {len(df.columns)} columns.')
    logging.info('✅ Gold Normalized Catalog complete!')


if __name__ == "__main__":
    main()
