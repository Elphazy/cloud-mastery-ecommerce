import json
import logging
import os
import re

import functions_framework
from google.cloud import bigquery

logging.basicConfig(level=logging.INFO)

CARTS = {}
SESSIONS = {}

PROJECT_ID = os.environ.get("BQ_PROJECT") or os.environ.get("GCP_PROJECT_ID", "pawait-data-hub")
DATASET = os.environ.get("BQ_DATASET", "cloud_mastery")
TABLE = os.environ.get("BQ_PRODUCTS_TABLE", "products")

_bq_client = bigquery.Client(project=PROJECT_ID)

_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
}

_CORS = (
    "",
    204,
    {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
)


def _json(data, status=200):
    return json.dumps(data, default=str), status, _HEADERS


def _get_product(product_id):
    sql = f"""
        SELECT name, unitCost, quantity
        FROM `{PROJECT_ID}.{DATASET}.{TABLE}`
        WHERE id = @product_id
        LIMIT 1
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("product_id", "STRING", product_id)
        ]
    )
    rows = list(_bq_client.query(sql, job_config=job_config).result())
    if not rows:
        return None
    row = rows[0]
    return {"name": row.name, "unitCost": row.unitCost, "quantity": row.quantity}


def _get_cart(session_id):
    return CARTS.setdefault(session_id, {"items": [], "subtotalKes": 0.0})


def _recalc(cart):
    cart["subtotalKes"] = sum(i["lineTotalKes"] for i in cart["items"])
    return cart


def _path(request):
    return request.path if request.path else "/"


@functions_framework.http
def cart_agent(request):
    if request.method == "OPTIONS":
        return _CORS

    path = _path(request)
    body = request.get_json(silent=True) or {}

    if request.method == "POST" and path.endswith("/addToCart"):
        session_id = request.args.get("sessionId")
        product_id = body.get("productId")
        quantity = int(body.get("quantity", 1))

        if not session_id or not product_id:
            return _json({"error": "sessionId query param and productId are required"}, 400)

        product = _get_product(product_id)
        if product is None:
            return _json({"error": f"productId '{product_id}' not found in catalogue."}, 404)

        if product["quantity"] is not None and quantity > product["quantity"]:
            return _json(
                {
                    "error": (
                        f"Only {product['quantity']} unit(s) of '{product['name']}' available."
                    )
                },
                409,
            )

        cart = _get_cart(session_id)
        existing = next((i for i in cart["items"] if i["productId"] == product_id), None)

        if existing:
            existing["quantity"] += quantity
            existing["lineTotalKes"] = existing["quantity"] * existing["unitCost"]
        else:
            cart["items"].append(
                {
                    "productId": product_id,
                    "productName": product["name"],
                    "unitCost": product["unitCost"],
                    "quantity": quantity,
                    "lineTotalKes": product["unitCost"] * quantity,
                }
            )

        _recalc(cart)
        return _json({"success": True, "cart": cart})

    if request.method == "POST" and path.endswith("/modifyCart"):
        session_id = request.args.get("sessionId")
        product_id = body.get("productId")
        quantity = int(body.get("quantity", 0))

        if not session_id or not product_id:
            return _json({"error": "sessionId query param and productId are required"}, 400)

        cart = _get_cart(session_id)
        existing = next((i for i in cart["items"] if i["productId"] == product_id), None)
        if not existing:
            return _json({"error": f"productId '{product_id}' not found in cart."}, 404)

        if quantity <= 0:
            cart["items"] = [i for i in cart["items"] if i["productId"] != product_id]
        else:
            existing["quantity"] = quantity
            existing["lineTotalKes"] = existing["quantity"] * existing["unitCost"]

        _recalc(cart)
        return _json({"success": True, "cart": cart})

    if request.method == "POST" and path.endswith("/askToModifyCart"):
        return _json({"status": "success"})

    cart_match = re.search(r"/cart/([^/]+)$", path)
    if request.method == "GET" and cart_match:
        session_id = cart_match.group(1)
        cart = _get_cart(session_id)
        return _json({"success": True, "cart": cart})

    item_match = re.search(r"/cart/([^/]+)/item/([^/]+)$", path)
    if request.method == "DELETE" and item_match:
        session_id = item_match.group(1)
        product_id = item_match.group(2)
        cart = _get_cart(session_id)
        before = len(cart["items"])
        cart["items"] = [i for i in cart["items"] if i["productId"] != product_id]

        if len(cart["items"]) == before:
            return _json({"error": f"productId '{product_id}' not found in cart."}, 404)

        _recalc(cart)
        return _json({"success": True, "cart": cart})

    if request.method == "POST" and path.endswith("/session"):
        session_id = body.get("sessionId")
        if not session_id:
            return _json({"error": "sessionId is required"}, 400)

        SESSIONS[session_id] = {
            "name": body.get("name", ""),
            "phone": body.get("phone", ""),
            "location": body.get("location", ""),
        }
        logging.info("Saved session %s", session_id)
        return _json({"success": True, "session": SESSIONS[session_id]})

    session_match = re.search(r"/session/([^/]+)$", path)
    if request.method == "GET" and session_match:
        session_id = session_match.group(1)
        session = SESSIONS.get(session_id)
        if not session:
            return _json({"error": f"No session found for '{session_id}'."}, 404)
        return _json({"success": True, "session": session})

    return _json({"error": f"Route not found: {request.method} {path}"}, 404)