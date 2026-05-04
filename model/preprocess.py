import pandas as pd
import numpy as np

# List of features in the order they were trained
FEATURE_COLUMNS = [
    'Move No', 'Player', 'Played Move Standing', 'Played Move Evaluation', 
    'Evaluation (Before Move)', 'Win %', 'Legal Moves (At Move)', 
    'Game Phase', 'Material Advantage', 'Top Line Eval', 
    'Win % (Player)_scaled', 'Move Quality (Delta)', 
    'Eval_vs_TopLine', 'Move Standing Quality'
]

def convert_eval(val, win_pct):
    """
    Converts chess evaluation strings (including '#' for mate) to numeric scores.
    """
    val = str(val).strip()
    if val.startswith('#'):
        try:
            n = int(val.replace('#', ''))
            n = abs(n)
            # Higher score for faster mate, max score 10
            score = 21 - n if n <= 10 else 10
            return float(score) if win_pct > 50 else float(-score)
        except:
            return np.nan
    try:
        return float(val)
    except:
        return np.nan

def map_to_3_classes(x):
    """
    Maps 8-class chess.com classifications to 3 broader classes.
    """
    x = str(x).strip().lower()
    if x in ['best', 'excellent', 'good']:
        return 'good'
    elif x in ['book', 'forced']:
        return 'neutral'
    elif x in ['inaccuracy', 'mistake', 'blunder']:
        return 'bad'
    else:
        return 'unknown'

def preprocess_dataframe(df):
    """
    Complete preprocessing for training (handles bulk data).
    """
    # 1. Basic Cleaning
    cols_to_drop = ['Game', 'Move', 'Win % (Player)']
    df = df.drop(columns=cols_to_drop, errors='ignore')
    
    df = df.rename(columns={'Line 1 Eval': 'Top Line Eval'})
    
    # 2. Text Normalization
    cols_to_normalize = ['chess.com Classification', 'Played Move Classification']
    for col in cols_to_normalize:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().str.lower()
            df[col] = df[col].replace({
                'brilliant': 'best',
                'great move': 'best',
                'great': 'best',
                'miss': 'mistake'
            })

    # 3. Feature Engineering - Convert Eval
    if 'Top Line Eval' in df.columns and 'Win %' in df.columns:
        df['Top Line Eval'] = df.apply(lambda row: convert_eval(row['Top Line Eval'], row['Win %']), axis=1)

    # 4. Encoding
    if 'Player' in df.columns:
        df['Player'] = df['Player'].map({'White': 1, 'Black': 0, 1: 1, 0: 0})
        
    if 'Game Phase' in df.columns:
        df['Game Phase'] = df['Game Phase'].astype(str).str.lower()
        df['Game Phase'] = df['Game Phase'].map({
            'opening': 0, 'middlegame': 1, 'endgame': 2,
            '0': 0, '1': 1, '2': 2
        })

    # 5. Derived Features
    if 'Top Line Eval' in df.columns and 'Played Move Evaluation' in df.columns:
        df['Eval_vs_TopLine'] = df['Top Line Eval'] - df['Played Move Evaluation']
    
    if 'Played Move Standing' in df.columns:
        df['Move Standing Quality'] = 1 / df['Played Move Standing'].replace(0, np.nan)

    # 6. Final cleanup for training
    df = df.dropna(subset=['Top Line Eval', 'Eval_vs_TopLine'])
    
    # 7. Targets
    if 'chess.com Classification' in df.columns:
        df['target_3class'] = df['chess.com Classification'].apply(map_to_3_classes)
    
    return df

def preprocess_single_input(input_dict):
    """
    Preprocesses a single record for real-time inference.
    Ensures correct types, handles missing fields, and matches training features.
    """
    # Standardize input dictionary
    data = input_dict.copy()
    
    # Mapping field names if they match raw CSV names
    if 'Line 1 Eval' in data:
        data['Top Line Eval'] = data.pop('Line 1 Eval')
        
    # Validation / Defaulting
    required_fields = [
        'Move No', 'Player', 'Played Move Standing', 'Played Move Evaluation', 
        'Evaluation (Before Move)', 'Win %', 'Legal Moves (At Move)', 
        'Game Phase', 'Material Advantage', 'Top Line Eval', 'Win % (Player)_scaled', 
        'Move Quality (Delta)'
    ]
    
    for field in required_fields:
        if field not in data:
            data[field] = 0.0 # Default value

    # 1. Feature Engineering
    # Eval conversion (handle raw strings like "+0.50" or "#2")
    top_line_eval = convert_eval(data['Top Line Eval'], data['Win %'])
    played_move_eval = convert_eval(data['Played Move Evaluation'], data['Win %'])
    eval_before_move = convert_eval(data['Evaluation (Before Move)'], data['Win %'])
    
    # Player encoding
    player = 1 if str(data['Player']).lower() in ['white', '1'] else 0
    
    # Game Phase encoding
    phase_map = {'opening': 0, 'middlegame': 1, 'endgame': 2}
    phase_str = str(data['Game Phase']).lower()
    game_phase = phase_map.get(phase_str, 1) # Default to middlegame if unknown
    
    # Derived features
    eval_vs_top = top_line_eval - played_move_eval
    move_standing_qual = 1 / float(data['Played Move Standing']) if float(data['Played Move Standing']) != 0 else 0

    feature_dict = {
        'Move No': float(data['Move No']),
        'Player': float(player),
        'Played Move Standing': float(data['Played Move Standing']),
        'Played Move Evaluation': float(played_move_eval),
        'Evaluation (Before Move)': float(eval_before_move),
        'Win %': float(data['Win %']),
        'Legal Moves (At Move)': float(data['Legal Moves (At Move)']),
        'Game Phase': float(game_phase),
        'Material Advantage': float(data['Material Advantage']),
        'Top Line Eval': float(top_line_eval),
        'Win % (Player)_scaled': float(data['Win % (Player)_scaled']),
        'Move Quality (Delta)': float(data['Move Quality (Delta)']),
        'Eval_vs_TopLine': float(eval_vs_top),
        'Move Standing Quality': float(move_standing_qual)
    }
    
    # Return as DataFrame to keep feature names and fill NaNs with 0.0
    return pd.DataFrame([feature_dict])[FEATURE_COLUMNS].fillna(0.0)
