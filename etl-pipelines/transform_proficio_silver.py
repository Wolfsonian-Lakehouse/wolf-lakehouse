# ==========================================
# ==========================================
# IMPORTS & SETUP
# ==========================================
import pandas as pd
import re
import unicodedata
import logging
import configparser
import sys
import json
from pathlib import Path

# --- Configuration Setup ---
config = configparser.ConfigParser()
config.read('/app/config.ini')

# Define Lakehouse Paths
DELTA_DIR = Path('/app/data/raw/proficio/incremental')
RAW_ISLANDORA = Path('/app/data/raw/islandora/islandora_lookup.parquet')

# Silver Table (All columns, Deduplicated)
MASTER_SILVER = Path('/app/data/silver/proficio_silver.parquet')

# Gold Table (Missing objects, 24 columns)
OUTPUT_PARQUET = Path('/app/data/gold/missing_objects.parquet')

OUTPUT_PARQUET.parent.mkdir(parents=True, exist_ok=True)
MASTER_SILVER.parent.mkdir(parents=True, exist_ok=True)

# --- Logging Setup ---
logger = logging.getLogger()
if logger.handlers:
    for handler in logger.handlers:
        logger.removeHandler(handler)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/app/data/transform.log'),
        logging.StreamHandler()
    ]
)
logging.info("🚀 Transformer initialized.")

# ==========================================
# DICTIONARIES & CONSTANTS
# ==========================================

