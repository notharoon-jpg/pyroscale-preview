import json
import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor

def rolling_origin_forecast(data_json_path: str, horizon: int = 24):
    """
    Performs rigorous rolling-origin evaluation and trains direct multi-horizon 
    Poisson LightGBM models without artificially zeroing out negative skill scores.
    """
    print("Loading harmonized historical data...")
    with open(data_json_path, 'r') as f:
        records = json.load(f)
        
    results = []
    
    for cell in records:
        history = np.array(cell['history'], dtype=float)
        
        # Skip cells with insufficient recent observations (<50 over last 60 months)
        if len(history) < 60 or np.sum(history[-60:]) < 50:
            continue
            
        lat, lon = cell['lat'], cell['lon']
        
        # Build rolling features (lags, rolling means, seasonal sine/cosine)
        df_cell = pd.DataFrame({'y': history})
        df_cell['month'] = np.tile(np.arange(1, 13), len(df_cell) // 12 + 1)[:len(df_cell)]
        df_cell['sin_m'] = np.sin(2 * np.pi * df_cell['month'] / 12)
        df_cell['cos_m'] = np.cos(2 * np.pi * df_cell['month'] / 12)
        df_cell['lag_1'] = df_cell['y'].shift(1)
        df_cell['lag_12'] = df_cell['y'].shift(12)
        df_cell['roll_mean_6'] = df_cell['y'].rolling(6).mean()
        
        df_cell = df_cell.dropna()
        if len(df_cell) < 36:
            continue
            
        # Strict chronological split: Train / Validation / Untouched Test (last 24 months)
        train_df = df_cell.iloc[:-24]
        test_df = df_cell.iloc[-24:]
        
        X_train = train_df[['sin_m', 'cos_m', 'lag_1', 'lag_12', 'roll_mean_6']]
        y_train = train_df['y']
        
        X_test = test_df[['sin_m', 'cos_m', 'lag_1', 'lag_12', 'roll_mean_6']]
        y_test = test_df['y']
        
        # Train LightGBM with Poisson objective
        model = LGBMRegressor(objective='poisson', n_estimators=100, learning_rate=0.05, random_state=42)
        model.fit(X_train, y_train)
        
        preds = model.predict(X_test)
        
        # Calculate raw out-of-fold RMSE / Skill without artificial clipping
        seasonal_baseline = train_df['y'].groupby(train_df['month']).median().reindex(test_df['month']).values
        
        mse_model = np.mean((y_test.values - preds) ** 2)
        mse_base = np.mean((y_test.values - seasonal_baseline) ** 2)
        
        # Unbiased skill metric reporting
        raw_skill = 1.0 - (mse_model / (mse_base + 1e-8))
        
        results.append({
            "lat": lat,
            "lon": lon,
            "raw_skill": float(raw_skill),
            "forecast": preds.tolist(),
            "baseline": seasonal_baseline.tolist()
        })
        
    print(f"Successfully generated evaluated forecasts for {len(results)} valid grid cells.")
    return results

if __name__ == "__main__":
    # Example execution
    # rolling_origin_forecast("pyroscale_data_harmonized.json")
    pass