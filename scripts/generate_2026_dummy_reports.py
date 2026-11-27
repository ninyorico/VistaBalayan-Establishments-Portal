#!/usr/bin/env python3
"""Generate the authorized 2026 synthetic tourism scenario dataset.

Default is a read-only dry run. Use --apply --confirm-authorized-2026-dummy-data
only after reviewing the dry-run manifest. Use --rollback BACKUP_DIR to restore
original 2026 rows and remove rows inserted by this generator.
"""
from __future__ import annotations

import argparse
import calendar
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
BACKUP_ROOT = ROOT / ".hermes" / "backups"
SEED = "vistabalayan-2026-corrective-scenario-v1"
MARKER = "Hermes corrective synthetic 2026"
OFFICIAL_STATUSES = {"submitted", "validated", "approved"}


def load_env():
    for path in (ROOT / ".env", ROOT / ".hermes" / "production.env"):
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            if raw.startswith("SUPABASE_URL=") or raw.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                key, value = raw[1:].split("=", 1)
                if value and value != "[SENSITIVE]":
                    os.environ[key] = value
        if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
            return
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required locally")


def supabase_client():
    load_env()
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return base, {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def request_json(base, headers, method, path, payload=None, params=None, prefer=None):
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    request_headers = dict(headers)
    if prefer:
        request_headers["Prefer"] = prefer
    request = urllib.request.Request(f"{base}/rest/v1/{path}{query}", data=body, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase {method} {path} failed ({error.code}): {detail[:500]}") from error


def fetch_all(base, headers, table, select="*", order="id.asc"):
    rows = []
    offset = 0
    while True:
        batch = request_json(base, headers, "GET", table, params={"select": select, "order": order, "limit": 1000, "offset": offset}) or []
        rows.extend(batch)
        if len(batch) < 1000:
            return rows
        offset += 1000


def parse_date(value):
    return date.fromisoformat(str(value)[:10])


def date_range(start, end):
    cursor = start
    while cursor <= end:
        yield cursor
        cursor += timedelta(days=1)


def stable_int(*parts):
    digest = hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()
    return int(digest[:12], 16)


def as_of_manila():
    return datetime.now(ZoneInfo("Asia/Manila")).date()


def cutoff_date(value):
    if value:
        return date.fromisoformat(value)
    # The execution environment is configured to the Asia/Manila task date.
    return as_of_manila()


def is_2026(row):
    d = parse_date(row["report_date"])
    return date(2026, 1, 1) <= d < date(2027, 1, 1)


def monthly_coverage(month, category):
    if category == "visitor":
        return {"02": 0.68, "06": 0.85, "11": 0.20}.get(month, 1.0)
    return 1.0


def include_day(establishment_id, day, category, cutoff):
    if day > cutoff:
        return False
    fraction = monthly_coverage(f"{day.month:02d}", category)
    if fraction >= 1:
        # One near-complete, not fully complete, establishment-level scenario.
        if category == "accommodation" and day.month == 9 and day.day == 1:
            return stable_int(SEED, establishment_id, category) % 7 != 0
        return True
    return stable_int(SEED, establishment_id, day.isoformat(), category) % 100 < round(fraction * 100)


def visitor_multiplier(month, establishment_id, visitor_ids):
    position = sorted(visitor_ids).index(establishment_id) if establishment_id in visitor_ids else 0
    selected_june = position < max(2, round(len(visitor_ids) * 0.65))
    selected_october = position < max(2, round(len(visitor_ids) * 0.25))
    return {
        1: 1.00, 2: 0.66, 3: 1.55, 4: 2.25, 5: 1.18,
        6: 0.46 if selected_june else 0.86,
        7: 0.55, 8: 0.58, 9: 1.38,
        10: 0.28 if selected_october else 1.04,
        11: 0.52, 12: 0.0,
    }[month]


def accommodation_multiplier(month, establishment_id, accommodation_ids):
    position = sorted(accommodation_ids).index(establishment_id) if establishment_id in accommodation_ids else 0
    selected_october = position == 0
    return {
        1: 1.00, 2: 0.92, 3: 1.10, 4: 1.18, 5: 0.96,
        6: 0.88, 7: 0.68, 8: 0.66, 9: 1.02,
        10: 0.42 if selected_october else 0.82,
        11: 0.55, 12: 0.0,
    }[month]


def build_visitor_payload(establishment, day, cutoff, visitor_ids):
    eid = establishment["id"]
    base_monthly = 1150 + stable_int(SEED, eid, "base") % 1350
    weekend = 1.20 if day.weekday() >= 5 else 0.92
    jitter = 0.90 + (stable_int(SEED, eid, day.isoformat(), "jitter") % 21) / 100
    value = max(1, round((base_monthly / 30) * visitor_multiplier(day.month, eid, visitor_ids) * weekend * jitter))
    male = round(value * (0.44 + (stable_int(SEED, eid, day.isoformat(), "sex") % 13) / 100))
    female = value - male
    origin = stable_int(SEED, eid, day.isoformat(), "origin") % 10
    if origin < 6:
        category, place = "THIS_PROVINCE", "Batangas"
    elif origin < 9:
        category, place = "OTHER_PROVINCE", "Manila"
    else:
        category, place = "FOREIGN", "Japan"
    return {
        "establishment_id": eid,
        "report_date": day.isoformat(),
        "status": "submitted",
        "total_male": male,
        "total_female": female,
        "total_guests": value,
        "male_visitors": male,
        "female_visitors": female,
        "total_visitors": value,
        "residence_category": category,
        "residence_type": category,
        "place_of_residence": place,
        "municipality": "Balayan" if category == "THIS_PROVINCE" else None,
        "province": "Batangas" if category != "FOREIGN" else None,
        "country": None if category != "FOREIGN" else "Japan",
        "notes": f"{MARKER}; seed={SEED}; cutoff={cutoff.isoformat()}",
    }


def build_accommodation_payload(establishment, day, cutoff, accommodation_ids):
    eid = establishment["id"]
    rooms = int(establishment.get("total_rooms") or 20)
    base_daily = 3 + stable_int(SEED, eid, "base") % max(4, min(12, rooms))
    weekend = 1.15 if day.weekday() >= 5 else 0.94
    jitter = 0.90 + (stable_int(SEED, eid, day.isoformat(), "jitter") % 21) / 100
    check_ins = max(1, round(base_daily * accommodation_multiplier(day.month, eid, accommodation_ids) * weekend * jitter))
    occupied = max(1, min(rooms, round(check_ins * 0.55)))
    nights = check_ins * (2 + stable_int(SEED, eid, day.isoformat(), "nights") % 2)
    return {
        "establishment_id": eid,
        "report_date": day.isoformat(),
        "status": "submitted",
        "total_rooms": rooms,
        "total_occupied_rooms": occupied,
        "rooms_occupied": occupied,
        "room_usage_count": check_ins,
        "total_check_ins": check_ins,
        "guest_check_ins": check_ins,
        "total_guest_nights": nights,
        "guest_nights": nights,
        "foreign_guest_check_ins": max(0, round(check_ins * 0.08)),
        "foreign_guest_nights": max(0, round(nights * 0.08)),
        "short_stay_check_ins": max(0, check_ins - round(check_ins * 0.2)),
        "notes": f"{MARKER}; seed={SEED}; cutoff={cutoff.isoformat()}",
    }


def prepare(base, headers, cutoff):
    establishments = [x for x in fetch_all(base, headers, "establishments", "id,name,reporting_mode,status,total_rooms", "id.asc") if x.get("status") == "active"]
    visitor_establishments = [x for x in establishments if x.get("reporting_mode") in ("visitor", "both")]
    accommodation_establishments = [x for x in establishments if x.get("reporting_mode") in ("accommodation", "both")]
    visitor_existing = [x for x in fetch_all(base, headers, "visitor_reports", "*", "id.asc") if is_2026(x)]
    accommodation_existing = [x for x in fetch_all(base, headers, "accommodation_reports", "*", "id.asc") if is_2026(x)]
    profiles = fetch_all(base, headers, "profiles", "id,establishment_id,role,status", "id.asc")
    profile_by_establishment = {}
    for profile in profiles:
        if profile.get("establishment_id") and profile.get("status", "active") == "active" and profile.get("role") in ("establishment_staff", "establishment_owner"):
            profile_by_establishment.setdefault(profile["establishment_id"], profile["id"])
    fallback_submitter = next((x.get("submitted_by") for x in visitor_existing + accommodation_existing if x.get("submitted_by")), None)
    if not fallback_submitter:
        fallback_submitter = next((x.get("id") for x in profiles if x.get("role") == "municipal_officer"), None)
    if not fallback_submitter:
        raise RuntimeError("No approved report submitter/profile was available")

    def existing_by_pair(rows):
        result = defaultdict(list)
        for row in rows:
            pair = (row["establishment_id"], str(row["report_date"])[:10])
            result[pair].append(row)
        return dict(result)

    visitor_existing_map = existing_by_pair(visitor_existing)
    accommodation_existing_map = existing_by_pair(accommodation_existing)
    visitor_target = {}
    accommodation_target = {}
    start = date(2026, 1, 1)
    end = min(date(2026, 12, 31), cutoff)
    for establishment in visitor_establishments:
        for day in date_range(start, end):
            if include_day(establishment["id"], day, "visitor", cutoff):
                visitor_target[(establishment["id"], day.isoformat())] = build_visitor_payload(establishment, day, cutoff, [x["id"] for x in visitor_establishments])
    for establishment in accommodation_establishments:
        for day in date_range(start, end):
            if include_day(establishment["id"], day, "accommodation", cutoff):
                accommodation_target[(establishment["id"], day.isoformat())] = build_accommodation_payload(establishment, day, cutoff, [x["id"] for x in accommodation_establishments])

    def split_total(total, rows, value_fields):
        weights = [max(0, float(next((row.get(field) for field in value_fields if row.get(field) is not None), 0) or 0)) for row in rows]
        weight_sum = sum(weights)
        if weight_sum <= 0:
            weights = [1.0] * len(rows)
            weight_sum = float(len(rows))
        parts = [int(total * weight / weight_sum) for weight in weights]
        for index in range(int(total) - sum(parts)):
            parts[index % len(parts)] += 1
        return parts

    def plan(target, existing, category):
        updates=[]; inserts=[]; removes=[]
        for pair, payload in target.items():
            old_rows = existing.get(pair, [])
            if old_rows:
                if category == "visitor":
                    values = split_total(payload["total_visitors"], old_rows, ("total_visitors", "total_guests"))
                    for old, value in zip(old_rows, values):
                        male = round(value * (payload["total_male"] / max(1, payload["total_visitors"])))
                        updates.append({**old, "total_male":male, "total_female":value-male, "total_guests":value, "male_visitors":male, "female_visitors":value-male, "total_visitors":value, "notes":payload["notes"], "status":"submitted"})
                else:
                    values = split_total(payload["total_check_ins"], old_rows, ("total_check_ins", "guest_check_ins"))
                    for old, value in zip(old_rows, values):
                        ratio = value / max(1, payload["total_check_ins"])
                        occupied = max(0, round(payload["total_occupied_rooms"] * ratio))
                        nights = max(0, round(payload["total_guest_nights"] * ratio))
                        updates.append({**old, "total_check_ins":value, "guest_check_ins":value, "total_occupied_rooms":occupied, "rooms_occupied":occupied, "room_usage_count":value, "total_guest_nights":nights, "guest_nights":nights, "short_stay_check_ins":min(value, round(value * 0.8)), "foreign_guest_check_ins":min(value, round(payload.get("foreign_guest_check_ins", 0) * ratio)), "foreign_guest_nights":min(nights, round(payload.get("foreign_guest_nights", 0) * ratio)), "notes":payload["notes"], "status":"submitted"})
            else:
                payload = dict(payload)
                payload["submitted_by"] = profile_by_establishment.get(pair[0], fallback_submitter)
                inserts.append(payload)
        eligible_ids = {item["id"] for item in (visitor_establishments if category == "visitor" else accommodation_establishments)}
        for pair, old_rows in existing.items():
            # Only rows for active eligible establishments are in the generated scenario scope.
            if pair not in target and pair[0] in eligible_ids:
                removes.extend(row["id"] for row in old_rows)
        return {"updates":updates,"inserts":inserts,"removes":removes}

    return {
        "cutoff": cutoff.isoformat(),
        "seed": SEED,
        "visitor": plan(visitor_target, visitor_existing_map, "visitor"),
        "accommodation": plan(accommodation_target, accommodation_existing_map, "accommodation"),
        "original_2026": {"visitor": visitor_existing, "accommodation": accommodation_existing},
        "establishments": establishments,
    }


def summarize(plan):
    summary = {"cutoff":plan["cutoff"],"seed":plan["seed"],"categories":{}}
    for category in ("visitor", "accommodation"):
        item=plan[category]
        summary["categories"][category]={"updates":len(item["updates"]),"inserts":len(item["inserts"]),"removes":len(item["removes"])}
        monthly=defaultdict(lambda:{"reports":0,"value":0})
        for payload in item["inserts"]:
            month=payload["report_date"][:7]
            monthly[month]["reports"]+=1
            monthly[month]["value"]+=payload.get("total_visitors", payload.get("total_check_ins", 0)) or 0
        # updates contain no report date; include generated monthly values from target is intentionally reported separately below.
        summary["categories"][category]["insert_months"]=dict(sorted(monthly.items()))
    return summary


def write_manifest(plan, path, summary):
    path.mkdir(parents=True, exist_ok=True)
    safe = {"backup_id":path.name,"seed":plan["seed"],"cutoff":plan["cutoff"],"summary":summary,"inserted_ids":[],"removed_ids":plan["visitor"]["removes"]+plan["accommodation"]["removes"]}
    (path/"generation_plan.json").write_text(json.dumps(safe, indent=2, sort_keys=True), encoding="utf-8")
    return safe


def apply_plan(base, headers, plan, manifest):
    def chunks(items, size=400):
        for index in range(0, len(items), size):
            yield items[index:index + size]

    for category, table in (("visitor", "visitor_reports"), ("accommodation", "accommodation_reports")):
        item=plan[category]
        for updates in chunks(item["updates"]):
            request_json(base, headers, "POST", table, updates, {"on_conflict":"id"}, "resolution=merge-duplicates,return=minimal")
        for inserts in chunks(item["inserts"]):
            created = request_json(base, headers, "POST", table, inserts, None, "return=representation")
            if isinstance(created, list): manifest["inserted_ids"].extend([row.get("id") for row in created if row.get("id")])
        for removed in chunks(item["removes"]):
            request_json(base, headers, "DELETE", table, None, {"id":f"in.({','.join(removed)})"}, "return=minimal")
    return manifest


def rollback(base, headers, backup_dir):
    backup=Path(backup_dir)
    manifest=json.loads((backup/"generation_plan.json").read_text(encoding="utf-8"))
    for table, filename in (("visitor_reports","visitor_reports_2026.json"),("accommodation_reports","accommodation_reports_2026.json")):
        rows=json.loads((backup/filename).read_text(encoding="utf-8"))
        for index in range(0, len(rows), 400):
            request_json(base, headers, "POST", table, rows[index:index + 400], {"on_conflict":"id"}, "resolution=merge-duplicates,return=minimal")
    for table in ("visitor_reports", "accommodation_reports"):
        inserted=manifest.get("inserted_ids", [])
        for index in range(0, len(inserted), 400):
            request_json(base, headers, "DELETE", table, None, {"id":f"in.({','.join(inserted[index:index + 400])})"}, "return=minimal")
    print(json.dumps({"rolled_back":str(backup),"restored_rows":sum(len(json.loads((backup/f).read_text(encoding="utf-8"))) for f in ("visitor_reports_2026.json","accommodation_reports_2026.json"))}))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--as-of")
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--confirm-authorized-2026-dummy-data",action="store_true")
    parser.add_argument("--rollback")
    parser.add_argument("--backup-dir")
    args=parser.parse_args()
    base,headers=supabase_client()
    if args.rollback:
        rollback(base,headers,args.rollback); return
    cutoff=cutoff_date(args.as_of)
    if cutoff < date(2026,1,1): raise SystemExit("--as-of must be in 2026")
    plan=prepare(base,headers,cutoff)
    backup_dir=Path(args.backup_dir) if args.backup_dir else BACKUP_ROOT/f"2026-corrective-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    if args.apply and not backup_dir.exists():
        raise SystemExit(f"Backup directory does not exist: {backup_dir}")
    summary=summarize(plan)
    manifest=write_manifest(plan,backup_dir,summary)
    print(json.dumps(summary,indent=2))
    print(f"plan={backup_dir}")
    if not args.apply: return
    if not args.confirm_authorized_2026_dummy_data: raise SystemExit("Refusing to write without --confirm-authorized-2026-dummy-data")
    manifest=apply_plan(base,headers,plan,manifest)
    (backup_dir/"generation_plan.json").write_text(json.dumps(manifest,indent=2,sort_keys=True),encoding="utf-8")
    print(json.dumps({"applied":True,"backup":str(backup_dir),"inserted":len(manifest["inserted_ids"]),"removed":len(manifest["removed_ids"])}))

if __name__ == "__main__":
    main()
