from typing import List, Dict
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import json
import re

def normalize_title(title):
    title = title.lower()
    title = re.sub(r"[^\w\s]", " ", title)  
    title = re.sub(r"\s+", " ", title).strip()
    return title


def find_similar_titles(base_title, competitor_titles, top_k=5, similarity_threshold=0.5):
    all_titles = [base_title] + competitor_titles
    normalized_titles = [normalize_title(t) for t in all_titles]

    vectorizer = TfidfVectorizer(ngram_range=(1, 3))  # Use unigrams + bigrams + trigrams
    tfidf_matrix = vectorizer.fit_transform(normalized_titles)

    similarities = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:]).flatten()
    
    # Filter and sort matches
    matches = [
        (competitor_titles[i], similarities[i])
        for i in range(len(competitor_titles))
        if similarities[i] >= similarity_threshold
    ]
    
    matches = sorted(matches, key=lambda x: x[1], reverse=True)[:top_k]
    return matches


def is_similar(title1: str, title2: str, threshold: float = 0.4) -> bool:
    print(f"Comparing '{title1}' with '{title2}'")

    vectorizer = TfidfVectorizer().fit([title1, title2])
    tfidf = vectorizer.transform([title1, title2])
    similarity = cosine_similarity(tfidf[0:1], tfidf[1:2])[0][0]

    return similarity >= threshold

def get_pricing_suggestions(our_price: float, competitor_prices: List[float]) -> Dict[str, float]:
    if not competitor_prices:
        return {
            "undercut_lower": round(our_price, 2),
            "undercut_avg": round(our_price, 2),
            "lowest_price_match": round(our_price, 2),
            "slight_premium": round(our_price, 2),
            "premium": round(our_price, 2)
        }

    avg_price = sum(competitor_prices) / len(competitor_prices)
    lowest_price = min(competitor_prices)
    highest_price = max(competitor_prices)

    return {
        "undercut_lower": round(lowest_price * 0.95, 2),
        "undercut_avg": round(avg_price * 0.95, 2),
        "lowest_price_match": round(lowest_price, 2),
        "slight_premium": round(avg_price * 1.1, 2),
        "premium": round(highest_price * 1.05, 2),
    }

def suggest_variant_pricing_with_details(our_data: Dict, competitor_data: Dict) -> Dict:
    suggestions = []

    for product in our_data["products"]:
        title = product["title"]
        product_suggestions = {}

        for variant in product["variants"]:
            variant_title = variant["title"]
            our_price = float(variant["price"])

            competitor_prices = []
            matched_competitors = []

            for comp_product in competitor_data["products"]:
                for comp_variant in comp_product["variants"]:
                    if is_similar(product["title"]+" "+variant_title, comp_product["title"]+" "+comp_variant["title"]):
                        try:
                            price = float(comp_variant["price"])
                            if price > 0:
                                competitor_prices.append(price)
                                matched_competitors.append({
                                    "competitor_product_title": comp_product["title"],
                                    "competitor_variant_title": comp_variant["title"],
                                    "price": price
                                })
                            
                            pricing_options = get_pricing_suggestions(our_price, competitor_prices)

                            product_suggestions = {
                                "title": product["title"],
                                "variant_title": variant_title,
                                "current_price": our_price,
                                "suggested_prices": pricing_options,
                                # "competitor_prices_considered": competitor_prices,
                                "matched_competitor_variants": matched_competitors
                            }

                            suggestions.append(product_suggestions)
                        except (KeyError, ValueError):
                            continue

    return suggestions

def main():
    # Load data from JSON files
    try:
        with open("ecosys.json", "r") as f:
            our_data = json.load(f)
    except FileNotFoundError:
        print("Error: our_products.json not found.")
        return
    except json.JSONDecodeError:
        print("Error: Invalid JSON in our_products.json.")
        return

    try:
        with open("koparo.json", "r") as f:
            competitor_data = json.load(f)
    except FileNotFoundError:
        print("Error: competitor_products.json not found.")
        return
    except json.JSONDecodeError:
        print("Error: Invalid JSON in competitor_products.json.")
        return

    # Generate pricing suggestions
    suggestions = suggest_variant_pricing_with_details(our_data, competitor_data)

    # Output the suggestions (e.g., print or save to a file)
    print(json.dumps(suggestions, indent=4))

if __name__ == "__main__":
    main()