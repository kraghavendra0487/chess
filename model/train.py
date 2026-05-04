import pandas as pd
import joblib
import os
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from preprocess import preprocess_dataframe, FEATURE_COLUMNS

def train_and_save_models():
    # 1. Load Data
    data_path = 'cleaned_chess_data.csv'
    if not os.path.exists(data_path):
        print(f"Error: {data_path} not found.")
        return
    
    df_raw = pd.read_csv(data_path)
    
    # 2. Preprocess
    print("Preprocessing data...")
    df = preprocess_dataframe(df_raw)
    
    # Define features and targets
    X = df[FEATURE_COLUMNS]
    y_3class = df['target_3class']
    y_8class = df['chess.com Classification']
    
    # 3. Fit Encoders
    print("Fitting label encoders...")
    le_3 = LabelEncoder()
    y3_encoded = le_3.fit_transform(y_3class)
    
    le_8 = LabelEncoder()
    y8_encoded = le_8.fit_transform(y_8class)
    
    # Save encoders
    joblib.dump(le_3, 'models/label_encoder_3.pkl')
    joblib.dump(le_8, 'models/label_encoder_8.pkl')
    
    # 4. Train Models
    
    # --- PIPELINE 1 (XGB -> RF) ---
    print("Training Pipeline 1 (XGBoost -> Random Forest)...")
    p1_m3 = XGBClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.9, colsample_bytree=0.9, random_state=42,
        eval_metric='mlogloss'
    )
    p1_m3.fit(X, y3_encoded)
    
    # Add pred_3class feature for m8 training
    X_m8 = X.copy()
    X_m8['pred_3class'] = p1_m3.predict(X)
    
    p1_m8 = RandomForestClassifier(
        n_estimators=300, max_depth=14, random_state=42, n_jobs=-1
    )
    p1_m8.fit(X_m8, y8_encoded)
    
    joblib.dump(p1_m3, 'models/pipeline1_model3.pkl')
    joblib.dump(p1_m8, 'models/pipeline1_model8.pkl')
    
    # --- PIPELINE 2 (XGB -> XGB) ---
    print("Training Pipeline 2 (XGBoost -> XGBoost)...")
    p2_m3 = XGBClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.9, colsample_bytree=0.9, random_state=42,
        eval_metric='mlogloss'
    )
    p2_m3.fit(X, y3_encoded)
    
    X_m8_p2 = X.copy()
    X_m8_p2['pred_3class'] = p2_m3.predict(X)
    
    p2_m8 = XGBClassifier(
        n_estimators=400, max_depth=6, learning_rate=0.05,
        subsample=0.9, colsample_bytree=0.9, random_state=42,
        eval_metric='mlogloss'
    )
    p2_m8.fit(X_m8_p2, y8_encoded)
    
    joblib.dump(p2_m3, 'models/pipeline2_model3.pkl')
    joblib.dump(p2_m8, 'models/pipeline2_model8.pkl')
    
    # --- PIPELINE 3 (XGB -> GB) ---
    print("Training Pipeline 3 (XGBoost -> Gradient Boosting)...")
    p3_m3 = XGBClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.9, colsample_bytree=0.9, random_state=42,
        eval_metric='mlogloss'
    )
    p3_m3.fit(X, y3_encoded)
    
    X_m8_p3 = X.copy()
    X_m8_p3['pred_3class'] = p3_m3.predict(X)
    
    p3_m8 = GradientBoostingClassifier(
        n_estimators=400, learning_rate=0.05, max_depth=5, random_state=42
    )
    p3_m8.fit(X_m8_p3, y8_encoded)
    
    joblib.dump(p3_m3, 'models/pipeline3_model3.pkl')
    joblib.dump(p3_m8, 'models/pipeline3_model8.pkl')
    
    print("All models and encoders saved successfully to 'models/' directory.")

if __name__ == "__main__":
    train_and_save_models()
