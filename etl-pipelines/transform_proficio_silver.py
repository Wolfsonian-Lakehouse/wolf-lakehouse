# ==========================================
# ==========================================
# IMPORTS & SETUP
# ==========================================
import pandas as pd
import re
import unicodedata
import logging
import configparser
from pathlib import Path

# --- Configuration Setup ---
config = configparser.ConfigParser()
config.read('/app/config.ini')

# Define Lakehouse Paths
RAW_PROFICIO = Path('/app/data/raw/proficio/objects_raw_dump.parquet')
RAW_ISLANDORA = Path('/app/data/raw/islandora/islandora_lookup.parquet')
OUTPUT_PARQUET = Path('/app/data/gold/missing_objects.parquet')

OUTPUT_PARQUET.parent.mkdir(parents=True, exist_ok=True)

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
        agent_name = parts.strip()
        agent_type = parts.strip() if len(parts) > 1 else "other"
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
        if pd.isna(row[field]) or str(row[field]).strip() == '':
            errors.append(f"{name} is missing")
    has_genre = pd.notna(row['field_genre']) and str(row['field_genre']).strip() != ''
    has_date = pd.notna(row['field_edtf_date_created']) and str(row['field_edtf_date_created']).strip() != ''
    has_creator = pd.notna(row['field_linked_agent']) and str(row['field_linked_agent']).strip() != ''
    has_country = pd.notna(row['field_place_published']) and str(row['field_place_published']).strip() != ''
    if not (has_genre and (has_date or has_creator or has_country)):
        errors.append("Required fields missing (Genre and one of Date/Creator/Country)")
    if "_" in str(row['field_linked_agent']):
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

if __name__ == "__main__":
    logging.info("--- 📥 1. LOAD RAW DATA ---")
    try:
        # Load the data extracted by your other scripts
        logging.info(f"Reading Proficio raw data from {RAW_PROFICIO}")
        df = pd.read_parquet(RAW_PROFICIO)
        
        logging.info(f"Reading Islandora raw data from {RAW_ISLANDORA}")
        df_islandora = pd.read_parquet(RAW_ISLANDORA)
        
        # Depending on how the Islandora script saves it, ensure the column name aligns
        if 'accn' in df_islandora.columns:
            df_islandora = df_islandora.rename(columns={'accn': 'field_identifier'})
            
        initial_count = len(df_islandora)
        df_islandora = df_islandora.drop_duplicates(subset=['field_identifier'])
        logging.info(f"✂️ Deduplication: Reduced Islandora Data from {initial_count} to {len(df_islandora)} unique identifiers.")
        
    except Exception as e:
        logging.error(f"Failed to load raw parquet files. Ensure extraction scripts have run first. Error: {e}")
        raise

    logging.info("--- 🛠️ 2. TRANSFORM DATA ---")
    
    # 2a. Add Static Columns
    df['field_resource_type'] = 'Collection'
    df['field_model'] = 'Paged Content'
    df['parent_id'] = ''
    df['field_weight'] = ''
    df['field_member_of'] = '613' # Objects Collection
    df['file'] = ''
    df['media_use_tid'] = ''
    df['field_display_hints'] = ''
    df['url_alias'] = ''
    df['field_collection_type'] = 'Objects'
    logging.info("Added static Workbench columns.")

    # 2b. Apply Cleaning Logic
    df['title'] = df['title'].apply(lambda x: x.split(' __ __ __') if isinstance(x, str) else x).str[:255]
    df['field_place_published'] = df['field_place_published'].astype(str).str.replace('__', '|')
    df['field_subject'] = df['field_subject'].apply(lambda x: 'subject:' + x.replace('--', '|subject:') if pd.notna(x) and x.strip() != '' else '')
    
    df['field_credit_line'] = df['field_credit_line'].astype(str).str.replace('_', '', regex=False).fillna('The Wolfsonian-Florida International University, Miami Beach, Florida, The Mitchell Wolfson, Jr. Collection')
    df['field_credit_line'] = df['field_credit_line'].apply(clean_credit_line)
    
    df['field_physical_form'] = df['field_physical_form'].astype(str).str.replace('||', '|', regex=False)
    
    df['field_linked_agent'] = df['field_linked_agent'].apply(determine_agent_type)
    df['field_extent'] = df['field_extent'].apply(force_clean_extent)
    
    # Check if original_date exists to prevent key errors
    if 'original_date' in df.columns:
        df['field_edtf_date_created'] = df['original_date'].apply(clean_edtf_date)
    else:
        df['field_edtf_date_created'] = ''
        
    logging.info("Transformation complete.")

    logging.info("--- 🔍 3. RUN QA CHECKS ---")
    df['qa_errors'] = df.apply(run_qa_checks, axis=1)
    df['qa_pass'] = df['qa_errors'].apply(lambda x: len(x) == 0)
    df_pass = df[df['qa_pass']].copy()
    df_fail = df[~df['qa_pass']].copy()
    logging.info(f"QA Results: {len(df_pass)} rows passed, {len(df_fail)} rows failed.")

    logging.info("--- 🔄 4. FIND MISSING RECORDS ---")
    identifier_column = 'field_identifier'

    logging.info("Applying robust normalization to identifier columns for comparison...")
    df_pass['norm_id'] = df_pass[identifier_column].apply(normalize_identifier)
    df_islandora['norm_id'] = df_islandora[identifier_column].apply(normalize_identifier)

    df_islandora_norm_keys = df_islandora[['norm_id']].dropna().drop_duplicates()

    logging.info("Merging on normalized keys...")
    merged_df = pd.merge(
        df_pass,
        df_islandora_norm_keys,
        on='norm_id',
        how='left',
        indicator=True
    )

    df_results = merged_df[merged_df['_merge'] == 'left_only'].drop(columns=['_merge', 'norm_id'])
    logging.info(f"Found {len(df_results)} records in Proficio that are missing from Islandora.")

    logging.info("--- 💾 5. SAVE RESULTS ---")
    if not df_results.empty:
        df_results.loc[:, 'id'] = range(1, len(df_results) + 1)
        final_columns = [
            'id', 'field_resource_type', 'field_model', 'parent_id', 'field_weight',
            'field_member_of', 'file', 'media_use_tid', 'field_display_hints',
            'field_identifier', 'url_alias', 'title', 'field_linked_agent',
            'field_genre', 'field_edtf_date_created', 'field_place_published',
            'field_subject', 'field_description_long', 'field_credit_line',
            'field_physical_form', 'field_extent', 'field_collection_type',
            'qa_pass', 'qa_errors'
        ]
        final_columns_exist = [col for col in final_columns if col in df_results.columns]
        
        # Save Parquet for the Gold layer
        df_results[final_columns_exist].astype(str).to_parquet(OUTPUT_PARQUET, index=False)
        logging.info(f"Saved Parquet results to {OUTPUT_PARQUET}")
        
    else:
        logging.info("No missing records to save.")

    logging.info("--- ✅ Pipeline Finished ---")
