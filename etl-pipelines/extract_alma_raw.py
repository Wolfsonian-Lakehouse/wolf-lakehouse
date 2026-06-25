import logging
import pandas as pd
import pymarc
from pathlib import Path
import sys

# --- 1. Setup Paths ---
raw_alma_dir = Path("/app/data/raw/alma") 
output_parquet = raw_alma_dir / "alma_raw_dump.parquet"

def get_latest_marc_file(directory):
    """Dynamically finds the BIBLIOGRAPHIC .mrc file."""
    found_mrc_files = list(directory.glob("BIBLIOGRAPHIC*.mrc"))
    
    if not found_mrc_files:
        logging.info(f" ❌ Error: No BIBLIOGRAPHIC*.mrc files found in {directory}")
        raise RuntimeError("Task Failed. Check logs for details.")
        
    target_file = sorted(found_mrc_files) [-1]
    logging.info(f" 🎯 Dynamically loaded MARC file: {target_file.name}")
    return target_file

def extract_raw_marc(record):
    """Extracts raw MARC data without applying transformations."""
    data = {}

    def get_s_field(field_obj, code): 
        if field_obj and code in field_obj:
            return field_obj[code]
        return ''

    # --- New Diagnostic Fields Extraction (000-008) ---
    field_000 = record.get('000')
    data['new_000_ctrl'] = field_000.value() if field_000 else ''
    
    field_005 = record.get('005')
    data['new_005_ctrl'] = field_005.value() if field_005 else ''
    
    field_006 = record.get('006')
    data['new_006_ctrl'] = field_006.value() if field_006 else '' 
    
    field_007 = record.get('007')
    data['new_007_ctrl'] = field_007.value() if field_007 else ''
    
    field_008 = record.get('008')
    data['new_008_ctrl'] = field_008.value() if field_008 else ''

    # --- YOUR MASTER FIELD LIST ---
    fields_to_extract = [
        ('010', ['z', 'a'], 'full'),
        ('012', ['m', 'a', 'i', 'l', 'j', 'b', 'k'], 'full'),
        ('015', ['2', 'a'], 'full'),
        ('016', ['z', '2', 'a'], 'full'),
        ('017', ['a', 'b'], 'full'),
        ('019', ['b', 'a'], 'full'), 
        ('020', ['z', 'a', 'd', 'q', 'c', 'b'], 'full'),
        ('022', ['z', 'a', 'y', 'l', '2'], 'full'),
        ('024', ['z', 'a', 'd', '2', 'q', 'c'], 'full'),
        ('025', ['a'], 'full'),
        ('027', ['a'], 'full'),
        ('028', ['b', 'q', 'a'], 'full'),
        ('029', ['b', 'a'], 'full'),
        ('030', ['a'], 'full'),
        ('032', ['b', 'a'], 'full'),
        ('033', ['b', 'a'], 'full'),
        ('034', ['a'], 'full'),
        ('035', ['b', 'z', '5', 'a'], 'full'),
        ('037', ['f', 'n', 'a', 'c', 'b'], 'full'),
        ('039', ['a', 'd', 'e', 'c', 'b'], 'full'),
        ('040', ['a', 'd', 'e', 'c', 'b'], 'full'),
        ('041', ['h', 'a', '2', 'g', 'b', 'f'], 'full'),
        ('042', ['a'], 'full'),
        ('043', ['z', 'u', 'n', 'a'], 'full'),
        ('044', ['c', 'a'], 'full'),
        ('045', ['b', 'a'], 'full'),
        ('046', ['o', '2', 'p'], 'full'),
        ('047', ['a'], 'full'),
        ('048', ['b', 'a'], 'full'),
        ('049', ['l', 'b', 'a'], 'full'),
        ('050', ['i', 'z', 'a', 'd', '.', 'u', 'c', 'b'], 'full'), 
        ('051', ['b', 'c', 'a'], 'full'),
        ('052', ['a', 'b'], 'full'),
        ('055', ['b', 'a'], 'full'),
        ('060', ['b', 'a'], 'full'),
        ('066', ['c'], 'full'),
        ('070', ['b', 'a'], 'full'),
        ('072', ['2', 'x', 'a'], 'full'),
        ('074', ['a'], 'full'),
        ('080', ['b', '0', '2', 'a'], 'full'),
        ('082', ['a', '8', 'd', '2', 'q', 'b'], 'full'),
        ('083', ['a'], 'full'),
        ('084', ['b', '2', 'q', 'a'], 'full'),
        ('085', ['a'], 'full'),
        ('086', ['z', '2', 'a'], 'full'),
        ('088', ['a'], 'full'),
        ('090', ['n', 'a', 'i', '9', '5', 'h', 'd', 'c', 'b'], 'full'),
        ('092', ['f', 'a', 'T', '2', 'b'], 'full'), 
        ('096', ['b', 'a'], 'full'),
        ('098', ['a'], 'full'),
        ('099', ['b', '5', 'a'], 'full'),
        ('100', ['s', 'e', '6', 'a', 'w', 'd', 'j', '1', 'q', 't', 'v', 'k', 'c', 'b', '0', 'l', '4', '9'], 'full'), 
        ('110', ['e', 'd', '1', 'w', 'g', 'a', 'b', 'q', 't', 'c', 'k', 'n', 'l', '4', '9'], 'full'), 
        ('111', ['n', 'a', 'd', 'e', 'q', 'c', 'b'], 'full'), 
        ('130', ['f', 'a', 'd', 'l', 'p', 's', '6', '0', 'k'], 'full'),
        ('210', ['b', 'a'], 'full'),
        ('220', ['l', 'b', 'c', 'a'], 'full'), 
        ('222', ['b', 'a'], 'full'),
        ('240', ['s', 'e', '6', 'f', 'a', 'b', 'p', 'i', 'y', 'c', 'k', 'n', 'l', 'o'], 'full'),
        ('242', ['h', 'n', 'a', 'y', 'l', 'p', 'e', 'c', 'b'], 'full'), 
        ('245', ['s', 'f', '6', '2', 'a', 'd', '1', 'p', '3', 't', 'k', 'c', 'b', 'n', 'y', '7', '8', '9', 'h', 'x'], 'full'), 
        ('246', ['f', 'n', 'a', 'y', 'i', 'l', 'p', 'g', '6', 'c', 'b'], 'full'),
        ('247', ['f', 'a', 'h', 'g', 'b'], 'full'),
        ('249', ['a'], 'full'),
        ('250', ['b', 'a'], 'full'),
        ('255', ['c', 'a'], 'full'),
        ('260', ['s', 'e', '6', 'd', 'f', '1', 'g', 'a', 'u', 'p', '3', 'x', 'c', 'b', '5', 'z'], 'full'), 
        ('263', ['a'], 'full'),
        ('264', ['f', 'a', '3', 'e', '6', 'c', 'b'], 'full'),
        ('300', ['e', '6', '2', 'a', 'd', '1', '3', 'v', 'x', 'c', 'b', ' ', '7', '8', 'f', '4', 'i'], 'full'), 
        ('306', ['a'], 'full'),
        ('310', ['b', 'a'], 'full'),
        ('321', ['b', '5', 'a'], 'full'),
        ('334', ['2', 'a'], 'full'), 
        ('336', ['3', 'b', '2', 'a'], 'full'),
        ('337', ['3', 'b', '2', 'a'], 'full'),
        ('338', ['3', 'b', '2', 'a'], 'full'),
        ('340', ['m', 'a', 'd', '2', 'p', 'g', 'c', 'e'], 'full'),
        ('347', ['2', 'a'], 'full'),
        ('348', ['d', '2', 'c', 'a'], 'full'),
        ('350', ['a'], 'full'),
        ('351', ['b', 'c', 'a'], 'full'),
        ('353', ['b', 'a'], 'full'), 
        ('362', ['z', '5', 'a'], 'full'),
        ('370', ['2', 'g'], 'full'),
        ('380', ['2', 'a'], 'full'),
        ('382', ['n', 'a', '2', 's', 'b'], 'full'),
        ('385', ['2', 'a'], 'full'),
        ('386', ['m', 'n', 'a', 'i', '2'], 'full'),
        ('398', ['a'], 'full'), 
        ('410', ['t', 'a', '5', 'v', 'b'], 'full'),
        ('440', ['6', '2', 'a', '1', 'p', '3', 'v', 'x', 'n', '7', '4', '5'], 'full'),
        ('490', ['n', 't', 'a', 'x', '5', 'v', 's', 'p', 'b'], 'full'),
        ('500', ['e', '6', '2', 'a', 'd', '1', '3', 't', 'c', 'b', '7', '8', '4', '9', '5', 'z'], 'full'), 
        ('501', ['5', 'a'], 'full'),
        ('502', ['8', 'a'], 'full'),
        ('503', ['h', 'a', '1', 's'], 'full'),
        ('504', ['8', '5', 'a'], 'full'),
        ('505', ['t', 'a', 'd', '5', 'u', 'r', 'g', '3', 'c'], 'full'),
        ('506', ['f', 'a', '3', '2', 'c', '5'], 'full'),
        ('508', ['a'], 'full'),
        ('510', ['x', 'c', 'a'], 'full'),
        ('511', ['a'], 'full'),
        ('515', ['5', 'a'], 'full'),
        ('518', ['o', 'd', 'p', 'a'], 'full'),
        ('520', ['a', '1', '5', 'u', 'c', 'b'], 'full'),
        ('521', ['b', 'a'], 'full'),
        ('525', ['a'], 'full'),
        ('526', ['z', 'a', 'd', 'c', 'b'], 'full'),
        ('530', ['u', '5', 'a'], 'full'),
        ('533', ['f', 'n', 'a', 'd', '5', 'e', 'c', 'b'], 'full'),
        ('534', ['f', 'n', 'a', 'z', '5', 'p', 't', 'c', 'b'], 'full'),
        ('536', ['a'], 'full'),
        ('538', ['u', '5', 'a'], 'full'),
        ('540', ['u', 'c', '5', 'a'], 'full'),
        ('541', ['a', 'd', '5', 'e', 'c'], 'full'),
        ('542', ['a'], 'full'),
        ('544', ['a'], 'full'),
        ('545', ['a'], 'full'),
        ('546', ['a', 'd', 'e', 'c', 'b'], 'full'), 
        ('547', ['a'], 'full'),
        ('550', ['a'], 'full'),
        ('555', ['a'], 'full'),
        ('561', ['5', 'a'], 'full'), 
        ('563', ['a', '5'], 'full'),
        ('580', ['a'], 'full'),
        ('581', ['a'], 'full'),
        ('585', ['e', 'y', 'd', 'x', '5', 'a'], 'full'),
        ('586', ['a'], 'full'),
        ('588', ['6', 'a'], 'full'),
        ('590', ['5', '9', 'a'], 'full'),
        ('591', ['9', 'a'], 'full'),
        ('593', ['9', 'a'], 'full'),
        ('596', ['c', '9', 'a'], 'full'),
        ('597', ['9', 'a'], 'full'),
        ('598', ['9', 'a'], 'full'),
        ('599', ['5', 'b', '9', 'a'], 'full'),
        ('600', ['g', 'e', '6', 'f', 'a', 'w', 'd', 'k', 'l', 'p', 'q', 't', 'v', 'y', 'c', 'b', 'n', '0', '9', 'z', '2', '1', '5', 'x'], 'full'),
        ('610', ['g', 'e', '2', 'a', 'w', 'd', '1', 't', 'v', 'x', 'c', 'b', 'n', '0', 'y', 'z'], 'full'), 
        ('611', ['e', '2', 'a', 'd', 'u', 'q', 'v', 'y', 'c', 'b', 'n', '0', 'z', 'f', '1', 'x'], 'full'),
        ('630', ['2', 'a', 'd', 'l', 'p', 'k', 't', 'v', 'x', 'f', 'g', '0', 'y'], 'full'),
        ('647', ['a', '1', 'd', '2', 'c', '0'], 'full'),
        ('648', ['2', '0', 'a'], 'full'),
        ('650', ['g', 'e', '6', '2', 'a', 'd', '9', 'l', 'o', '3', 'v', 'i', 'x', 'c', 'b', 'E', '0', 'y', 'f', '1', 'z'], 'full'), 
        ('651', ['e', 'd', '2', 'a', 'g', '1', 't', 'v', 'x', 'b', '0', 'y', 'z'], 'full'),
        ('653', ['v', 'z', 'a', 'x'], 'full'),
        ('654', ['b', '2', 'c', 'a'], 'full'),
        ('655', ['6', '2', 'a', '3', 'v', 'x', 'c', 'b', '0', 'y', '5', 'z'], 'full'), 
        ('670', ['b', 'a'], 'full'),
        ('690', ['e', '2', 'a', 'w', 'd', '3', 't', 'v', 'x', 'c', 'b', 'n', 'y', 'q', '9', 'z'], 'full'),
        ('691', ['z', 'a', '9', 'y', 'x', '5', 'v'], 'full'),
        ('696', ['t', 'a', 'd', '5', 'g'], 'full'),
        ('697', ['a', 'x'], 'full'),
        ('698', ['d', 'c', 'a'], 'full'),
        ('699', ['5', 'a'], 'full'),
        ('700', ['m', 'b', 'w', 'n', 'e', 'j', 'f', 'o', 's', 't', 'r', '1', 'c', 'x', 'l', 'v', '4', 'a', '6', 'd', 'k', '5', '0', 'q', 'p', 'i'], 'full'), 
        ('710', ['g', 'e', '6', 'u', 'f', '1', 'w', 'd', 'a', 'b', 'q', 't', 'x', 'c', 'k', 'n', '0', 'y', 'l', '4', '9', '5'], 'full'), 
        ('711', ['n', 'a', 'y', 'z', 'd', 'x', 'e', 'q', 'c', 'b'], 'full'),
        ('720', ['a'], 'full'),
        ('730', ['n', 't', 'a', 'x', 'p', 'h', '0', 'l'], 'full'),
        ('740', ['h', 'p', 'n', 'a'], 'full'),
        ('751', ['2', '0', '4', 'a'], 'full'),
        ('752', ['a', '4', 'd', 'e', '2', 'c', 'b'], 'full'),
        ('758', ['i', '1', '4', 'a'], 'full'),
        ('765', ['i', 't', 'a', 'z', 'd', 'w', 'b'], 'full'),
        ('770', ['t', 'a', 'i', 'x', 'w', 'g'], 'full'),
        ('772', ['t', 'a', 'i', 'x', 'w', 'd', '6'], 'full'),
        ('773', ['n', 't', 'a', 'd', 'x', 'w', 'g', 'o', 'b', '7'], 'full'),
        ('774', ['t'], 'full'),
        ('775', ['f', 't', 'a', 'z', 'i', 'x', 'w', 'e', 'q', 'g', 'd'], 'full'),
        ('776', ['s', '6', 'z', 'a', 'w', 'd', 'i', 't', 'x', 'c', 'b', 'n', '9', 'h'], 'full'),
        ('777', ['w', 'a'], 'full'),
        ('780', ['t', 'a', 'x', 'w', 'g', '5'], 'full'),
        ('785', ['t', 'a', 'd', 'x', 'w', 's', 'g', '6', '5'], 'full'),
        ('787', ['n', 't', 'a', 'z', 'i', 'x', 'w', 'd', 'g'], 'full'),
        ('796', ['d', 'q', 'a'], 'full'),
        ('797', ['a', 'x'], 'full'),
        ('798', ['d', 'c', 'a'], 'full'),
        ('800', ['t', 'a', 'd', 'v', 'q'], 'full'),
        ('810', ['t', 'a', 'e', 'd', 'v', 'b'], 'full'),
        ('830', ['f', 'n', 'a', 'd', 'x', 'w', 'v', 'p', 't', 'l'], 'full'),
        ('850', ['a'], 'full'),
        ('852', ['a'], 'full'),
        ('856', ['h', 'z', 'a', 'd', 'u', 'q', 'v', 'x', 'f', 'y', '3', 'm', '5', 'i'], 'full'),
        ('866', ['8', 'a'], 'full'), 
        ('880', ['e', '6', '2', '1', 'w', 'd', 'a', 'l', 'q', 't', 'v', 'x', 'c', 'b', '0', 'f', '4', 'i'], 'full'),
        ('886', ['h', 't', 'a', 'd', 'x', 'p', '2', 'b', 'f'], 'full'),
        ('890', ['i', 'a'], 'full'),
        ('901', ['9', 'a'], 'full'),
        ('902', ['9', 'a'], 'full'),
        ('906', ['a'], 'full'),
        ('925', ['9', 'a'], 'full'),
        ('926', ['5', 'b', '9', 'a'], 'full'),
        ('929', ['a'], 'full'),
        ('931', ['a', 'd', '9', '3', 'e', 'q'], 'full'),
        ('932', ['a', 'd', '9', '5', 'e', 'c', 'b'], 'full'),
        ('936', ['a'], 'full'),
        ('937', ['c', 'e', 'a'], 'full'),
        ('938', ['i', 'n', 'a', 'd', 's', 'c', 'b'], 'full'),
        ('948', ['h'], 'full'),
        ('950', ['9', 'a'], 'full'),
        ('952', ['9', 'a'], 'full'), 
        ('954', ['9', 'a'], 'full'),
        ('955', ['9', 'a'], 'full'),
        ('958', ['9', 'a'], 'full'),
        ('959', ['9', '5', 'a'], 'full'),
        ('965', ['s', '2', 'a', 'd', '3', '1', 'i', 'v', 'x', 'c', 'b', 'y', '7', '9', 'z'], 'full'), 
        ('970', ['f', 't', 'e', 'd', '9', '5', 'p', 'c', 'l'], 'full'),
        ('980', ['a', '8', '9', '5', 'g', '6'], 'full'),
        ('981', ['b', 'e', '5', '9'], 'full'),
        ('991', ['9', 'a'], 'full'),
        ('994', ['b', 'a'], 'full'),
        ('996', ['f', 'a', 'd', '9', 'e', 'j', 'g', 'i', 'c', 'b', 'k'], 'full'),
        ('997', ['9', 'a'], 'full'),
        ('998', ['9', 'a'], 'full'),
        ('999', ['a', 'd', '9', 'e', 'c', 'b'], 'full'),
        ('SID', ['b', 'a'], 'full') 
    ]

    # --- DYNAMIC EXTRACTION LOOP ---
    for tag, subfields, field_type in fields_to_extract:
        field_objs = record.get_fields(tag)
        
        if field_objs:
            if field_type == 'full' or field_type == 'ctrl': 
                key_name_full = f"new_{tag}_full" if field_type == 'full' else f"new_{tag}_ctrl"
                data[key_name_full] = ' | '.join([f.value() for f in field_objs if f.value()])

            if subfields: 
                for sf_code in subfields:
                    key_name_sf = f"new_{tag}_{sf_code.replace('.', 'dot')}" 
                    sf_values = []
                    for f in field_objs:
                        val = get_s_field(f, sf_code)
                        if val:
                            sf_values.append(val)
                    data[key_name_sf] = ' | '.join(sf_values) if sf_values else ''
        else: 
            if field_type == 'full' or field_type == 'ctrl':
                key_name_full = f"new_{tag}_full" if field_type == 'full' else f"new_{tag}_ctrl"
                data[key_name_full] = ''
            if subfields:
                for sf_code in subfields:
                    key_name_sf = f"new_{tag}_{sf_code.replace('.', 'dot')}"
                    data[key_name_sf] = ''

    # --- COMPLEX REPEATABLE FIELDS PRE-JOINED ---
    # Field Subject (650 $a -- 650 $x)
    subject_concat_parts = []
    for field_650 in record.get_fields('650'):
        current_parts = []
        if 'a' in field_650: current_parts.append(field_650['a'])
        if 'x' in field_650: current_parts.append(field_650['x'])
        if current_parts:
             subject_concat_parts.append(' -- '.join(current_parts))
    data['raw_field_subject'] = ' | '.join(subject_concat_parts)

    # Field Note (700 subfields)
    note_parts = []
    for field_700 in record.get_fields('700'):
        subfields_for_note = ['n', 'x', 'p', 't', '4', 'k', '5', 'e', 'r', 'c', 'l', 'v', 'o', 'i', 'm', 'j', '6', 'b', '0', 'w', '1', 'd', 's', '3', 'f', 'q']
        for sf in subfields_for_note:
            if sf in field_700:
                note_parts.append(field_700[sf])
    data['raw_field_note'] = ' | '.join(note_parts)

    # --- Specific Stragglers ---
    if '535' not in [f for f in fields_to_extract]: 
        field_535_obj = record.get('535')
        data['new_535_full'] = field_535_obj.value() if field_535_obj else ''
        data['new_535_a'] = get_s_field(field_535_obj, 'a')

    field_907_new_obj = record.get('907')
    data['new_907_full'] = field_907_new_obj.value() if field_907_new_obj else ''
    data['new_907_9'] = get_s_field(field_907_new_obj, '9')
    data['new_907_a'] = get_s_field(field_907_new_obj, 'a')

    return data

