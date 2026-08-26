#!/usr/bin/env python3
"""Regenerate demo/expected_analysis_example.json from demo_company.csv."""

import json
import copy
from pathlib import Path
from fastapi.testclient import TestClient

# Change to the api directory for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.main import app

def regen_demo():
    """Regenerate the demo analysis JSON."""
    client = TestClient(app)
    demo_dir = Path(__file__).parent.parent / "demo"
    demo_file = demo_dir / "demo_company.csv"
    output_file = demo_dir / "expected_analysis_example.json"

    # Step 1: Upload the demo CSV
    with open(demo_file, "rb") as f:
        upload_resp = client.post(
            "/api/upload",
            files={"file": ("demo_company.csv", f, "text/csv")}
        )

    if upload_resp.status_code != 200:
        print(f"Upload failed: {upload_resp.status_code} - {upload_resp.text}")
        return False

    upload_id = upload_resp.json()["upload_id"]
    print(f"Upload successful: {upload_id}")

    # Step 2: Extract the data
    extract_resp = client.post(
        "/api/extract",
        json={"upload_id": upload_id}
    )

    if extract_resp.status_code != 200:
        print(f"Extract failed: {extract_resp.status_code} - {extract_resp.text}")
        return False

    extracted = extract_resp.json()
    print(f"Extraction successful")

    # Step 3: Prepare analysis request
    vals = copy.deepcopy(extracted["values"])
    prev = copy.deepcopy(extracted["previous_values"])
    analysis_request = {
        "upload_id": extracted["upload_id"],
        "industry": "manufacturing",
        "currency": extracted["currency"],
        "scale": extracted["scale"],
        "latest_period": extracted["latest_period"],
        "previous_period": extracted["previous_period"],
        "audited": extracted["audited"],
        "values": vals,
        "previous_values": prev,
    }

    # Step 4: Run analysis
    analyze_resp = client.post("/api/analyze", json=analysis_request)

    if analyze_resp.status_code != 200:
        print(f"Analysis failed: {analyze_resp.status_code} - {analyze_resp.text}")
        return False

    analysis = analyze_resp.json()
    print(f"Analysis successful")
    print(f"  Overall score: {analysis['overall_score']}")
    print(f"  Health label: {analysis['health_label']}")

    # Check risk_radar
    if "risk_radar" in analysis:
        rr = analysis["risk_radar"]
        print(f"  Risk radar keys: {list(rr.keys())}")
        if "piotroski" in rr and rr["piotroski"]:
            p = rr["piotroski"]
            print(f"    Piotroski score: {p.get('score')}/{p.get('max_score')}")
        if "beneish" in rr and rr["beneish"]:
            b = rr["beneish"]
            print(f"    Beneish m_score: {b.get('m_score')}")
            if b.get('substituted'):
                print(f"    Beneish substituted: {b.get('substituted')}")

    # Check benchmark sources
    benchmark_sources = set()
    for ratio in analysis.get("ratios", []):
        if ratio.get("benchmark") and ratio["benchmark"].get("source"):
            benchmark_sources.add(ratio["benchmark"]["source"])

    if benchmark_sources:
        print(f"  Benchmark sources found: {benchmark_sources}")
    else:
        print(f"  Note: No benchmark sources found in ratios")

    # Step 5: Save the analysis to JSON
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(analysis, f, indent=2, ensure_ascii=False)

    print(f"\nDemanded analysis saved to {output_file}")
    return True

if __name__ == "__main__":
    success = regen_demo()
    sys.exit(0 if success else 1)
