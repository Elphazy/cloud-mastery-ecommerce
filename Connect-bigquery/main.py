import os
import sqlalchemy
import decimal
import datetime
from google.cloud.sql.connector import Connector, IPTypes
from google.cloud import bigquery
import functions_framework

# Configuration (provided via Cloud Function runtime env vars)
PROJECT_ID = os.environ.get("BQ_PROJECT") or os.environ.get("GCP_PROJECT_ID")
DATASET_ID = os.environ.get("BQ_DATASET", "cloud_mastery")
INSTANCE_CONNECTION_NAME = os.environ.get("CLOUDSQL_INSTANCE_CONNECTION_NAME")
DB_NAME = os.environ.get("DB_NAME")
DB_USER = os.environ.get("DB_USER")
DB_PASS = os.environ.get("DB_PASSWORD")

# Comma-separated list of source tables to sync from MySQL to BigQuery.
TABLES = [
    t.strip()
    for t in os.environ.get(
        "CONNECT_BIGQUERY_TABLES",
        "table_parts_catalog,table_finance,orders,order_details,customers,products",
    ).split(",")
    if t.strip()
]

# Global pool variable
db_pool = None


def _validate_config():
    missing = [
        name
        for name, value in [
            ("BQ_PROJECT or GCP_PROJECT_ID", PROJECT_ID),
            ("CLOUDSQL_INSTANCE_CONNECTION_NAME", INSTANCE_CONNECTION_NAME),
            ("DB_NAME", DB_NAME),
            ("DB_USER", DB_USER),
            ("DB_PASSWORD", DB_PASS),
        ]
        if not value
    ]
    if missing:
        raise RuntimeError("Missing required environment variables: " + ", ".join(missing))


def _safe_table_name(name):
    if not name.replace("_", "").isalnum():
        raise ValueError(f"Invalid table name: {name}")
    return name

def get_db_pool():
    global db_pool
    if db_pool is None:
        _validate_config()
        # Initialize Connector
        connector = Connector(ip_type=IPTypes.PUBLIC)
        
        def getconn():
            return connector.connect(
                INSTANCE_CONNECTION_NAME,
                "pymysql",
                user=DB_USER,
                password=DB_PASS,
                db=DB_NAME
            )
        # Create SQLAlchemy engine with pooling
        db_pool = sqlalchemy.create_engine("mysql+pymysql://", creator=getconn)
    return db_pool

def serialize_data(obj):
    """Handles non-JSON compatible types for BigQuery load_table_from_json."""
    if isinstance(obj, list): return [serialize_data(i) for i in obj]
    if isinstance(obj, dict): return {k: serialize_data(v) for k, v in obj.items()}
    if isinstance(obj, decimal.Decimal): return float(obj)
    if isinstance(obj, (datetime.datetime, datetime.date)): return obj.isoformat()
    return obj

@functions_framework.http
def sync_mysql_to_bq(request):
    try:
        _validate_config()
        pool = get_db_pool()
        bq_client = bigquery.Client(project=PROJECT_ID)
        
        for table_name in TABLES:
            safe_table = _safe_table_name(table_name)
            # 1. Fetch data from Cloud SQL
            query = f"SELECT * FROM `{safe_table}`"
            with pool.connect() as conn:
                result = conn.execute(sqlalchemy.text(query))
                rows = serialize_data([dict(row._mapping) for row in result])

            table_ref = f"{PROJECT_ID}.{DATASET_ID}.{safe_table}"
            job_config = bigquery.LoadJobConfig(
                write_disposition="WRITE_TRUNCATE", 
                autodetect=True
            )
            
            if rows:
                load_job = bq_client.load_table_from_json(rows, table_ref, job_config=job_config)
                load_job.result()  # Wait for completion
                print(f"Successfully synced {safe_table}")
            else:
                print(f"Table {safe_table} is empty, skipping.")

        return "All tables synced to BigQuery successfully.", 200

    except Exception as e:
        print(f"Error during sync: {str(e)}")
        return f"Internal Error: {str(e)}", 500