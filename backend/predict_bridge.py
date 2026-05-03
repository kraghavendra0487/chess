import sys
import json
import os

# Add the model directory to sys.path so we can import predict and preprocess
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'model')))

try:
    from predict import predict, load_all_resources
except ImportError as e:
    print(json.dumps({"error": f"Import error: {str(e)}", "path": sys.path}))
    sys.exit(1)

def run_prediction(input_data):
    try:
        # Pre-load resources (cached in predict.py)
        load_all_resources()
        
        results = {}
        for p in ["pipeline1", "pipeline2", "pipeline3"]:
            p3, p8 = predict(input_data, pipeline=p)
            results[p] = {
                "class3": p3,
                "class8": p8
            }
        
        # Also get the preprocessed features to show on UI
        from preprocess import preprocess_single_input
        processed_df = preprocess_single_input(input_data)
        features = processed_df.to_dict(orient='records')[0]
        
        return {
            "success": True,
            "predictions": results,
            "inputs": features,
            "raw_inputs": input_data
        }
    except Exception as e:
        import traceback
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }

if __name__ == "__main__":
    try:
        # Read from stdin instead of sys.argv to avoid shell escaping issues
        input_json = sys.stdin.read()
        if not input_json:
            print(json.dumps({"error": "No input data provided via stdin"}))
            sys.exit(1)
            
        data = json.loads(input_json)
        output = run_prediction(data)
        print(json.dumps(output))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