relator_codes = {
    'abridger': 'abr', 'actor': 'act', 'adapter': 'adp', 'addressee': 'rcp', 'analyst': 'anl', 
    'animator': 'anm', 'annotator': 'ann', 'appellant': 'apl', 'appellee': 'ape', 'applicant': 'app', 
    'architect': 'arc', 'arranger': 'arr', 'art copyist': 'acp', 'art director': 'adi', 'artist': 'art', 
    'artistic director': 'ard', 'assignee': 'asg', 'associated name': 'asn', 'attributed name': 'att', 
    'auctioneer': 'auc', 'author': 'aut', 'author in quotations or text abstracts': 'aqt', 
    'author of afterword, colophon, etc.': 'aft', 'author of dialog': 'aud', 'author of introduction, etc.': 'aui', 
    'autographer': 'ato', 'bibliographic antecedent': 'ant', 'binder': 'bnd', 'binding designer': 'bdd', 
    'blurb writer': 'blw', 'book designer': 'bkd', 'book producer': 'bkp', 'bookjacket designer': 'bjd', 
    'bookplate designer': 'bpd', 'bookseller': 'bsl', 'braille embosser': 'brl', 'broadcaster': 'brd', 
    'calligrapher': 'cll', 'cartographer': 'ctg', 'caster': 'cas', 'censor': 'cns', 'choreographer': 'chr', 
    'cinematographer': 'cng', 'client': 'cli', 'collection registrar': 'cor', 'collector': 'col', 
    'collotyper': 'clt', 'colorist': 'clr', 'commentator': 'cmm', 'commentator for written text': 'cwt', 
    'compiler': 'com', 'complainant': 'cpl', 'complainant-appellant': 'cpt', 'complainant-appellee': 'cpe', 
    'composer': 'cmp', 'compositor': 'cmt', 'conceptor': 'ccp', 'conductor': 'cnd', 'conservator': 'con', 
    'consultant': 'csl', 'consultant to a project': 'csp', 'contestant': 'cos', 'contestant-appellant': 'cot', 
    'contestant-appellee': 'coe', 'contestee': 'cts', 'contestee-appellant': 'ctt', 'contestee-appellee': 'cte', 
    'contractor': 'ctr', 'contributor': 'ctb', 'copyright claimant': 'cpc', 'copyright holder': 'cph', 
    'corrector': 'crr', 'correspondent': 'crp', 'costume designer': 'cst', 'court governed': 'cou', 
    'court reporter': 'crt', 'cover designer': 'cov', 'creator': 'cre', 'curator': 'cur', 'dancer': 'dnc', 
    'data contributor': 'dtc', 'data manager': 'dtm', 'dedicatee': 'dte', 'dedicator': 'dto', 
    'defendant': 'dfd', 'defendant-appellant': 'dft', 'defendant-appellee': 'dfe', 'degree granting institution': 'dgg', 
    'degree supervisor': 'dgs', 'delineator': 'dln', 'depicted': 'dpc', 'depositor': 'dpt', 'designer': 'dsr', 
    'director': 'drt', 'dissertant': 'dis', 'distribution place': 'dbp', 'distributor': 'dst', 'donor': 'dnr', 
    'draftsman': 'drm', 'dubious author': 'dub', 'editor': 'edt', 'editor of compilation': 'edc', 
    'editor of moving image work': 'edm', 'electrician': 'elg', 'electrotyper': 'elt', 'enacting jurisdiction': 'enj', 
    'engineer': 'eng', 'engraver': 'egr', 'etcher': 'etr', 'event place': 'evp', 'expert': 'exp', 'facsimilist': 'fac', 
    'field director': 'fld', 'film director': 'fmd', 'film distributor': 'fds', 'film editor': 'flm', 
    'film producer': 'fmp', 'filmmaker': 'fmk', 'first party': 'fpy', 'forger': 'frg', 'former owner': 'fmo', 
    'funder': 'fnd', 'geographic information specialist': 'gis', 'graphic technician': 'grt', 'honoree': 'hnr', 
    'host': 'hst', 'host institution': 'his', 'illuminator': 'ilu', 'illustrator': 'ill', 'inscriber': 'ins', 
    'instrumentalist': 'itr', 'interviewee': 'ive', 'interviewer': 'ivr', 'inventor': 'inv', 'issuing body': 'isb', 
    'judge': 'jud', 'jurisdiction governed': 'jug', 'laboratory': 'lbr', 'laboratory director': 'ldr', 
    'landscape architect': 'lsa', 'lead': 'led', 'lender': 'len', 'libelant': 'lil', 'libelant-appellant': 'lit', 
    'libelant-appellee': 'lie', 'libelee': 'lel', 'libelee-appellant': 'let', 'libelee-appellee': 'lee', 
    'librettist': 'lbt', 'licensee': 'lse', 'licensor': 'lso', 'lighting designer': 'lgd', 'lithographer': 'ltg', 
    'lyricist': 'lyr', 'maker': 'mkr', 'manufacture place': 'mfp', 'manufacturer': 'mfr', 'marbler': 'mrb', 
    'markup editor': 'mrk', 'medium': 'med', 'metadata contact': 'mdc', 'metal-engraver': 'mte', 
    'minute taker': 'mtk', 'moderator': 'mod', 'monitor': 'mon', 'music copyist': 'mcp', 'musical director': 'msd', 
    'musician': 'mus', 'narrator': 'nrt', 'onscreen presenter': 'osp', 'opponent': 'opn', 'organizer': 'orm', 
    'originator': 'org', 'other': 'oth', 'owner': 'own', 'panelist': 'pan', 'papermaker': 'ppm', 
    'patent applicant': 'pta', 'patent holder': 'pth', 'patron': 'pat', 'performer': 'prf', 'permitting agency': 'pma', 
    'photographer': 'pht', 'plaintiff': 'ptf', 'plaintiff-appellant': 'ptt', 'plaintiff-appellee': 'pte', 
    'platemaker': 'plt', 'praeses': 'pra', 'presenter': 'pre', 'printer': 'prt', 'printer of plates': 'pop', 
    'printmaker': 'prm', 'process contact': 'prc', 'producer': 'pro', 'production company': 'prn', 
    'production designer': 'prs', 'production manager': 'pmn', 'production personnel': 'prd', 'production place': 'prp', 
    'programmer': 'prg', 'project director': 'pdr', 'proofreader': 'pfr', 'provider': 'prv', 'publication place': 'pup', 
    'publisher': 'pbl', 'publishing director': 'pbd', 'puppeteer': 'ppt', 'radio director': 'rdd', 'radio producer': 'rpc', 
    'recording engineer': 'rce', 'recordist': 'rcd', 'redaktor': 'red', 'renderer': 'ren', 'reporter': 'rpt', 'repository': 'rps', 
    'research team head': 'rth', 'research team member': 'rtm', 'researcher': 'res', 'respondent': 'rsp', 
    'respondent-appellant': 'rst', 'respondent-appellee': 'rse', 'responsible party': 'rpy', 'restager': 'rsg', 
    'restorationist': 'rsr', 'reviewer': 'rev', 'rubricator': 'rbr', 'scenarist': 'sce', 'scientific advisor': 'sda'
}