def main():
    logging.info("--- 📥 Starting Alma MARC Raw Extractor ---")
    
    marc_file_path = get_latest_marc_file(raw_alma_dir)
    all_marc_data = []

    logging.info(" 🚀 Parsing binary MARC records (this might take a moment)...")
    try:
        with open(marc_file_path, 'rb') as mf:
            reader = pymarc.MARCReader(mf, to_unicode=True, force_utf8=True, hide_utf8_warnings=True)
            for record_count, record in enumerate(reader):
                if record is None:
                    logging.info(f" ⚠️ Warning: Skipped a None record at position {record_count}.")
                    continue
                all_marc_data.append(extract_raw_marc(record))
    except Exception as e:
        logging.info(f" ❌ Error reading MARC file: {e}")
        raise RuntimeError("Task Failed. Check logs for details.")

    df = pd.DataFrame(all_marc_data)

    if not df.empty:
        output_parquet.parent.mkdir(parents=True, exist_ok=True)

        logging.info(f" 💾 Saving to Parquet file: {output_parquet}")
        df.to_parquet(output_parquet, index=False, engine='pyarrow')
        
        logging.info(f" ✅ Successfully dumped {len(df)} wide records to staging.")
    else:
        logging.info(" ❌ No data extracted. Parquet file was not created.")


if __name__ == "__main__":
    main()
