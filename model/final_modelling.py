# -*- coding: utf-8 -*-


import pandas as pd

# read csv
file_name = 'cleaned_chess_data.csv'
df = pd.read_csv(file_name)

# print columns
print("COLUMNS:\n")
print(df.columns)

# optional: quick check
print("\nSHAPE:", df.shape)

cols_to_drop = ['Game', 'Move', 'Win % (Player)']

df = df.drop(columns=cols_to_drop, errors='ignore')

print("Columns dropped")

print("Remaining Columns:\n")
print(df.columns)

print("SHAPE:", df.shape)

df = df.rename(columns={
    'Line 1 Eval': 'Top Line Eval'
})

print("Renamed successfully")

print("Columns:\n")
print(df.columns)

cols = ['chess.com Classification', 'Played Move Classification']

for col in cols:
    df[col] = df[col].astype(str).str.strip().str.lower()

    df[col] = df[col].replace({
        'brilliant': 'best',
        'great move': 'best',
        'great': 'best'   # (optional but recommended based on your earlier data)
    })

# verify
for col in cols:
    print(f"VALUE COUNTS for {col}:\n")
    print(df[col].value_counts())

for col in cols:
    print(f"UNIQUE VALUES for {col}:\n")
    print(sorted(df[col].unique()))

# 1. Convert 'miss' → 'mistake' in target column
df['chess.com Classification'] = df['chess.com Classification'].replace({
    'miss': 'mistake'
})

# 2. Drop Played Move Classification
df = df.drop(columns=['Played Move Classification'], errors='ignore')

# verify
print("Updated VALUE COUNTS:\n")
print(df['chess.com Classification'].value_counts())

print("Remaining Columns:\n")
print(df.columns)

import numpy as np

col = 'Top Line Eval'

def convert_eval(val, win_pct):
    val = str(val).strip()

    if val.startswith('#'):
        try:
            n = int(val.replace('#', ''))
            n = abs(n)
            score = 21 - n if n <= 10 else 10

            return score if win_pct > 50 else -score
        except:
            return np.nan

    try:
        return float(val)
    except:
        return np.nan

# apply
df[col] = df.apply(lambda row: convert_eval(row[col], row['Win %']), axis=1)

# check
print(df[col].dtype)
print(df[col].head())

# Player encoding (ensure numeric)
df['Player'] = df['Player'].map({'White': 1, 'Black': 0})

# Game Phase encoding (ensure correct mapping)
df['Game Phase'] = df['Game Phase'].astype(str).str.lower()

df['Game Phase'] = df['Game Phase'].map({
    'opening': 0,
    'middlegame': 1,
    'endgame': 2
})

# check if any NaN created
print(df[['Player', 'Game Phase']].isna().sum())

df



df['Eval_vs_TopLine'] = df['Top Line Eval'] - df['Played Move Evaluation']

df['Move Standing Quality'] = 1 / df['Played Move Standing']

print("ALL COLUMNS:\n")
print(df.columns)

# select only numeric columns
numeric_df = df.select_dtypes(include=np.number)

# compute correlation
corr = numeric_df.corr()

df.info()

# drop rows with null in critical columns
df = df.dropna(subset=['Top Line Eval', 'Eval_vs_TopLine'])

print("After dropping nulls:")
print(df.shape)

# =========================
# CREATE 3-CLASS TARGET
# =========================

def map_to_3_classes(x):
    x = str(x).strip().lower()

    if x in ['best', 'excellent', 'good']:
        return 'good'
    elif x in ['book', 'forced']:
        return 'neutral'
    elif x in ['inaccuracy', 'mistake', 'blunder']:
        return 'bad'
    else:
        return 'unknown'

df['target_3class'] = df['chess.com Classification'].apply(map_to_3_classes)

# =========================
# ENCODE
# =========================
from sklearn.preprocessing import LabelEncoder

le_3 = LabelEncoder()
df['target_3_encoded'] = le_3.fit_transform(df['target_3class'])

print("3-class created")
print(df['target_3class'].value_counts())



from sklearn.model_selection import train_test_split

splits = []

X_base = df.drop(columns=[
    'chess.com Classification',
    'target_3class',
    'target_3_encoded'
])

y_base = df['target_3_encoded']

for i in range(5):

    X_train, X_test, y_train, y_test = train_test_split(
        X_base,
        y_base,
        test_size=0.2,
        random_state=42 + i,
        stratify=y_base
    )

    splits.append((X_train, X_test, y_train, y_test))

print("Created", len(splits), "splits")



from sklearn.metrics import accuracy_score
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier
from sklearn.ensemble import RandomForestClassifier

results_3 = []
results_8 = []

le_8 = LabelEncoder()

print("\nRUNNING 2-STAGE PIPELINE ON 5 SPLITS\n")

for i, (X_train, X_test, y3_train, y3_test) in enumerate(splits):

    print(f"\n===== SPLIT {i+1} =====")

    # =========================
    # 1. TRAIN 3-CLASS MODEL
    # =========================
    model_3 = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=42,
        eval_metric='mlogloss'
    )

    model_3.fit(X_train, y3_train)

    # =========================
    # 2. 3-CLASS EVALUATION
    # =========================
    y3_pred_test = model_3.predict(X_test)
    acc_3 = accuracy_score(y3_test, y3_pred_test)

    results_3.append(acc_3)
    print(f"3-Class Accuracy: {acc_3:.4f}")

    # =========================
    # 3. ADD FEATURE (NO LEAKAGE)
    # =========================
    X_train_8 = X_train.copy()
    X_test_8 = X_test.copy()

    X_train_8['pred_3class'] = model_3.predict(X_train)
    X_test_8['pred_3class'] = y3_pred_test

    # =========================
    # 4. PREPARE 8-CLASS TARGET
    # =========================
    y8_train = df.loc[X_train.index, 'chess.com Classification']
    y8_test = df.loc[X_test.index, 'chess.com Classification']

    y8_train_enc = le_8.fit_transform(y8_train)
    y8_test_enc = le_8.transform(y8_test)

    # =========================
    # 5. TRAIN 8-CLASS MODEL (RF)
    # =========================
    model_8 = RandomForestClassifier(
        n_estimators=300,
        max_depth=14,
        random_state=42,
        n_jobs=-1
    )

    model_8.fit(X_train_8, y8_train_enc)

    # =========================
    # 6. 8-CLASS EVALUATION
    # =========================
    y8_pred = model_8.predict(X_test_8)
    acc_8 = accuracy_score(y8_test_enc, y8_pred)

    results_8.append(acc_8)
    print(f"8-Class Accuracy: {acc_8:.4f}")