# ==========================================
# TRANSFORMATION FUNCTIONS
# ==========================================

def force_clean_extent(extent):
    if pd.isna(extent): return ""
    extent = str(extent).lower()
    measurements = extent.split('||')
    cleaned_measurements = []
    
    for m in measurements:
        if 'inches' in m:
            m = re.sub(r"dimensions,\s*overall", "", m, flags=re.IGNORECASE)
            parts = [str(part).strip() for part in m.split('__') if str(part).strip()]
            nums, text_labels = [], []
            
            for p in parts:
                p_clean = re.sub(r"inches\s*", "", p, flags=re.IGNORECASE).strip()
                if not p_clean: continue
                
                if re.match(r'^[\d\s./-]+$', p_clean): 
                    nums.append(p_clean)
                else: 
                    text_labels.append(p_clean.capitalize())
                    
            if nums:
                dim_string = "Inches " + " x ".join(nums)
                if text_labels: dim_string += " " + ", ".join(text_labels)
                cleaned_measurements.append(dim_string)
                
    return " | ".join(cleaned_measurements)

def clean_edtf_date(date_str):
    if pd.isna(date_str) or 'UNKNOWN' in str(date_str).upper():
        return ''
    
    parts = [str(p).strip() for p in str(date_str).split('__')]
    meaningful_parts = [p for p in parts if p]
    
    if not meaningful_parts:
        return ''
        
    is_circa = False
    if 'circa' in [p.lower() for p in meaningful_parts]:
        is_circa = True
        meaningful_parts = [p for p in meaningful_parts if p.lower() != 'circa']
        
    final_date = '/'.join(meaningful_parts)
    
    if is_circa and final_date:
        final_date += '~' 
        
    return final_date
    
def determine_agent_type(agent_str):
    if not agent_str or pd.isna(agent_str): return ""
    agents = str(agent_str).split("||")
    processed_agents = []
    for agent in agents:
        parts = agent.split("__")
        agent_name = parts[0].strip() if len(parts) > 0 else ""
        agent_type = parts[1].strip() if len(parts) > 1 else "other"
        abbr = "oth"
        for role, code in relator_codes.items():
            if role in agent_type.lower().replace(".", ""):
                abbr = code
                break
        if agent_name: processed_agents.append(f"relators:{abbr}:person:{agent_name}")
    return "|".join(processed_agents)

def clean_credit_line(value):
    if isinstance(value, str):
        value = unicodedata.normalize('NFKC', value)
        value = value.replace('–', '-')
    return value

def run_qa_checks(row):
    errors = []
    for field, name in [('title', 'Title'), ('field_identifier', 'Identifier')]:
        if pd.isna(row.get(field)) or str(row.get(field, '')).strip() == '':
            errors.append(f"{name} is missing")
    has_genre = pd.notna(row.get('field_genre')) and str(row.get('field_genre', '')).strip() != ''
    has_date = pd.notna(row.get('field_edtf_date_created')) and str(row.get('field_edtf_date_created', '')).strip() != ''
    has_creator = pd.notna(row.get('field_linked_agent')) and str(row.get('field_linked_agent', '')).strip() != ''
    has_country = pd.notna(row.get('field_place_published')) and str(row.get('field_place_published', '')).strip() != ''
    if not (has_genre and (has_date or has_creator or has_country)):
        errors.append("Required fields missing (Genre and one of Date/Creator/Country)")
    if "_" in str(row.get('field_linked_agent', '')):
        errors.append("Underscores found in processed linked agent field")
    return errors

