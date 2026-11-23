"""Gera zonas.json: zoneamento vigente (Lei 18.081/24) de cada lote com 400 m² ou mais, via WFS do GeoSampa.

Uso:  uv run --no-project --with shapely python zona.py
Depois rode prep.py, que lê zonas.json e grava a coluna de zoneamento em terrenos.json.
Chaves: "SSSQQQLLLL" (setor+quadra+lote) e "SSSQQQC01" (setor+quadra+condomínio, lote 0000).
"""
import json, time, urllib.parse, urllib.request
import shapely
from shapely.geometry import shape

WFS = "https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs"
PAGE = 10000
MIN_FRAC = 0.10  # zona entra na lista se cobre ao menos 10% do lote


def baixar(layer, props, filtro=None):
    feats, start = [], 0
    while True:
        q = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": f"geoportal:{layer}",
             "outputFormat": "application/json", "propertyName": props, "sortBy": "cd_identificador",
             "count": PAGE, "startIndex": start}
        if filtro:
            q["CQL_FILTER"] = filtro
        for tent in range(5):
            try:
                with urllib.request.urlopen(WFS + "?" + urllib.parse.urlencode(q), timeout=300) as r:
                    page = json.load(r)["features"]
                break
            except Exception as e:
                if tent == 4:
                    raise
                print("  erro, tentando de novo:", e)
                time.sleep(5 * (tent + 1))
        feats += page
        print(f"  {layer}: {len(feats):,}")
        if len(page) < PAGE:
            return feats
        start += PAGE


print("Baixando zoneamento...")
zf = baixar("perimetro_zona_lei_18081_24", "cd_zoneamento_perimetro,ge_multipoligono")
zgeo = shapely.make_valid(shapely.from_geojson([json.dumps(f["geometry"]) for f in zf]))
znome = [f["properties"]["cd_zoneamento_perimetro"] or "?" for f in zf]

print("Baixando lotes...")
lf = baixar("lote_cidadao", "cd_setor_fiscal,cd_quadra_fiscal,cd_lote,cd_condominio,ge_poligono",
            "qt_area_terreno>=400 AND cd_situacao=1")
lf = [f for f in lf if f["geometry"]]
lgeo = shapely.make_valid(shapely.from_geojson([json.dumps(f["geometry"]) for f in lf]))

print("Cruzando...")
li, zi = shapely.STRtree(zgeo).query(lgeo, predicate="intersects")
area = shapely.area(shapely.intersection(lgeo[li], zgeo[zi]))
por_lote = {}
for a, b, ar in zip(li, zi, area):
    d = por_lote.setdefault(a, {})
    d[znome[b]] = d.get(znome[b], 0) + ar

out = {}
for a, d in por_lote.items():
    tot = shapely.area(lgeo[a]) or 1
    zonas = [z for z, ar in sorted(d.items(), key=lambda x: -x[1]) if ar / tot >= MIN_FRAC] or [max(d, key=d.get)]
    p = lf[a]["properties"]
    cond = (p["cd_condominio"] or "00")
    k = p["cd_setor_fiscal"] + p["cd_quadra_fiscal"] + (("C" + cond) if cond != "00" and p["cd_lote"] == "0000" else p["cd_lote"])
    out[k] = " / ".join(zonas)

with open("zonas.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print(f"{len(out):,} lotes com zoneamento gravados em zonas.json.")
