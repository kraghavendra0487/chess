import joblib
import os
import numpy as np
import pandas as pd
from preprocess import preprocess_single_input, FEATURE_COLUMNS

# Global cache for models and encoders
_MODELS = {}
_ENCODERS = {}

def load_all_resources():
    """
    Loads all saved models and encoders into the global cache once.
    """
    # Use absolute path relative to this script's directory
    base_dir = os.path.dirname(os.path.abspath(__file__))
    model_dir = os.path.join(base_dir, 'models')
    
    pipelines = ['pipeline1', 'pipeline2', 'pipeline3']
    
    # Load Models
    for p in pipelines:
        _MODELS[f"{p}_m3"] = joblib.load(os.path.join(model_dir, f"{p}_model3.pkl"))
        _MODELS[f"{p}_m8"] = joblib.load(os.path.join(model_dir, f"{p}_model8.pkl"))
    
    # Load Encoders
    _ENCODERS['le_3'] = joblib.load(os.path.join(model_dir, 'label_encoder_3.pkl'))
    _ENCODERS['le_8'] = joblib.load(os.path.join(model_dir, 'label_encoder_8.pkl'))
    
    if __name__ == "__main__":
        print("All models and encoders loaded successfully.")

def predict(input_dict, pipeline="pipeline1"):
    """
    Predicts both 3-class and 8-class classification for a single input record.
    Returns: (predicted_3class_label, predicted_8class_label)
    """
    if not _MODELS:
        load_all_resources()
        
    # 1. Preprocess
    # input_dict should contain keys corresponding to CSV columns
    X_processed = preprocess_single_input(input_dict)
    
    # 2. Pipeline-specific prediction
    m3 = _MODELS[f"{pipeline}_m3"]
    m8 = _MODELS[f"{pipeline}_m8"]
    
    # 3. Step 1: Predict 3-class
    pred_3_encoded = m3.predict(X_processed)
    pred_3_label = _ENCODERS['le_3'].inverse_transform(pred_3_encoded)[0]
    
    # 4. Step 2: Add pred_3class feature for m8 prediction
    # Feature order for m8: [original_features..., pred_3class_encoded]
    X_m8 = X_processed.copy()
    X_m8['pred_3class'] = pred_3_encoded
    
    # 5. Step 3: Predict 8-class
    pred_8_encoded = m8.predict(X_m8)
    pred_8_label = _ENCODERS['le_8'].inverse_transform(pred_8_encoded)[0]
    
    return pred_3_label, pred_8_label

if __name__ == "__main__":
    # Example raw input from user (e.g., from an API or UI)
    example_input = {
        'Move No': 15,
        'Player': 'White',
        'Played Move Standing': 1,
        'Played Move Evaluation': 0.5,
        'Evaluation (Before Move)': 0.45,
        'Win %': 55.0,
        'Legal Moves (At Move)': 32,
        'Game Phase': 'middlegame',
        'Material Advantage': 0,
        'Top Line Eval': '#2', # Test mate conversion
        'Win % (Player)_scaled': 0.52,
        'Move Quality (Delta)': 0.05
    }
    
    print("\n--- ANALYSIS: INPUT & PREPROCESSING ---\n")
    print("1. RAW INPUT DICTIONARY:")
    for k, v in example_input.items():
        print(f"   {k:25}: {v}")
    
    # Preprocess
    from preprocess import preprocess_single_input
    processed_df = preprocess_single_input(example_input)
    
    print("\n2. PREPROCESSED FEATURES (READY FOR MODEL):")
    for col in FEATURE_COLUMNS:
        val = processed_df[col].values[0]
        print(f"   {col:25}: {val}")
    
    print("\n3. RUNNING PREDICTIONS...")
    
    import time
    start = time.time()
    
    # Pre-load resources
    load_all_resources()
    
    for p in ["pipeline1", "pipeline2", "pipeline3"]:
        p3, p8 = predict(example_input, pipeline=p)
        print(f"\nResults for {p}:")
        print(f"   - 3-Class (Broad): {p3}")
        print(f"   - 8-Class (Specific): {p8}")
        
    end = time.time()
    print(f"\nTotal inference time (3 pipelines): {(end-start)*1000:.2f} ms")
