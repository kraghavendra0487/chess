
import sys
import json
import os
import time
from transformers import T5Tokenizer, T5ForConditionalGeneration
import torch

# Suppress warnings
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# Global model/tokenizer
model = None
tokenizer = None

def load_model():
    global model, tokenizer
    model_name = "google/flan-t5-small"
    print(f"DEBUG: Loading model {model_name}...", file=sys.stderr)
    tokenizer = T5Tokenizer.from_pretrained(model_name)
    model = T5ForConditionalGeneration.from_pretrained(model_name)
    print(f"DEBUG: Model loaded successfully", file=sys.stderr)

def process_request(data):
    if not data or not isinstance(data, dict):
        return {"success": False, "error": "Invalid input data"}
    
    text = data.get("text", "")
    classification = data.get("classification", "good").lower()
    tactical = data.get("tactical", "NONE")
    turn = data.get("turn", "Opponent")
    book_name = data.get("book_move_name", "N/A")
    
    # Preprocessing for book moves to include type
    if classification == "book":
        text = f"{text} (Part of the {book_name} - known theory)"
    elif classification == "blunder":
        text = f"{text} (catastrophic error - loses material/position)"

    try:
        full_text = f"""
You are a witty chess player speaking directly to your opponent. 

Rules: 
- Speak ONLY in second person ("you"), NEVER use "he", "she", "they", "his", "her". 
- Do NOT narrate like a story. 
- Do NOT use names or roles. 
- Be confident, slightly sarcastic, and human. 
- No explanations. No advice. No repetition. 
- Write EXACTLY ONE short sentence (max 12 words). 

Move by {turn}: {text} 
It is a {classification} move. 
"""
        
        inputs = tokenizer(full_text, return_tensors="pt")
        
        # Corrected generation block
        outputs = model.generate(
            **inputs, 
            max_new_tokens=25, 
            do_sample=True, 
            temperature=0.6, 
            top_k=50, 
            top_p=0.9, 
            repetition_penalty=1.2 
        )
        result = tokenizer.batch_decode(outputs, skip_special_tokens=True)
        
        final_output = result[0].strip() 
 
        # kill bad outputs 
        if len(final_output.split()) > 20: 
            final_output = "Interesting choice… let’s see how that works out." 
        
        if "d7d5 d7d5" in final_output or len(final_output) < 5: 
            final_output = "Bold move… I’ll take that."
            
        if not final_output.endswith(('.', '!', '?')):
            final_output += '.'
            
        return {"success": True, "output": final_output}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    load_model()
    print("READY", flush=True) # Signal to node that model is ready
    
    # Listen for single lines of JSON input
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        
        try:
            data = json.loads(line)
            result = process_request(data)
            print(json.dumps(result), flush=True)
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}), flush=True)
