import json
import os
import functions_framework
from google.cloud import bigquery

# ---- Config -----------------------------------------------------------
PROJECT_ID = os.environ.get("BQ_PROJECT") or os.environ.get("GCP_PROJECT_ID", "pawait-data-hub")
DATASET = os.environ.get("BQ_DATASET", "cloud_mastery")
TABLE = os.environ.get("BQ_PRODUCTS_TABLE", "products")
MAX_RESULTS = 5
GCS_PUBLIC_BASE = "https://storage.googleapis.com/cloud_mastery_images/"

_client = bigquery.Client(project=PROJECT_ID)


def _resolve_image_url(image_uri: str) -> str:
    if not image_uri:
        return ""
    if image_uri.startswith("gs://"):
        return image_uri.replace("gs://", GCS_PUBLIC_BASE, 1)
    return image_uri  # already a usable HTTPS URL


def _search_product(query: str, max_results: int = MAX_RESULTS) -> dict:
    sql = f"""
        SELECT
            id            AS product_id,
            name          AS title,
            description   AS subtitle,
            unitCost      AS price,
            category      AS category,
            quantity      AS quantity,
            image_url     AS image_url
        FROM `{PROJECT_ID}.{DATASET}.{TABLE}`
        WHERE LOWER(name) LIKE LOWER(@query_pattern)
           OR LOWER(category) LIKE LOWER(@query_pattern)
           OR LOWER(description) LIKE LOWER(@query_pattern)
        LIMIT @max_results
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter(
                "query_pattern", "STRING", f"%{query.strip()}%"
            ),
            bigquery.ScalarQueryParameter("max_results", "INT64", max_results),
        ]
    )

    rows = list(_client.query(sql, job_config=job_config).result())

    if not rows:
        return {"found": False, "products": []}

    products = []
    for row in rows:
        image_url = _resolve_image_url(row.image_url)

        subtitle = row.subtitle or ""
        if row.quantity is not None and row.quantity <= 0:
            subtitle = f"{subtitle} (Out of stock)".strip()

        products.append({
            "productId": row.product_id,
            "title": row.title,
            "subtitle": subtitle,
            "price": f"KES {row.price:,.2f}" if row.price is not None else "",
            "imageUris": [image_url] if image_url else [],
            "uri": "",
        })

    return {"found": True, "products": products}


@functions_framework.http
def search_product(request):
    """HTTP entry point. Expects JSON body: {"query": "...", "max_results": 5}"""
    request_json = request.get_json(silent=True) or {}
    query = request_json.get("query", "")
    max_results = request_json.get("max_results", MAX_RESULTS)

    if not query:
        return (json.dumps({"error": "Missing required field 'query'"}), 400,
                {"Content-Type": "application/json"})

    result = _search_product(query, max_results)
    return (json.dumps(result), 200, {"Content-Type": "application/json"})
