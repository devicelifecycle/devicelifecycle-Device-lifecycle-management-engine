#!/usr/bin/env python3
"""
Merge duplicate devices in device_catalog and consolidate competitor_prices.
Keeps the SKU'd (seeded) device, moves prices from scraper-created duplicates.
"""
import json, urllib.request, re, os, sys
from collections import defaultdict
from pathlib import Path
# Load env manually
env_path = Path(__file__).resolve().parent.parent / '.env.local'
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip())

url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
if not url or not key:
    print('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    sys.exit(1)

base_headers = {'apikey': key, 'Authorization': f'Bearer {key}'}

def api_get(path):
    req = urllib.request.Request(f'{url}/rest/v1/{path}', headers=base_headers)
    return json.loads(urllib.request.urlopen(req).read())

def api_patch(path, data):
    h = {**base_headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}
    req = urllib.request.Request(f'{url}/rest/v1/{path}', data=json.dumps(data).encode(), headers=h, method='PATCH')
    urllib.request.urlopen(req)

def api_delete(path):
    req = urllib.request.Request(f'{url}/rest/v1/{path}', headers=base_headers, method='DELETE')
    urllib.request.urlopen(req)

# Fetch all devices
print('Fetching all devices...')
all_devices = []
for offset in range(0, 2000, 500):
    batch = api_get(f'device_catalog?select=id,make,model,sku,category,is_active&is_active=eq.true&order=id&offset={offset}&limit=500')
    all_devices.extend(batch)
    if len(batch) < 500: break
print(f'Total active devices: {len(all_devices)}')

# Normalize model names for duplicate detection
def normalize_model(make, model):
    m = model.lower().strip()
    m = m.replace('\u2033', '"').replace('\u201c', '"').replace('\u201d', '"').replace('\u2019', "'")
    # MacBook: "MacBook Air 13" (2020)" -> "macbook air 13"
    m = re.sub(r'macbook\s+(air|pro)\s+(\d+)["\']?\s*(?:-inch)?\s*\([^)]*\)', r'macbook \1 \2', m)
    m = re.sub(r'macbook\s+(air|pro)\s+(\d+)-inch\s*\([^)]*\)', r'macbook \1 \2', m)
    # Mac Mini/Studio/Pro
    m = re.sub(r'mac\s+(mini|studio|pro)\s*\([^)]*\)', r'mac \1', m)
    # iMac
    m = re.sub(r'imac\s+[\d.]+-inch\s*\([^)]*\)', r'imac', m)
    # iPad: normalize various formats
    m = re.sub(r'ipad\s+(\d+)\s+[\d.]+\s*\(\d{4}\).*', r'ipad \1', m)
    m = re.sub(r'ipad\s+(\d+)(?:th|rd|st|nd)\s+gen.*', r'ipad \1', m)
    m = re.sub(r'ipad\s*\((\d+)(?:th|rd|st|nd)\s+generation\)', r'ipad \1', m)
    m = re.sub(r'ipad\s+(air|mini|pro)\s+(\d+)\s+[\d.]+\s*\(\d{4}\).*', r'ipad \1 \2', m)
    m = re.sub(r'ipad\s+(air|mini)\s*\((\d+)(?:th|rd|st|nd)\s+generation\)', r'ipad \1 \2', m)
    m = re.sub(r'ipad\s+(air|mini)\s+(\d+)\s+m\d+\s*\(\d{4}\)', r'ipad \1 \2', m)
    m = re.sub(r'ipad\s+(pro)\s+([\d.]+)\s*\(.*\)', r'ipad pro \2', m)
    m = re.sub(r'ipad\s+(pro)\s+([\d.]+)-inch\s*\([^)]*\)', r'ipad pro \2', m)
    m = re.sub(r'ipad\s+(air)\s+([\d]+)-inch\s*\([^)]*\)', r'ipad air \2', m)
    # Watch: "Series 10 (42MM)" -> "watch series 10"
    m = re.sub(r'(?:apple\s+watch\s+)?series\s+(\w+)\s*(?:\([^)]*\))?', r'watch series \1', m)
    m = re.sub(r'(?:apple\s+watch\s+)?se\s*\(([^)]*)\)', r'watch se', m)
    m = re.sub(r'(?:apple\s+watch\s+)?ultra\s*(?:\d*)?\s*(?:\([^)]*\))?', r'watch ultra', m)
    m = re.sub(r'apple\s+watch\s+series\s+(\w+)', r'watch series \1', m)
    m = re.sub(r'apple\s+watch\s+se', r'watch se', m)
    m = re.sub(r'apple\s+watch\s+ultra\s*(\d*)', r'watch ultra \1', m)
    # iPhone
    m = re.sub(r'iphone\s+se\s*\((\d+)(?:th|rd|st|nd)\s+gen(?:eration)?\)', r'iphone se \1', m)
    # Pixel: normalize case for a/A
    m = re.sub(r'pixel\s+(\d+)\s*a\b', r'pixel \1a', m, flags=re.IGNORECASE)
    # Galaxy
    m = re.sub(r'galaxy\s+(s\d+)\s*fe\b', r'galaxy \1 fe', m, flags=re.IGNORECASE)
    # Remove extra spaces
    m = re.sub(r'\s+', ' ', m).strip()
    return m

# Group by normalized name
groups = defaultdict(list)
for d in all_devices:
    norm = normalize_model(d['make'], d['model'])
    groups[(d['make'], norm)].append(d)

dup_groups = {k: v for k, v in groups.items() if len(v) > 1}
print(f'Duplicate groups found: {len(dup_groups)}')

# Build merge plan
total_to_deactivate = 0
merge_plan = []
for (make, norm), devices in sorted(dup_groups.items()):
    with_sku = [d for d in devices if d.get('sku')]
    without_sku = [d for d in devices if not d.get('sku')]

    if with_sku:
        keep = with_sku[0]
        remove = [d for d in devices if d['id'] != keep['id']]
    else:
        keep = devices[0]
        remove = devices[1:]

    if remove:
        merge_plan.append({'keep': keep, 'remove': remove, 'norm': norm})
        total_to_deactivate += len(remove)

print(f'Will merge {total_to_deactivate} duplicate devices into {len(merge_plan)} canonical devices\n')

# Execute
prices_moved = 0
devices_deactivated = 0
errors = []

for i, plan in enumerate(merge_plan):
    keep = plan['keep']
    keep_id = keep['id']

    for dup in plan['remove']:
        dup_id = dup['id']

        # Move competitor_prices
        try:
            api_patch(f'competitor_prices?device_id=eq.{dup_id}', {'device_id': keep_id})
        except urllib.error.HTTPError as e:
            # Unique constraint violation — delete the dup prices (redundant)
            if e.code == 409:
                try:
                    api_delete(f'competitor_prices?device_id=eq.{dup_id}')
                except:
                    pass
            else:
                errors.append(f'prices {dup_id}: {e}')

        # Move other references
        for table in ['order_items', 'market_prices', 'pricing_tables', 'trained_pricing_baselines']:
            try:
                api_patch(f'{table}?device_id=eq.{dup_id}', {'device_id': keep_id})
            except urllib.error.HTTPError as e:
                if e.code == 409:
                    try:
                        api_delete(f'{table}?device_id=eq.{dup_id}')
                    except:
                        pass

        # Deactivate duplicate
        try:
            api_patch(f'device_catalog?id=eq.{dup_id}', {'is_active': False})
            devices_deactivated += 1
        except Exception as e:
            errors.append(f'deactivate {dup_id}: {e}')

    if (i + 1) % 20 == 0:
        print(f'  Processed {i+1}/{len(merge_plan)} groups...')

print(f'\n=== RESULTS ===')
print(f'Devices deactivated: {devices_deactivated}')
if errors:
    print(f'Errors: {len(errors)}')
    for e in errors[:10]:
        print(f'  {e}')

# Verify
print('\n=== VERIFICATION ===')
remaining = api_get('device_catalog?select=id&is_active=eq.true')
print(f'Active devices remaining: {len(remaining)}')

# Check a few key devices
for sku, name in [('APL-IP15PRO', 'iPhone 15 Pro'), ('SMS-S24ULTRA', 'Galaxy S24 Ultra'), ('GOO-PX9', 'Pixel 9')]:
    devs = api_get(f'device_catalog?select=id&sku=eq.{sku}&limit=1')
    if devs:
        prices = api_get(f'competitor_prices?select=competitor_name&device_id=eq.{devs[0]["id"]}&limit=100')
        comps = set(p['competitor_name'] for p in prices)
        print(f'  {name}: {len(prices)} prices from {comps}')
    else:
        print(f'  {name}: device not found!')

# Also clean up condition-as-storage and junk prices
print('\n=== CLEANING JUNK DATA ===')
# Delete prices < $5 (accessories, wrong matches)
try:
    api_delete('competitor_prices?trade_in_price=lt.5&trade_in_price=gt.0')
    print('Deleted trade-in prices < $5')
except Exception as e:
    print(f'Error deleting junk prices: {e}')

# Delete condition-as-storage entries
for bad_storage in ['GOOD', 'FAIR', 'LIKENEW', 'BROKEN', 'EXCELLENT']:
    try:
        api_delete(f'competitor_prices?storage=eq.{bad_storage}')
        print(f'Deleted entries with storage="{bad_storage}"')
    except:
        pass

print('\nDone!')