# =========================
# FINAL RESULTS
# =========================

print("\nFINAL AVERAGE RESULTS\n")

print("Average 3-Class Accuracy: [XG Boost]", round(sum(results_3)/len(results_3), 4))
print("Average 8-Class Accuracy: [Random Forest]", round(sum(results_8)/len(results_8), 4))



from sklearn.metrics import accuracy_score
from xgboost import XGBClassifier
from sklearn.preprocessing import LabelEncoder

results_3 = []
results_8 = []

le_8 = LabelEncoder()

print("\nMODEL 2 (XGB -> XGB Pipeline)\n")

for i, (X_train, X_test, y3_train, y3_test) in enumerate(splits):

    print(f"\n===== SPLIT {i+1} =====")

    # =========================
    # 1. 3-CLASS MODEL (XGB)
    # =========================
    model_3 = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=42,
        eval_metric='mlogloss'
    )

    model_3.fit(X_train, y3_train)

    # 3-class eval
    y3_pred_test = model_3.predict(X_test)
    acc_3 = accuracy_score(y3_test, y3_pred_test)
    results_3.append(acc_3)

    print(f"3-Class Accuracy: {acc_3:.4f}")

    # =========================
    # 2. ADD FEATURE
    # =========================
    X_train_8 = X_train.copy()
    X_test_8 = X_test.copy()

    X_train_8['pred_3class'] = model_3.predict(X_train)
    X_test_8['pred_3class'] = y3_pred_test

    # =========================
    # 3. 8-CLASS TARGET
    # =========================
    y8_train = df.loc[X_train.index, 'chess.com Classification']
    y8_test = df.loc[X_test.index, 'chess.com Classification']

    y8_train_enc = le_8.fit_transform(y8_train)
    y8_test_enc = le_8.transform(y8_test)

    # =========================
    # 4. 8-CLASS MODEL (XGB)
    # =========================
    model_8 = XGBClassifier(
        n_estimators=400,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=42,
        eval_metric='mlogloss'
    )

    model_8.fit(X_train_8, y8_train_enc)

    # eval
    y8_pred = model_8.predict(X_test_8)
    acc_8 = accuracy_score(y8_test_enc, y8_pred)

    results_8.append(acc_8)
    print(f"8-Class Accuracy: {acc_8:.4f}")

# =========================
# FINAL
# =========================

print("\nFINAL RESULTS - MODEL 2 (XGB -> XGB)\n")

print("Average 3-Class Accuracy:", round(sum(results_3)/len(results_3), 4))
print("Average 8-Class Accuracy:", round(sum(results_8)/len(results_8), 4))





from sklearn.metrics import accuracy_score
from xgboost import XGBClassifier
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import LabelEncoder

results_3 = []
results_8 = []

le_8 = LabelEncoder()

print("\nMODEL 3 (XGB -> Gradient Boosting Pipeline)\n")

for i, (X_train, X_test, y3_train, y3_test) in enumerate(splits):

    print(f"\n===== SPLIT {i+1} =====")

    # =========================
    # 1. 3-CLASS MODEL (XGB)
    # =========================
    model_3 = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=42,
        eval_metric='mlogloss'
    )

    model_3.fit(X_train, y3_train)

    # 3-class eval
    y3_pred_test = model_3.predict(X_test)
    acc_3 = accuracy_score(y3_test, y3_pred_test)
    results_3.append(acc_3)

    print(f"3-Class Accuracy: {acc_3:.4f}")

    # =========================
    # 2. ADD FEATURE
    # =========================
    X_train_8 = X_train.copy()
    X_test_8 = X_test.copy()

    X_train_8['pred_3class'] = model_3.predict(X_train)
    X_test_8['pred_3class'] = y3_pred_test

    # =========================
    # 3. 8-CLASS TARGET
    # =========================
    y8_train = df.loc[X_train.index, 'chess.com Classification']
    y8_test = df.loc[X_test.index, 'chess.com Classification']

    y8_train_enc = le_8.fit_transform(y8_train)
    y8_test_enc = le_8.transform(y8_test)

    # =========================
    # 4. 8-CLASS MODEL (GB)
    # =========================
    model_8 = GradientBoostingClassifier(
        n_estimators=400,
        learning_rate=0.05,
        max_depth=5,
        random_state=42
    )

    model_8.fit(X_train_8, y8_train_enc)

    # eval
    y8_pred = model_8.predict(X_test_8)
    acc_8 = accuracy_score(y8_test_enc, y8_pred)

    results_8.append(acc_8)
    print(f"8-Class Accuracy: {acc_8:.4f}")

# =========================
# FINAL
# =========================

print("\nFINAL RESULTS - MODEL 3 (XGB -> GB)\n")

print("Average 3-Class Accuracy:", round(sum(results_3)/len(results_3), 4))
print("Average 8-Class Accuracy:", round(sum(results_8)/len(results_8), 4))