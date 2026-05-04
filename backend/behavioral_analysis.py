import pandas as pd
import numpy as np

def compute_behaviors(df):
    """
    Computes 8 behavioral chess insights from move-level data.
    
    Expected columns in df:
    - 'T': move time (seconds)
    - 'Top Line Eval': best move evaluation (cp)
    - 'Played Move Evaluation': played move evaluation (cp)
    - 'Classification': chess.com classification (string)
    - 'Move Number': move index (int)
    - 'Game Phase': opening/middlegame/endgame (string)
    - 'Played Move Standing': move rank (int)
    """
    
    if df.empty:
        return {
            "Patience": 0, "Consistency": 0, "Adaptability": 0, "Focus": 0,
            "MentalStability": 0, "TimeManagement": 0, "Creativity": 0, "Aggression": 0
        }

    # --- STEP 2: CORE DERIVED VARIABLES ---
    
    # 1. Evaluation Delta
    df['delta_eval'] = abs(df['Top Line Eval'] - df['Played Move Evaluation'])
    
    # 2. Classification Indicators
    df['B_i'] = df['Classification'].str.lower().apply(lambda x: 1 if x == 'blunder' else 0)
    df['M_i'] = df['Classification'].str.lower().apply(lambda x: 1 if x == 'mistake' else 0)
    df['I_i'] = df['Classification'].str.lower().apply(lambda x: 1 if x == 'inaccuracy' else 0)
    df['G_i'] = df['Classification'].str.lower().apply(lambda x: 1 if x in ['best', 'excellent', 'good'] else 0)
    df['Book_i'] = df['Classification'].str.lower().apply(lambda x: 1 if x == 'book' else 0)
    
    # 3. Error Indicator
    df['Err_i'] = df['B_i'] + df['M_i'] + df['I_i']
    
    # 4. Opening Indicator
    df['Opening_i'] = df['Game Phase'].str.lower().apply(lambda x: 1 if x == 'opening' else 0)
    
    # --- STEP 3: AGGREGATED METRICS ---
    
    N = len(df)
    B = df['B_i'].sum() / N if N > 0 else 0
    Err = df['Err_i'].sum() / N if N > 0 else 0
    
    avg_T = df['T'].mean()
    max_T = df['T'].max()
    std_T = df['T'].std() if N > 1 else 0
    
    avg_delta = df['delta_eval'].mean()
    std_delta = df['delta_eval'].std() if N > 1 else 0
    max_delta = df['delta_eval'].max()
    
    # HighSwing: Large eval changes (threshold > 1.5 cp)
    high_swing_threshold = 1.5
    high_swing_count = (df['delta_eval'] > high_swing_threshold).sum()
    
    # Endgame errors
    err_endgame = df[df['Game Phase'].str.lower() == 'endgame']['Err_i'].sum()
    total_errors = df['Err_i'].sum()
    
    # Opening metrics
    n_opening = df['Opening_i'].sum()
    g_opening = df[df['Opening_i'] == 1]['G_i'].sum()
    book_rate = df[df['Opening_i'] == 1]['Book_i'].sum() / n_opening if n_opening > 0 else 0
    
    # Error streak
    # Convert moves into sequence: 1 = error, 0 = correct
    error_seq = df['Err_i'].tolist()
    max_streak = 0
    current_streak = 0
    for val in error_seq:
        if val == 1:
            current_streak += 1
            max_streak = max(max_streak, current_streak)
        else:
            current_streak = 0
            
    # Adaptability slope (Δeval vs Move Number)
    if N > 1:
        # slope = Cov(move_number, Δeval) / Var(move_number)
        move_numbers = df['Move Number'].values
        deltas = df['delta_eval'].values
        slope = np.polyfit(move_numbers, deltas, 1)[0]
    else:
        slope = 0

    # --- STEP 4: COMPUTE BEHAVIORS ---
    
    # 1. Patience
    patience = (avg_T / max_T) * (1 - B) if max_T > 0 else 0
    
    # 2. Consistency
    consistency = 1 - (std_delta / max_delta) if max_delta > 0 else 1
    
    # 3. Adaptability
    # If slope is negative, adaptability is high. 
    # The user wants 1 - slope. Since slope can be negative, 1 - slope can be > 1.
    adaptability = 1 - slope
    
    # 4. Focus
    focus = 1 - (err_endgame / total_errors) if total_errors > 0 else 1
    
    # 5. Mental Stability
    mental_stability = 1 - (max_streak / N) if N > 0 else 1
    
    # 6. Time Management
    time_mgmt = 1 - (std_T / max_T) if max_T > 0 else 1
    
    # 7. Creativity (Opening)
    creativity = (1 - book_rate) * (g_opening / n_opening) if n_opening > 0 else 0
    
    # 8. Aggression
    aggression = high_swing_count / N if N > 0 else 0

    # --- STEP 5: NORMALIZATION ---
    
    results = {
        "Patience": patience,
        "Consistency": consistency,
        "Adaptability": adaptability,
        "Focus": focus,
        "MentalStability": mental_stability,
        "TimeManagement": time_mgmt,
        "Creativity": creativity,
        "Aggression": aggression
    }
    
    # Scale to 0-100 and handle NaN
    final_scores = {}
    for k, v in results.items():
        # Handle NaN or Inf
        if not np.isfinite(v):
            val = 0
        else:
            val = max(0, min(v, 1))
        final_scores[k] = round(val * 100, 1)
        
    return final_scores

if __name__ == "__main__":
    # Test script if needed
    import sys
    import json
    
    if len(sys.argv) > 1:
        # If called from CLI with JSON data
        try:
            data = json.loads(sys.argv[1])
            df = pd.DataFrame(data)
            print(json.dumps(compute_behaviors(df)))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
