# Virtual DocTypes

> Adopted from [lubusIN/frappe-skills](https://github.com/lubusIN/frappe-skills) (MIT) — `doctype-development/references/virtual-doctypes.md`.

## Overview
Virtual DocTypes (v13+) allow you to create DocTypes that don't store data in a database table. Instead, data is fetched from external sources like APIs, files, or other databases.

## When to Use Virtual DocTypes

- Display data from external APIs
- Connect to secondary databases
- Read from files (JSON, CSV)
- Create computed/aggregated views
- Integrate with external systems without data duplication

## Creating a Virtual DocType

### 1. Define the DocType
```json
{
  "doctype": "DocType",
  "name": "External Product",
  "module": "My App",
  "is_virtual": 1,
  "fields": [
    {
      "fieldname": "product_id",
      "fieldtype": "Data",
      "label": "Product ID",
      "in_list_view": 1
    },
    {
      "fieldname": "product_name",
      "fieldtype": "Data",
      "label": "Product Name",
      "in_list_view": 1
    },
    {
      "fieldname": "price",
      "fieldtype": "Currency",
      "label": "Price",
      "in_list_view": 1
    },
    {
      "fieldname": "stock",
      "fieldtype": "Int",
      "label": "Stock"
    }
  ]
}
```

**Key Setting:** `"is_virtual": 1`

### 2. Implement the Controller

```python
## my_app/doctype/external_product/external_product.py
import frappe
from frappe.model.document import Document
import requests

class ExternalProduct(Document):
    @staticmethod
    def get_list(**kwargs):
        """Return list of documents for list view. (v16 signature — see note below.)"""
        products = fetch_from_api()

        # Apply filters if provided
        if kwargs.get("filters"):
            products = apply_filters(products, kwargs["filters"])

        # Apply pagination
        start = kwargs.get("start", 0)
        page_length = kwargs.get("page_length", 20)
        products = products[start:start + page_length]

        return products

    @staticmethod
    def get_count(**kwargs):
        """Return total count for pagination."""
        products = fetch_from_api()
        if kwargs.get("filters"):
            products = apply_filters(products, kwargs["filters"])
        return len(products)

    @staticmethod
    def get_stats(**kwargs):
        """Return stats for sidebar."""
        return {}

def fetch_from_api():
    """Fetch products from external API."""
    cache_key = "external_products_list"
    cached = frappe.cache().get_value(cache_key)
    
    if cached:
        return cached
    
    try:
        response = requests.get(
            "https://api.example.com/products",
            headers={"Authorization": f"Bearer {get_api_key()}"},
            timeout=10
        )
        response.raise_for_status()
        products = response.json()
        
        # Cache for 5 minutes
        frappe.cache().set_value(cache_key, products, expires_in_sec=300)
        return products
        
    except requests.RequestException as e:
        frappe.log_error(f"External API error: {e}")
        return []

def apply_filters(products, filters):
    """Apply Frappe-style filters to product list."""
    result = products
    for f in filters:
        field, op, value = f[0], f[1], f[2] if len(f) > 2 else f[1]
        if op == "=":
            result = [p for p in result if p.get(field) == value]
        elif op == "like":
            value = value.replace("%", "")
            result = [p for p in result if value.lower() in str(p.get(field, "")).lower()]
    return result

def get_api_key():
    return frappe.db.get_single_value("My Settings", "api_key")
```

## Required Methods

`validate_controller` (`frappe/model/virtual_doctype.py`) checks at doctype-load time that
`get_list`, `get_count`, `get_stats` are `@staticmethod`s and that `db_insert`, `db_update`,
`load_from_db`, `delete` are overridden from `Document` — printing a `msgprint` warning
(not a hard error) if any are missing.

**(v16) Signature change**: the `VirtualDoctype` protocol takes `**kwargs`, not a single
positional `args` dict (v15 was `get_list(args)` / `get_count(args)` / `get_stats(args)`).
Callers (`frappe/desk/reportview.py`, `frappe/model/db_query.py`) build one `args` dict and
invoke `frappe.call(controller.get_list, args=that_dict, **that_dict)` — `frappe.call` uses
`get_newargs()` to match the callee's parameters, so a v16 `**kwargs` signature receives both
the whole dict under the key `args` and every individual key (`filters`, `fields`, `start`,
`page_length`, `order_by`, `doctype`, ...) spread as kwargs. A v15-style `def get_list(args):`
still works unchanged in v16 (`get_newargs` filters kwargs down to the one parameter named
`args`), but new code should use `**kwargs` to match the current `Protocol`.

### get_list(**kwargs)
Returns list of documents. Called for list view, `frappe.get_list()`, and REST `GET /api/resource/<doctype>`.

```python
@staticmethod
def get_list(**kwargs):
    """
    kwargs contains (among others):
    - filters: List of filter conditions
    - fields: List of fields to return
    - start: Pagination start index
    - page_length: Number of records
    - order_by: Sort field and direction
    - args: the same values collected into one dict, for v15-style code
    """
    return [
        {"name": "PROD-001", "product_name": "Widget", "price": 99.99},
        {"name": "PROD-002", "product_name": "Gadget", "price": 149.99}
    ]
```

### get_count(**kwargs)
Returns total count for pagination.

```python
@staticmethod
def get_count(**kwargs):
    return 100  # Total records
```

### get_stats(**kwargs)
Returns statistics for sidebar filters. Called with `stats` and `filters` keys.

```python
@staticmethod
def get_stats(**kwargs):
    return {
        "status": {"Active": 50, "Inactive": 30}
    }
```

## Loading Single Documents

For viewing individual documents:

```python
class ExternalProduct(Document):
    def load_from_db(self):
        """Load document from external source."""
        product_id = self.name
        product = fetch_single_product(product_id)

        if not product:
            frappe.throw(_("Product not found"))

        # Set document attributes
        self.product_id = product["id"]
        self.product_name = product["name"]
        self.price = product["price"]
        self.stock = product["stock"]

    def db_insert(self, *args, **kwargs):
        """Create in external source. `Document.insert()` always calls this as
        `self.db_insert(ignore_if_duplicate=...)` — a bare `def db_insert(self):`
        raises TypeError. Accept `*args, **kwargs` even if unused."""
        create_product_in_api(self.as_dict())

    def db_update(self):
        """Update in external source. Called with no arguments."""
        update_product_in_api(self.name, self.as_dict())

    def delete(self):
        """Delete from external source. `frappe.delete_doc` calls this directly for
        virtual doctypes and skips `on_trash`/`on_change`/`after_delete` entirely
        (`frappe/model/delete_doc.py`) — run any cleanup here, not in `on_trash`."""
        delete_product_from_api(self.name)

def fetch_single_product(product_id):
    response = requests.get(f"https://api.example.com/products/{product_id}")
    if response.status_code == 200:
        return response.json()
    return None
```

`frappe.delete_doc` also refuses to run at all if `delete()` is not overridden — it raises
`"{doctype} is a Virtual DocType and must implement its own delete() method."` when the
controller still uses the base `Document.delete` (which would otherwise recurse into
`frappe.delete_doc` and loop).

## Virtual DocType from Database

Connect to a secondary database:

```python
import pymysql

class ExternalCustomer(Document):
    @staticmethod
    def get_list(args):
        conn = get_secondary_db()
        try:
            with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                sql = "SELECT id as name, name as customer_name, email FROM customers"
                
                values = []
                if args.get("filters"):
                    where_clauses = []
                    for f in args["filters"]:  # whitelist f[0] against known columns
                        where_clauses.append(f"{f[0]} = %s")
                        values.append(f[-1])
                    sql += " WHERE " + " AND ".join(where_clauses)

                sql += " LIMIT %s, %s"
                values += [int(args.get("start", 0)), int(args.get("page_length", 20))]
                cursor.execute(sql, values)
                return cursor.fetchall()
        finally:
            conn.close()

def get_secondary_db():
    config = frappe.get_single("External DB Config")
    return pymysql.connect(
        host=config.host,
        user=config.user,
        password=config.get_password("password"),
        database=config.database
    )
```

## Virtual DocType from File

Read from JSON/CSV files:

```python
import json
import csv

class FileBasedProduct(Document):
    @staticmethod
    def get_list(args):
        file_path = frappe.get_site_path("private", "products.json")
        
        with open(file_path) as f:
            products = json.load(f)
        
        # Add name field for Frappe compatibility
        for p in products:
            p["name"] = p.get("id", p.get("sku"))
        
        return products
    
    def load_from_db(self):
        products = self.get_list({})
        for p in products:
            if p["name"] == self.name:
                for key, value in p.items():
                    setattr(self, key, value)
                return
        frappe.throw(_("Product not found"))
```

## Caching Strategies

### Time-Based Cache
```python
def fetch_with_cache():
    cache_key = "virtual_doctype_data"
    data = frappe.cache().get_value(cache_key)
    
    if data is None:
        data = expensive_fetch()
        frappe.cache().set_value(cache_key, data, expires_in_sec=600)
    
    return data
```

### Invalidation-Based Cache
```python
def fetch_with_version_cache():
    version = frappe.cache().get_value("data_version") or 0
    cache_key = f"virtual_data_v{version}"
    
    data = frappe.cache().get_value(cache_key)
    if data is None:
        data = expensive_fetch()
        frappe.cache().set_value(cache_key, data)
    
    return data

def invalidate_cache():
    """Call when external data changes."""
    current = frappe.cache().get_value("data_version") or 0
    frappe.cache().set_value("data_version", current + 1)
```

## Limitations

- No automatic indexing
- No database-level filtering/sorting (must implement in code)
- No transactions across virtual and real DocTypes
- Links to Virtual DocTypes need manual handling
- Report Builder may not work (use Script Reports)
- Child tables (`Table`/`TableMultiSelect` fields) are never auto-persisted — `Document.insert()`
  skips the children `db_insert()` loop entirely for virtual doctypes (`frappe/model/document.py`);
  serialize/restore child rows yourself inside `db_insert`/`db_update`/`load_from_db`

## Best Practices

1. **Always cache external calls** — Avoid hitting APIs on every request
2. **Implement pagination** — Don't fetch all records at once
3. **Handle errors gracefully** — Return empty lists, not exceptions
4. **Use timeouts** — Set reasonable timeouts for external calls
5. **Log errors** — Use `frappe.log_error()` for debugging
6. **Validate on write** — If supporting writes, validate before sending

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/model/virtual_doctype.py` — `VirtualDoctype` Protocol (`get_list`/`get_count`/`get_stats` `**kwargs`), `validate_controller` (msgprint warning, not a hard error, for missing static/instance methods)
- `apps/frappe/frappe/model/db_query.py:209-225` — `is_virtual_doctype` dispatch, `frappe.call(controller.get_list, args=kwargs, **kwargs)`
- `apps/frappe/frappe/desk/reportview.py:34-68,764-769` — `get_list`/`get_count`/`get_stats` dispatch (`get_stats` called with `{"stats": stats, "filters": filters}`)
- `apps/frappe/frappe/model/document.py:342-343,438-502,648-651` — `insert()` skips the children `db_insert()` loop entirely for virtual doctypes; `db_insert` called as `self.db_insert(ignore_if_duplicate=...)`
- `apps/frappe/frappe/model/delete_doc.py:86-106` — virtual-doctype delete path: `frappe.throw` if `delete()` isn't overridden, otherwise calls `doc.delete()` and `continue`s, skipping `on_trash`/`on_change`/`after_delete`
- `apps/frappe/frappe/__init__.py:1140-1168` — `frappe.call`/`get_newargs` kwarg-matching used for the `**kwargs` vs. legacy positional `args` dict compatibility
