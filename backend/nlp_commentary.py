
import sys
import json
import random
import nltk
from nltk import pos_tag, word_tokenize

# Ensure NLTK data is available
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')
try:
    nltk.data.find('taggers/averaged_perceptron_tagger')
except LookupError:
    nltk.download('averaged_perceptron_tagger')

def generate_varied_commentary(json_inputs):
    # Phrase pools for variation (N-Gram like)
    phrase_pools = {
        "opening": [
            "In the opening,", "To start things off,", "In the early stages,", 
            "During the development phase,", "In this opening sequence,"
        ],
        "middlegame": [
            "In the middlegame,", "As the battle intensifies,", "With the pieces now active,",
            "In this complex middlegame struggle,", "With the tension rising,"
        ],
        "endgame": [
            "In the endgame,", "As we enter the final phase,", "With fewer pieces on the board,",
            "In this critical endgame position,", "With the kings becoming more active,"
        ],
        "default": ["In this position,", "At this point,", "Currently,", "In this situation,"],
        
        "blunder": {
            "verbs": ["catastrophically drops", "blunders away", "gives up", "throws away", "sacrifices for nothing"],
            "phrases": ["decisive material", "a winning position", "all coordination", "the game on the spot"]
        },
        "mistake": {
            "verbs": ["seriously compromises", "weakens", "miscalculates", "fumbles"],
            "phrases": ["the structural integrity", "the defensive shell", "the initiative entirely"]
        },
        "inaccuracy": {
            "verbs": ["misses", "overlooks", "slightly misplays"],
            "phrases": ["a sharper continuation", "the best response", "a subtle improvement", "a stronger defensive idea"]
        },
        "good": {
            "verbs": ["maintains", "solidifies", "continues"],
            "phrases": ["the pressure", "a solid position", "the natural development"]
        },
        "excellent": {
            "verbs": ["finds", "executes", "demonstrates"],
            "phrases": ["the best path", "great precision", "excellent positional understanding", "a strong tactical idea"]
        }
    }

    san = json_inputs.get("move", "N/A")
    game_phase = json_inputs.get("game_phase", "N/A")
    classification = json_inputs.get("classification", "N/A").lower()
    turn = json_inputs.get("turn", "White")
    best_move_san = json_inputs.get("best_move_san", "N/A")

    # Pick a phase-based prefix
    phase_pool = phrase_pools.get(game_phase.lower(), phrase_pools["default"])
    prefix = random.choice(phase_pool)

    # Base action
    move_action = f"{turn} played {san}"
    
    # Variation based on classification using POS tagging for "natural" feel
    quality_variation = ""
    if classification in phrase_pools:
        verb = random.choice(phrase_pools[classification]["verbs"])
        phrase = random.choice(phrase_pools[classification]["phrases"])
        if classification == "blunder":
            quality_variation = f"{san} {verb} {phrase}"
        else:
            quality_variation = f"{turn} {verb} {phrase}"
    elif classification in ["best"]:
        verb = random.choice(phrase_pools["excellent"]["verbs"])
        phrase = random.choice(phrase_pools["excellent"]["phrases"])
        quality_variation = f"{turn} {verb} {phrase}"

    # Use NLTK for POS tagging on the generated snippet to ensure correct grammar or add variety
    tokens = word_tokenize(quality_variation) if quality_variation else []
    tagged = pos_tag(tokens)
    
    better_alt = ""
    # Compare SAN vs SAN to avoid "Better was d7d5" when played move was "d5"
    if classification not in ["best", "excellent"] and best_move_san != "N/A" and best_move_san != san:
        # Check if it's a pawn move to make it more human as requested
        display_best = best_move_san
        if len(best_move_san) == 2 and best_move_san[0].islower():
            display_best = f"pawn to {best_move_san}"
            
        better_alt = f"Better was {display_best} as it improves the position significantly."

    position_status = "The position remains balanced."
    eval_val = float(json_inputs.get("played_eval", 0))
    if abs(eval_val) > 0.5:
        side = "White" if eval_val > 0 else "Black"
        position_status = f"The position remains advantageous for {side}."

    coaching_hint = ""
    if classification == "blunder":
        coaching_hint = "You could improve this by checking tactical threats and forcing responses before committing."
    elif classification == "inaccuracy":
        coaching_hint = "Improving move precision will help you find stronger continuations in similar positions."
    elif classification in ["excellent", "best"]:
        coaching_hint = "Excellent calculation and understanding of the position."

    # Build commentary carefully
    parts = [f"{prefix} {move_action}."]
    if quality_variation:
        parts.append(f"{quality_variation}.")
    
    # Emotional adjustment for better_alt
    if better_alt:
        if classification in ["blunder", "mistake"]:
            parts.append(f"It's painful to watch, especially when {best_move_san} was available.")
        else:
            parts.append(better_alt)

    # Position status with a bit more grit
    if classification == "blunder":
        parts.append("The evaluation has swung violently.")
    elif classification == "mistake":
        parts.append("The balance of the position is now precarious.")
    else:
        parts.append(position_status)

    if coaching_hint:
        parts.append(coaching_hint)

    commentary = " ".join(parts).replace(" .", ".").replace("  ", " ").strip()
    
    return {
        "commentary": commentary,
        "pos_tags": tagged,
        "classification": classification
    }

if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        result = generate_varied_commentary(input_data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