def normalize_identifier(s):
    if pd.isna(s):
        return None
    s = str(s)
    s = unicodedata.normalize('NFKC', s).lower()
    s = re.sub(r"[()\[\]'_]", ' ', s)
    s = re.sub(r'[.\s,-]+', '.', s)
    s = s.strip('.')
    return s

# ==========================================
# MAIN PIPELINE EXECUTION
# ==========================================

def main():
    logging.info("--- 🔄 1. PROCESS PROFICIO DELTAS (SILVER LAYER) ---")
    
    delta_files = list(DELTA_DIR.glob('*.parquet'))
    RAW_DUMP = Path('/app/data/raw/proficio/objects_raw_dump.parquet')
    
    # If there is no Silver Master, treat the entire historical raw dump as a new "delta"
    # so that all 14,000+ records are properly transformed.
    if not MASTER_SILVER.exists() and RAW_DUMP.exists():
        logging.info("No Silver Master exists. Adding historical raw dump to deltas to rebuild from scratch.")
        delta_files.append(RAW_DUMP)
        
    df_deltas = pd.DataFrame()
    
    if delta_files:
        logging.info(f"Found {len(delta_files)} new incremental Delta files.")
        df_deltas = pd.concat([pd.read_parquet(f) for f in delta_files], ignore_index=True)
        
        # --- RENAME RAW PROFICIO COLUMNS TO WORKBENCH STANDARDS ---
        rename_map = {
            'cat_nbr': 'field_identifier',
            'cat_nam': 'title',
            'artist': 'field_linked_agent',
            'name': 'field_genre',
            'categ_16': 'original_date',
            'maker': 'field_place_published',
            'categ_9': 'field_subject',
            'obj_mem': 'field_description_long',
            'categ_4': 'field_credit_line',
            'class': 'field_physical_form',
            'weight': 'field_extent',
            'sortable4': 'location',
            'categ_8': 'storage_location'
        }
        df_deltas = df_deltas.rename(columns=rename_map)
        
        if 'field_genre' in df_deltas.columns:
            df_deltas['field_genre'] = df_deltas['field_genre'].astype(str).str.upper()
        
        # Apply Transforms ONLY to the new delta rows
        df_deltas['field_resource_type'] = 'Collection'
        df_deltas['field_model'] = 'Paged Content'
        df_deltas['parent_id'] = ''
        df_deltas['field_weight'] = ''
        df_deltas['field_member_of'] = '613' 
        df_deltas['file'] = ''
        df_deltas['media_use_tid'] = ''
        df_deltas['field_display_hints'] = ''
        df_deltas['url_alias'] = ''
        df_deltas['field_collection_type'] = 'Objects'

        if 'title' in df_deltas.columns:
            df_deltas['title'] = df_deltas['title'].apply(lambda x: x.split(' __ __ __')[0] if isinstance(x, str) else x).str[:255]
        if 'field_place_published' in df_deltas.columns:
            df_deltas['field_place_published'] = df_deltas['field_place_published'].astype(str).str.replace('__', '|')
        if 'field_subject' in df_deltas.columns:
            df_deltas['field_subject'] = df_deltas['field_subject'].apply(lambda x: 'subject:' + x.replace('--', '|subject:') if pd.notna(x) and x.strip() != '' else '')
        if 'field_credit_line' in df_deltas.columns:
            df_deltas['field_credit_line'] = df_deltas['field_credit_line'].astype(str).str.replace('_', '', regex=False).replace('nan', 'The Wolfsonian-Florida International University, Miami Beach, Florida, The Mitchell Wolfson, Jr. Collection')
            df_deltas['field_credit_line'] = df_deltas['field_credit_line'].apply(clean_credit_line)
        if 'field_physical_form' in df_deltas.columns:
            df_deltas['field_physical_form'] = df_deltas['field_physical_form'].astype(str).str.replace('||', '|', regex=False)
        if 'field_linked_agent' in df_deltas.columns:
            df_deltas['field_linked_agent'] = df_deltas['field_linked_agent'].apply(determine_agent_type)
        if 'field_extent' in df_deltas.columns:
            df_deltas['field_extent'] = df_deltas['field_extent'].apply(force_clean_extent)
        if 'original_date' in df_deltas.columns:
            df_deltas['field_edtf_date_created'] = df_deltas['original_date'].apply(clean_edtf_date)
        else:
            df_deltas['field_edtf_date_created'] = ''
            
    if MASTER_SILVER.exists():
        df_master = pd.read_parquet(MASTER_SILVER)
        logging.info(f"Loaded existing Silver Master with {len(df_master)} records.")
        if not df_deltas.empty:
            df_master = df_master.dropna(axis=1, how='all')
            df_deltas_clean = df_deltas.dropna(axis=1, how='all')
            df_combined = pd.concat([df_master, df_deltas_clean], ignore_index=True)
            # Deduplicate keeping the latest version.
            # Use field_identifier (renamed from cat_nbr) as the true Proficio primary key.
            # access_nbr is NULL for most records and causes massive data loss with drop_duplicates.
            if 'record_id' in df_combined.columns:
                if 'field_identifier' in df_combined.columns:
                    df_combined['field_identifier'] = df_combined['field_identifier'].apply(normalize_identifier)
                df_master = df_combined.drop_duplicates(subset=['record_id'], keep='last')
            elif 'field_identifier' in df_combined.columns:
                df_combined['field_identifier'] = df_combined['field_identifier'].apply(normalize_identifier)
                df_master = df_combined.drop_duplicates(subset=['field_identifier'], keep='last')
            elif 'access_nbr' in df_combined.columns:
                logging.warning("field_identifier not found. Falling back to access_nbr for dedup.")
                df_master = df_combined.drop_duplicates(subset=['access_nbr'], keep='last')
            else:
                df_master = df_combined
            logging.info(f"Merged deltas. New Silver Master has {len(df_master)} records.")
    else:
        logging.info("No Silver Master exists. Creating new from Deltas.")
        df_master = df_deltas
        # Still deduplicate even on first build — multiple delta files (raw dump + fresh pull) can overlap
        if 'record_id' in df_master.columns:
            if 'field_identifier' in df_master.columns:
                df_master['field_identifier'] = df_master['field_identifier'].apply(normalize_identifier)
            df_master = df_master.drop_duplicates(subset=['record_id'], keep='last')
            logging.info(f"Deduplication on fresh build: {len(df_master)} unique records.")
        elif 'field_identifier' in df_master.columns:
            df_master['field_identifier'] = df_master['field_identifier'].apply(normalize_identifier)
            df_master = df_master.drop_duplicates(subset=['field_identifier'], keep='last')
            logging.info(f"Deduplication on fresh build: {len(df_master)} unique records.")

    if df_master.empty:
        logging.warning("No data in Silver Master or Deltas. Exiting.")
        return

    # Clean string columns and drop completely empty ones (prevents DuckDB 'UNKNOWN' type crashes)
    str_cols = df_master.select_dtypes(include=['object', 'string']).columns
    for col in str_cols:
        df_master.loc[:, col] = df_master[col].astype(str).str.strip().replace('', pd.NA).replace('nan', pd.NA).replace('None', pd.NA)
        
    df_master = df_master.dropna(axis=1, how='all')
    
    # Save the Master Silver table
    df_master.to_parquet(MASTER_SILVER, index=False)
    
    # Write metrics
    metrics_path = '/app/data/metrics.json'
    metrics = {}
    if Path(metrics_path).exists():
        try:
            with open(metrics_path, 'r') as f:
                metrics = json.load(f)
        except: pass
    metrics['proficio_silver_total'] = len(df_master)
    metrics['proficio_deltas_processed'] = len(df_deltas)
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f)

    # Cleanup processed deltas (do NOT delete the baseline raw dump)
    for f in delta_files:
        if f.name == 'objects_raw_dump.parquet':
            continue
        try:
            f.unlink()
        except: pass



    logging.info("--- ✅ Pipeline Finished ---")


if __name__ == "__main__":
    main()
